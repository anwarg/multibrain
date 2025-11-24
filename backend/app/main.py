import os
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.models import Settings, PromptRequest, AggregatedResponse
from app.storage import users_store, MessageRecord
from app.providers import call_all_providers, synthesize_responses
from app.distill import should_distill, summarize_history, select_context
from app.auth import (
    LoginRequest, RegisterRequest, Token, ChangePasswordRequest, authenticate_user, 
    create_access_token, verify_token, ACCESS_TOKEN_EXPIRE_MINUTES
)

app = FastAPI()

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/api/register")
async def register(request: RegisterRequest):
    allow_self_reg = os.getenv("ALLOW_SELF_REG", "true").lower() == "true"
    if not allow_self_reg:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-registration is disabled",
        )
    
    if len(request.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long",
        )
    
    try:
        users_store.create_user(request.username, request.password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": request.username}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")


@app.post("/api/login")
async def login(request: LoginRequest):
    if not authenticate_user(request.username, request.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": request.username}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")


@app.get("/api/settings")
async def get_settings_endpoint(username: str = Depends(verify_token)):
    return users_store.get_user_settings_masked(username)


@app.post("/api/settings")
async def update_settings_endpoint(settings: Settings, username: str = Depends(verify_token)):
    users_store.set_user_settings(username, settings)
    return {"status": "success", "message": "Settings updated successfully"}


@app.post("/api/prompt")
async def send_prompt(request: PromptRequest, username: str = Depends(verify_token)):
    settings = users_store.get_user_settings(username)
    responses = await call_all_providers(request.prompt, settings)
    synthesis = await synthesize_responses(responses, settings)
    
    return AggregatedResponse(
        responses=responses,
        synthesis=synthesis
    )


@app.post("/api/change-password")
async def change_password(request: ChangePasswordRequest, username: str = Depends(verify_token)):
    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long",
        )
    
    success = users_store.change_password(username, request.current_password, request.new_password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    
    return {"status": "success", "message": "Password changed successfully"}


class CreateConversationRequest(BaseModel):
    title: str


class SendMessageRequest(BaseModel):
    content: str


@app.post("/api/conversations")
async def create_conversation(request: CreateConversationRequest, username: str = Depends(verify_token)):
    conversation = users_store.create_conversation(username, request.title)
    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat()
    }


@app.get("/api/conversations")
async def list_conversations(username: str = Depends(verify_token)):
    return users_store.list_conversations(username)


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, username: str = Depends(verify_token)):
    conversation = users_store.get_conversation(username, conversation_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    
    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
        "summary": conversation.summary,
        "fidelity": conversation.fidelity,
        "distillation_model": conversation.distillation_model,
        "distillation_mode": conversation.distillation_mode,
        "messages": [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "provider_responses": msg.provider_responses,
                "timestamp": msg.timestamp.isoformat()
            }
            for msg in conversation.messages
        ]
    }


@app.post("/api/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, request: SendMessageRequest, username: str = Depends(verify_token)):
    conversation = users_store.get_conversation(username, conversation_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    
    user_message = MessageRecord(
        id=str(uuid.uuid4()),
        role="user",
        content=request.content
    )
    users_store.append_message(username, conversation_id, user_message)
    
    if should_distill(conversation.messages):
        settings = users_store.get_user_settings(username)
        new_summary = await summarize_history(
            conversation.summary,
            conversation.messages[-4:],
            settings,
            conversation.fidelity,
            conversation.distillation_model
        )
        users_store.update_summary(username, conversation_id, new_summary)
        conversation = users_store.get_conversation(username, conversation_id)
    
    context = select_context(conversation.summary, conversation.messages[:-1])
    
    settings = users_store.get_user_settings(username)
    responses = await call_all_providers(
        request.content,
        settings,
        context["context_messages"]
    )
    synthesis = await synthesize_responses(responses, settings)
    
    assistant_message = MessageRecord(
        id=str(uuid.uuid4()),
        role="assistant",
        content=synthesis,
        provider_responses={
            "responses": [
                {
                    "provider": r.provider,
                    "model": r.model,
                    "response": r.response,
                    "error": r.error,
                    "success": r.success
                }
                for r in responses
            ]
        }
    )
    users_store.append_message(username, conversation_id, assistant_message)
    
    return {
        "user_message": {
            "id": user_message.id,
            "role": user_message.role,
            "content": user_message.content,
            "timestamp": user_message.timestamp.isoformat()
        },
        "assistant_message": {
            "id": assistant_message.id,
            "role": assistant_message.role,
            "content": assistant_message.content,
            "provider_responses": assistant_message.provider_responses,
            "timestamp": assistant_message.timestamp.isoformat()
        }
    }


class UpdateFidelityRequest(BaseModel):
    fidelity: str


class UpdateDistillationModelRequest(BaseModel):
    distillation_model: str


class UpdateDistillationModeRequest(BaseModel):
    distillation_mode: str


@app.patch("/api/conversations/{conversation_id}/fidelity")
async def update_conversation_fidelity(conversation_id: str, request: UpdateFidelityRequest, username: str = Depends(verify_token)):
    try:
        users_store.update_fidelity(username, conversation_id, request.fidelity)
        return {"status": "success", "message": "Fidelity updated successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@app.patch("/api/conversations/{conversation_id}/distillation-model")
async def update_conversation_distillation_model(conversation_id: str, request: UpdateDistillationModelRequest, username: str = Depends(verify_token)):
    try:
        users_store.update_distillation_model(username, conversation_id, request.distillation_model)
        return {"status": "success", "message": "Distillation model updated successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@app.patch("/api/conversations/{conversation_id}/distillation-mode")
async def update_conversation_distillation_mode(conversation_id: str, request: UpdateDistillationModeRequest, username: str = Depends(verify_token)):
    try:
        users_store.update_distillation_mode(username, conversation_id, request.distillation_mode)
        return {"status": "success", "message": "Distillation mode updated successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, username: str = Depends(verify_token)):
    success = users_store.delete_conversation(username, conversation_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    
    return {"status": "success", "message": "Conversation deleted successfully"}

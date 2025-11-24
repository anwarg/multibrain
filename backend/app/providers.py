import asyncio
from typing import List, Optional, Dict
import httpx
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
import google.generativeai as genai
from app.models import ProviderResponse, Settings


async def call_openai(prompt: str, settings: Settings, context_messages: Optional[List[Dict]] = None) -> ProviderResponse:
    try:
        provider_settings = settings.openai
        if not provider_settings.enabled or not provider_settings.api_key:
            return ProviderResponse(
                provider="OpenAI",
                model=provider_settings.model or "gpt-4",
                response=None,
                error="OpenAI not configured",
                success=False
            )
        
        client = AsyncOpenAI(api_key=provider_settings.api_key)
        model = provider_settings.model or "gpt-4"
        
        messages = context_messages or []
        messages.append({"role": "user", "content": prompt})
        
        response = await client.chat.completions.create(
            model=model,
            messages=messages
        )
        
        return ProviderResponse(
            provider="OpenAI",
            model=model,
            response=response.choices[0].message.content,
            success=True
        )
    except Exception as e:
        return ProviderResponse(
            provider="OpenAI",
            model=provider_settings.model or "gpt-4",
            response=None,
            error=str(e),
            success=False
        )


async def call_perplexity(prompt: str, settings: Settings, context_messages: Optional[List[Dict]] = None) -> ProviderResponse:
    try:
        provider_settings = settings.perplexity
        if not provider_settings.enabled or not provider_settings.api_key:
            return ProviderResponse(
                provider="Perplexity",
                model=provider_settings.model or "sonar",
                response=None,
                error="Perplexity not configured",
                success=False
            )
        
        model = provider_settings.model or "sonar"
        
        messages = context_messages or []
        messages.append({"role": "user", "content": prompt})
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {provider_settings.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": messages
                },
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
            
            return ProviderResponse(
                provider="Perplexity",
                model=model,
                response=data["choices"][0]["message"]["content"],
                success=True
            )
    except Exception as e:
        return ProviderResponse(
            provider="Perplexity",
            model=provider_settings.model or "sonar",
            response=None,
            error=str(e),
            success=False
        )


async def call_anthropic(prompt: str, settings: Settings, context_messages: Optional[List[Dict]] = None) -> ProviderResponse:
    try:
        provider_settings = settings.anthropic
        if not provider_settings.enabled or not provider_settings.api_key:
            return ProviderResponse(
                provider="Anthropic",
                model=provider_settings.model or "claude-3-sonnet-20240229",
                response=None,
                error="Anthropic not configured",
                success=False
            )
        
        client = AsyncAnthropic(api_key=provider_settings.api_key)
        model = provider_settings.model or "claude-3-sonnet-20240229"
        
        messages = context_messages or []
        messages.append({"role": "user", "content": prompt})
        
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            messages=messages
        )
        
        return ProviderResponse(
            provider="Anthropic",
            model=model,
            response=response.content[0].text,
            success=True
        )
    except Exception as e:
        return ProviderResponse(
            provider="Anthropic",
            model=provider_settings.model or "claude-3-sonnet-20240229",
            response=None,
            error=str(e),
            success=False
        )


async def call_gemini(prompt: str, settings: Settings, thinking_mode: bool = False, context_messages: Optional[List[Dict]] = None) -> ProviderResponse:
    try:
        provider_settings = settings.gemini
        if not provider_settings.enabled or not provider_settings.api_key:
            return ProviderResponse(
                provider="Gemini",
                model=provider_settings.model or "gemini-pro",
                response=None,
                error="Gemini not configured",
                success=False
            )
        
        genai.configure(api_key=provider_settings.api_key)
        model_name = provider_settings.model or "gemini-pro"
        
        if thinking_mode:
            model_name = "gemini-2.0-flash-thinking-exp-1219"
        
        model = genai.GenerativeModel(model_name)
        
        full_prompt = prompt
        if context_messages:
            context_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in context_messages])
            full_prompt = f"{context_text}\n\nuser: {prompt}"
        
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: model.generate_content(full_prompt)
        )
        
        return ProviderResponse(
            provider="Gemini",
            model=model_name,
            response=response.text,
            success=True
        )
    except Exception as e:
        return ProviderResponse(
            provider="Gemini",
            model=provider_settings.model or "gemini-pro",
            response=None,
            error=str(e),
            success=False
        )


async def call_all_providers(prompt: str, settings: Settings, context_messages: Optional[List[Dict]] = None) -> List[ProviderResponse]:
    tasks = [
        call_openai(prompt, settings, context_messages),
        call_perplexity(prompt, settings, context_messages),
        call_anthropic(prompt, settings, context_messages),
        call_gemini(prompt, settings, context_messages=context_messages)
    ]
    
    responses = await asyncio.gather(*tasks)
    return list(responses)


async def synthesize_responses(responses: List[ProviderResponse], settings: Settings) -> str:
    successful_responses = [r for r in responses if r.success and r.response]
    
    if not successful_responses:
        return "No successful responses to synthesize."
    
    synthesis_prompt = f"""You are tasked with synthesizing multiple AI responses into a single, comprehensive report.

Below are responses from different AI providers to the same prompt:

"""
    
    for resp in successful_responses:
        synthesis_prompt += f"\n--- {resp.provider} ({resp.model}) ---\n{resp.response}\n"
    
    synthesis_prompt += """

Please analyze these responses and create a unified, comprehensive report that:
1. Identifies common themes and consensus points across all responses
2. Highlights unique insights or perspectives from individual providers
3. Resolves any contradictions or differences in the responses
4. Merges all findings into a coherent, well-structured narrative
5. Presents the information as if it came from a single, authoritative source

Structure your synthesis in a clear, easy-to-navigate format with appropriate sections and subsections."""
    
    synthesis_response = await call_gemini(synthesis_prompt, settings, thinking_mode=True)
    
    if synthesis_response.success:
        return synthesis_response.response
    else:
        return f"Synthesis failed: {synthesis_response.error}"

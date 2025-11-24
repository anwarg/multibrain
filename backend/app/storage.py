import os
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from passlib.context import CryptContext
import uuid

from app.models import Settings, ProviderSettings
from app.crypto import encrypt, decrypt


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@dataclass
class ProviderSettingsEnc:
    """Encrypted provider settings."""
    api_key_enc: Optional[str] = None
    model: Optional[str] = None
    enabled: bool = True


@dataclass
class DistillationSettingsEnc:
    """Distillation settings."""
    mode: str = "single"
    model: str = "gemini"
    fidelity: str = "standard"  # high, standard, low


@dataclass
class SettingsEnc:
    """Encrypted settings for all providers."""
    openai: ProviderSettingsEnc = field(default_factory=ProviderSettingsEnc)
    perplexity: ProviderSettingsEnc = field(default_factory=ProviderSettingsEnc)
    anthropic: ProviderSettingsEnc = field(default_factory=ProviderSettingsEnc)
    gemini: ProviderSettingsEnc = field(default_factory=ProviderSettingsEnc)
    distillation: DistillationSettingsEnc = field(default_factory=DistillationSettingsEnc)


@dataclass
class MessageRecord:
    """A single message in a conversation."""
    id: str
    role: str
    content: str
    provider_responses: Optional[Dict] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class ConversationRecord:
    """A conversation thread with messages."""
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    summary: str = ""
    fidelity: str = "standard"  # high, standard, low
    distillation_model: str = "gemini"  # openai, perplexity, anthropic, gemini
    distillation_mode: str = "single"  # single, per-model
    messages: List[MessageRecord] = field(default_factory=list)


@dataclass
class UserRecord:
    """A user with encrypted settings."""
    username: str
    password_hash: str
    created_at: datetime
    settings_enc: SettingsEnc = field(default_factory=SettingsEnc)


class UsersStore:
    """In-memory store for users and their conversations."""
    
    def __init__(self):
        self.users: Dict[str, UserRecord] = {}
        self.conversations: Dict[str, Dict[str, ConversationRecord]] = {}
    
    def create_user(self, username: str, password_plain: str) -> UserRecord:
        """Create a new user with hashed password."""
        if username in self.users:
            raise ValueError(f"User {username} already exists")
        
        password_hash = pwd_context.hash(password_plain)
        user = UserRecord(
            username=username,
            password_hash=password_hash,
            created_at=datetime.utcnow()
        )
        self.users[username] = user
        self.conversations[username] = {}
        return user
    
    def authenticate(self, username: str, password_plain: str) -> bool:
        """Authenticate user with password."""
        user = self.users.get(username)
        if not user:
            return False
        return pwd_context.verify(password_plain, user.password_hash)
    
    def get_user(self, username: str) -> Optional[UserRecord]:
        """Get user record."""
        return self.users.get(username)
    
    def change_password(self, username: str, old_password: str, new_password: str) -> bool:
        """Change user password."""
        if not self.authenticate(username, old_password):
            return False
        
        user = self.users.get(username)
        if user:
            user.password_hash = pwd_context.hash(new_password)
            return True
        return False
    
    def get_user_settings(self, username: str) -> Settings:
        """Get decrypted settings for user."""
        user = self.users.get(username)
        if not user:
            return Settings()
        
        from app.models import DistillationSettings
        
        settings = Settings()
        for provider in ["openai", "perplexity", "anthropic", "gemini"]:
            enc_settings = getattr(user.settings_enc, provider)
            api_key = decrypt(enc_settings.api_key_enc) if enc_settings.api_key_enc else None
            setattr(settings, provider, ProviderSettings(
                api_key=api_key,
                model=enc_settings.model,
                enabled=enc_settings.enabled
            ))
        
        settings.distillation = DistillationSettings(
            mode=user.settings_enc.distillation.mode,
            model=user.settings_enc.distillation.model,
            fidelity=user.settings_enc.distillation.fidelity
        )
        
        return settings
    
    def set_user_settings(self, username: str, settings: Settings) -> None:
        """Set encrypted settings for user."""
        user = self.users.get(username)
        if not user:
            raise ValueError(f"User {username} not found")
        
        for provider in ["openai", "perplexity", "anthropic", "gemini"]:
            dec_settings = getattr(settings, provider)
            api_key_enc = encrypt(dec_settings.api_key) if dec_settings.api_key else None
            setattr(user.settings_enc, provider, ProviderSettingsEnc(
                api_key_enc=api_key_enc,
                model=dec_settings.model,
                enabled=dec_settings.enabled
            ))
        
        user.settings_enc.distillation = DistillationSettingsEnc(
            mode=settings.distillation.mode,
            model=settings.distillation.model,
            fidelity=settings.distillation.fidelity
        )
    
    def get_user_settings_masked(self, username: str) -> Settings:
        """Get settings with masked API keys."""
        settings = self.get_user_settings(username)
        for provider in ["openai", "perplexity", "anthropic", "gemini"]:
            provider_settings = getattr(settings, provider)
            if provider_settings.api_key:
                provider_settings.api_key = "***"
        return settings
    
    def create_conversation(self, username: str, title: str, fidelity: Optional[str] = None, distillation_model: Optional[str] = None, distillation_mode: Optional[str] = None) -> ConversationRecord:
        """Create a new conversation for user."""
        if username not in self.conversations:
            self.conversations[username] = {}
        
        user_settings = self.get_user_settings(username)
        
        if fidelity is None:
            fidelity = user_settings.distillation.fidelity
        
        if distillation_model is None:
            distillation_model = user_settings.distillation.model
        
        if distillation_mode is None:
            distillation_mode = user_settings.distillation.mode
        
        conversation = ConversationRecord(
            id=str(uuid.uuid4()),
            title=title,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            fidelity=fidelity,
            distillation_model=distillation_model,
            distillation_mode=distillation_mode
        )
        self.conversations[username][conversation.id] = conversation
        return conversation
    
    def list_conversations(self, username: str) -> List[Dict]:
        """List all conversations for user."""
        if username not in self.conversations:
            return []
        
        conversations = self.conversations[username].values()
        return [
            {
                "id": c.id,
                "title": c.title,
                "created_at": c.created_at.isoformat(),
                "updated_at": c.updated_at.isoformat(),
                "fidelity": c.fidelity,
                "distillation_model": c.distillation_model,
                "distillation_mode": c.distillation_mode
            }
            for c in sorted(conversations, key=lambda x: x.updated_at, reverse=True)
        ]
    
    def get_conversation(self, username: str, conversation_id: str) -> Optional[ConversationRecord]:
        """Get conversation by ID."""
        if username not in self.conversations:
            return None
        return self.conversations[username].get(conversation_id)
    
    def append_message(self, username: str, conversation_id: str, message: MessageRecord) -> None:
        """Append message to conversation."""
        conversation = self.get_conversation(username, conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")
        
        conversation.messages.append(message)
        conversation.updated_at = datetime.utcnow()
    
    def update_summary(self, username: str, conversation_id: str, summary: str) -> None:
        """Update conversation summary."""
        conversation = self.get_conversation(username, conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")
        
        conversation.summary = summary
    
    def update_fidelity(self, username: str, conversation_id: str, fidelity: str) -> None:
        """Update conversation fidelity setting."""
        conversation = self.get_conversation(username, conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")
        
        if fidelity not in ["high", "standard", "low"]:
            raise ValueError(f"Invalid fidelity: {fidelity}")
        
        conversation.fidelity = fidelity
        conversation.updated_at = datetime.utcnow()
    
    def update_distillation_model(self, username: str, conversation_id: str, distillation_model: str) -> None:
        """Update conversation distillation model setting."""
        conversation = self.get_conversation(username, conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")
        
        if distillation_model not in ["openai", "perplexity", "anthropic", "gemini"]:
            raise ValueError(f"Invalid distillation model: {distillation_model}")
        
        conversation.distillation_model = distillation_model
        conversation.updated_at = datetime.utcnow()
    
    def update_distillation_mode(self, username: str, conversation_id: str, distillation_mode: str) -> None:
        """Update conversation distillation mode setting."""
        conversation = self.get_conversation(username, conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")
        
        if distillation_mode not in ["single", "per-model"]:
            raise ValueError(f"Invalid distillation mode: {distillation_mode}")
        
        conversation.distillation_mode = distillation_mode
        conversation.updated_at = datetime.utcnow()
    
    def delete_conversation(self, username: str, conversation_id: str) -> bool:
        """Delete conversation."""
        if username not in self.conversations:
            return False
        
        if conversation_id in self.conversations[username]:
            del self.conversations[username][conversation_id]
            return True
        return False


users_store = UsersStore()


def ensure_default_admin():
    """Ensure default admin user exists."""
    admin_username = os.getenv("AUTH_USERNAME", "admin")
    admin_password = os.getenv("AUTH_PASSWORD", "admin123")
    
    if admin_username not in users_store.users:
        users_store.create_user(admin_username, admin_password)
        print(f"Created default admin user: {admin_username}")


ensure_default_admin()

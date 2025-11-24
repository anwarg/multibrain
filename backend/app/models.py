from pydantic import BaseModel
from typing import Optional, Dict, List


class ProviderSettings(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    enabled: bool = True


class DistillationSettings(BaseModel):
    mode: str = "single"
    model: str = "gemini"


class Settings(BaseModel):
    openai: ProviderSettings = ProviderSettings()
    perplexity: ProviderSettings = ProviderSettings()
    anthropic: ProviderSettings = ProviderSettings()
    gemini: ProviderSettings = ProviderSettings()
    distillation: DistillationSettings = DistillationSettings()


class PromptRequest(BaseModel):
    prompt: str


class ProviderResponse(BaseModel):
    provider: str
    model: str
    response: Optional[str] = None
    error: Optional[str] = None
    success: bool = True


class AggregatedResponse(BaseModel):
    responses: List[ProviderResponse]
    synthesis: Optional[str] = None

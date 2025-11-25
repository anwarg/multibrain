from typing import List, Dict, Optional, Tuple
from app.storage import MessageRecord
from app.models import Settings
from app.providers import call_gemini, call_openai, call_perplexity, call_anthropic


DISTILLATION_THRESHOLD_TURNS = 8
DISTILLATION_THRESHOLD_CHARS = 4000
CONTEXT_WINDOW_MESSAGES = 6


def should_distill(messages: List[MessageRecord]) -> bool:
    """Determine if conversation should be distilled."""
    if len(messages) > DISTILLATION_THRESHOLD_TURNS:
        return True
    
    total_chars = sum(len(msg.content) for msg in messages)
    if total_chars > DISTILLATION_THRESHOLD_CHARS:
        return True
    
    return False


async def summarize_history(existing_summary: str, recent_messages: List[MessageRecord], settings: Settings, fidelity: str = "standard", distillation_model: Optional[str] = None) -> str:
    """Summarize conversation history incrementally with configurable fidelity."""
    messages_text = "\n".join([
        f"{msg.role}: {msg.content}"
        for msg in recent_messages
    ])
    
    fidelity_instructions = {
        "high": "Create a detailed, comprehensive summary that preserves nuances, specific details, examples, and context. Aim for thoroughness over brevity.",
        "standard": "Create a balanced summary that captures key points, important details, and essential context. Balance comprehensiveness with conciseness.",
        "low": "Create a concise, high-level summary focusing only on the most critical points and main themes. Prioritize brevity."
    }
    
    fidelity_instruction = fidelity_instructions.get(fidelity, fidelity_instructions["standard"])
    
    if existing_summary:
        prompt = f"""You are tasked with updating a conversation summary.

Existing summary:
{existing_summary}

New messages to incorporate:
{messages_text}

Please update the summary to include the key points from the new messages while maintaining the context from the existing summary. {fidelity_instruction}"""
    else:
        prompt = f"""You are tasked with creating a summary of a conversation.

Conversation:
{messages_text}

{fidelity_instruction} This summary will be used to provide context for future messages in the conversation."""
    
    if distillation_model is None:
        distillation_model = settings.distillation.model
    
    if distillation_model == "openai":
        response = await call_openai(prompt, settings)
    elif distillation_model == "perplexity":
        response = await call_perplexity(prompt, settings)
    elif distillation_model == "anthropic":
        response = await call_anthropic(prompt, settings)
    else:
        response = await call_gemini(prompt, settings, thinking_mode=True)
    
    if response.success and response.response:
        return response.response
    else:
        return existing_summary or "Summary unavailable"


def select_context(summary: str, messages: List[MessageRecord], max_messages: int = CONTEXT_WINDOW_MESSAGES) -> Dict:
    """Select context messages to include in the next API call."""
    recent_messages = messages[-max_messages:] if len(messages) > max_messages else messages
    
    context_messages = []
    for msg in recent_messages:
        context_messages.append({
            "role": msg.role,
            "content": msg.content
        })
    
    return {
        "summary": summary,
        "context_messages": context_messages
    }


async def summarize_history_per_model(
    existing_summaries: Dict[str, str],
    recent_messages: List[MessageRecord],
    settings: Settings,
    fidelity: str = "standard",
    enabled_providers: Optional[List[str]] = None
) -> Dict[str, str]:
    """Summarize conversation history separately for each provider.
    
    Args:
        existing_summaries: Dict mapping provider name to existing summary
        recent_messages: Recent messages to incorporate
        settings: User settings
        fidelity: Distillation fidelity level
        enabled_providers: List of enabled provider names (e.g., ["openai", "anthropic"])
    
    Returns:
        Dict mapping provider name to updated summary
    """
    import asyncio
    
    if enabled_providers is None:
        enabled_providers = []
        if settings.openai.enabled and settings.openai.api_key:
            enabled_providers.append("openai")
        if settings.anthropic.enabled and settings.anthropic.api_key:
            enabled_providers.append("anthropic")
        if settings.gemini.enabled and settings.gemini.api_key:
            enabled_providers.append("gemini")
        if settings.perplexity.enabled and settings.perplexity.api_key:
            enabled_providers.append("perplexity")
    
    tasks = []
    provider_names = []
    
    for provider in enabled_providers:
        existing_summary = existing_summaries.get(provider, "")
        tasks.append(
            summarize_history(
                existing_summary,
                recent_messages,
                settings,
                fidelity,
                distillation_model=provider
            )
        )
        provider_names.append(provider)
    
    summaries = await asyncio.gather(*tasks)
    
    result = {}
    for provider, summary in zip(provider_names, summaries):
        result[provider] = summary
    
    return result

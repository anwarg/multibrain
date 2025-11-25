# MultiBrain Enhancement Proposals - Summary

## Overview

This document summarizes the comprehensive proposals for enhancing MultiBrain with multimodal support, telemetry/observability, OpenAI-style API, and per-model distillation implementation.

## 1. Multimodal Support ✅ (Proposal Complete)

**Status**: Detailed proposal created in `MULTIMODAL_PROPOSAL.md`

**Research**: Provider capabilities documented in `MULTIMODAL_RESEARCH.md`

### Key Findings

- **OpenAI**: Strong image support, audio via Whisper, PDFs via Assistants API
- **Anthropic**: Strong image support, text extraction for PDFs
- **Gemini**: Best multimodal support - native images, audio, video, PDFs
- **Perplexity**: Limited multimodal, primarily text + search

### Proposed Implementation (3 Phases)

**Phase 1 (Weeks 1-3)**: Core multimodal
- Images (JPEG, PNG, GIF, WebP)
- PDFs (text extraction)
- Tables/Spreadsheets (CSV, XLSX → Markdown)
- Charts (as images)

**Phase 2 (Weeks 4-6)**: Advanced multimodal
- Audio transcription (Whisper API)
- Video processing (frame extraction + audio)
- Gemini native video support

**Phase 3 (Weeks 7-8)**: Response multimodality
- Structured output parsing
- Rich frontend rendering
- Citation support

### Architecture

```
User Upload → Frontend → Backend API → Normalization → Provider Adapters → Providers
                                              ↓
                                         Storage (S3)
```

### Storage Strategy

- **Development**: Local ephemeral storage
- **Production**: S3/GCS with presigned URLs
- **Limits**: 20MB images, 100MB PDFs, 500MB video, 1GB total per request

## 2. Telemetry & Observability ✅ (Proposal Complete)

**Status**: Detailed proposal created in `TELEMETRY_PROPOSAL.md`

### Goals

1. **Compute Usage**: Track token usage and costs per model/prompt
2. **Contribution Analysis**: Determine which providers contribute most to synthesis
3. **Latency Metrics**: Network delay, TTFS, token rate, identify long pole
4. **Performance Optimization**: Identify bottlenecks
5. **Cost Management**: Track and predict API costs

### Architecture (3 Phases)

**Phase 1 (Weeks 1-2)**: Simple MVP
- In-memory + JSONL file rotation
- Internal dashboard page
- Basic counters and histograms
- Long pole identification

**Phase 2 (Weeks 3-4)**: Scalable
- SQLite → PostgreSQL
- Prometheus + Grafana
- OpenTelemetry with OTLP export

**Phase 3 (Month 2+)**: Production
- TimescaleDB for time-series
- Custom dashboards + alerting
- Cost prediction ML model

### Instrumentation Model

```
PromptSession
├── UploadNormalize (if attachments)
├── ContextSelect
├── ContextDistill (if needed)
├── ProviderCalls (parallel)
│   ├── ProviderCall.openai
│   ├── ProviderCall.anthropic
│   ├── ProviderCall.gemini
│   └── ProviderCall.perplexity
└── Synthesis
```

### Key Metrics

- **Latency**: Total duration, per-provider duration, TTFT, token rate
- **Usage**: Tokens in/out per provider, estimated costs
- **Quality**: Attribution weights, contribution analysis
- **Reliability**: Error rates, timeout frequency, long pole frequency

### Contribution Analysis Methods

1. **Heuristic** (Phase 1): Ask synthesis model to output attribution weights
2. **Embedding-based** (Phase 2): Cosine similarity between synthesis and provider responses
3. **Hybrid** (Phase 3): Combine both methods with weighting

## 3. OpenAI-Style API ✅ (Proposal Complete)

**Status**: Detailed proposal created in `OPENAI_API_PROPOSAL.md`

### Goals

- **Compatibility**: Drop-in replacement for OpenAI's `/v1/chat/completions`
- **Streaming**: SSE support for token streaming
- **Authentication**: Bearer token per user
- **Multi-tenancy**: Support multiple users/applications
- **Extensions**: MultiBrain-specific features via custom fields

### API Design

**Endpoint**: `POST /v1/chat/completions`

**Request** (OpenAI-compatible):
```json
{
  "model": "multibrain-default",
  "messages": [...],
  "stream": false,
  "temperature": 0.7
}
```

**MultiBrain Extensions** (optional):
```json
{
  "multibrain": {
    "providers": ["openai", "anthropic", "gemini"],
    "include_provider_details": true,
    "distillation_fidelity": "high",
    "distillation_model": "gemini",
    "distillation_mode": "single"
  }
}
```

**Response** (OpenAI-compatible + extensions):
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "choices": [...],
  "usage": {...},
  "multibrain": {
    "providers_called": [...],
    "attribution": {...},
    "provider_details": [...]
  }
}
```

### Model Mapping

- `multibrain-default`: All 4 providers
- `multibrain-fast`: OpenAI + Gemini only
- `multibrain-quality`: OpenAI + Anthropic + Gemini
- `gpt-4o`, `claude-3-5-sonnet`, etc.: Pass-through to specific provider

### Implementation Phases

**Week 1**: Basic endpoint + authentication
**Week 2**: Streaming support
**Week 3**: API key management
**Week 4**: Extensions + documentation

## 4. Per-Model Distillation ✅ (IMPLEMENTED)

**Status**: Fully implemented in backend and frontend

### What Was Implemented

**Backend Changes**:

1. **Storage Layer** (`storage.py`):
   - Added `per_model_summaries: Dict[str, str]` field to `ConversationRecord`
   - Added `update_per_model_summaries()` method to `UsersStore`
   - Updated `get_conversation()` API to return per-model summaries

2. **Distillation Logic** (`distill.py`):
   - Added `summarize_history_per_model()` function
   - Runs distillation in parallel for each enabled provider
   - Each provider uses its own model for distillation

3. **API Endpoints** (`main.py`):
   - Updated `send_message()` to check distillation mode
   - If mode is "per-model", calls `summarize_history_per_model()`
   - If mode is "single", calls `summarize_history()` (existing behavior)
   - Passes per-model summaries to providers when mode is "per-model"

**Frontend Changes**:

1. **Conversation Interface** (`ConversationInterface.tsx`):
   - Added `showDistilledContent` state variable
   - Added `distilledContent` state to store summary/per-model summaries
   - Added "View Distilled Content" button in conversation header
   - Added distilled content panel that shows:
     - Single model summary (when mode is "single")
     - Per-model summaries (when mode is "per-model")
   - Loads distilled content when conversation is loaded

### How It Works

**Single Model Mode** (existing behavior):
1. When distillation is triggered, one model (user's choice) creates a summary
2. This summary is sent to all providers as context

**Per-Model Mode** (new):
1. When distillation is triggered, each provider's model creates its own summary
2. Each provider receives its own distilled context
3. Summaries are stored separately per provider
4. User can view all per-model summaries via the UI

### User Experience

1. User selects "Per-Model" from distillation mode dropdown
2. As conversation progresses, each provider maintains its own context summary
3. User clicks "View Distilled Content" to see all summaries
4. Each provider's summary is displayed separately with provider name

## 5. Concurrency Analysis ✅

**Status**: Already implemented via `asyncio.gather()`

### Current Implementation

- All provider calls run concurrently using `asyncio.gather(*tasks)`
- Responses are collected in parallel
- No blocking between providers

### Proposed Enhancements

1. **Per-provider timeouts**: Add `asyncio.wait_for()` with configurable timeouts
2. **Global deadline**: Set maximum time for entire request
3. **Partial results**: Return synthesis even if some providers fail/timeout
4. **Long pole tracking**: Identify which provider is slowest (included in telemetry proposal)

## Implementation Status Summary

| Feature | Status | Location |
|---------|--------|----------|
| Multimodal Support | Proposal Complete | `MULTIMODAL_PROPOSAL.md`, `MULTIMODAL_RESEARCH.md` |
| Telemetry & Observability | Proposal Complete | `TELEMETRY_PROPOSAL.md` |
| OpenAI-Style API | Proposal Complete | `OPENAI_API_PROPOSAL.md` |
| Per-Model Distillation | ✅ Implemented | Backend + Frontend |
| View Distilled Content | ✅ Implemented | Frontend UI |
| Concurrency | ✅ Already Implemented | `providers.py` |

## Next Steps

### Immediate (Week 1)
1. Review and approve proposals
2. Prioritize features for implementation
3. Set up development milestones

### Short-term (Weeks 2-4)
1. **Telemetry MVP**: Implement Phase 1 (in-memory + JSONL + dashboard)
2. **Multimodal Phase 1**: Images + PDFs + Tables
3. **OpenAI API**: Basic endpoint + authentication

### Medium-term (Weeks 5-8)
1. **Telemetry Phase 2**: PostgreSQL + Prometheus + Grafana
2. **Multimodal Phase 2**: Audio + Video
3. **OpenAI API**: Streaming + API key management

### Long-term (Month 2+)
1. **Telemetry Phase 3**: Advanced attribution + cost prediction
2. **Multimodal Phase 3**: Response multimodality
3. **OpenAI API**: Full extensions + documentation

## Questions for Discussion

1. **Multimodal Priority**: Which modalities are most important for v1?
2. **Storage**: Should we set up S3/GCS now or start with local storage?
3. **Telemetry**: Do we need cost tracking in v1?
4. **OpenAI API**: Should this be public or internal-only initially?
5. **Streaming**: Should we implement streaming for synthesis and providers in v1?

## Cost Estimates

### Development Time

- **Telemetry MVP**: 2 weeks
- **Multimodal Phase 1**: 3 weeks
- **OpenAI API Basic**: 2 weeks
- **Total for MVP features**: ~7 weeks

### Infrastructure Costs (Monthly)

- **S3 Storage**: $10-50 (depending on usage)
- **Prometheus + Grafana**: $0 (self-hosted) or $50-200 (managed)
- **Database**: $0 (SQLite) or $25-100 (managed PostgreSQL)
- **Total**: $10-350/month depending on choices

## Conclusion

All proposals are complete and ready for review. The per-model distillation feature has been fully implemented and is ready for testing. The proposals provide a clear roadmap for enhancing MultiBrain with multimodal support, comprehensive telemetry, and an OpenAI-compatible API.

The architecture is designed to start simple (MVP) and scale to production needs, with clear phases and milestones for each feature.

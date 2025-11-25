# Telemetry & Observability Proposal

## Executive Summary

This proposal outlines a telemetry system for MultiBrain that starts simple but scales to production needs. The system will track compute usage, identify performance bottlenecks (who's the long pole), measure contribution of each provider to the final synthesis, and capture detailed latency metrics.

## Goals

1. **Compute Usage Tracking**: Monitor token usage and estimated costs per model and prompt
2. **Contribution Analysis**: Determine which providers contribute most to the synthesized result
3. **Latency Metrics**: Track network delay, TTFS (time to first token), token rate, and identify the slowest provider
4. **Performance Optimization**: Identify bottlenecks and optimize provider selection
5. **Cost Management**: Track and predict API costs across providers

## Architecture Overview

### Phase 1: Simple MVP (Week 1-2)

**Storage**: In-memory + JSONL file rotation
**Visualization**: Internal dashboard page
**Metrics**: Basic counters and histograms

### Phase 2: Scalable (Week 3-4)

**Storage**: SQLite → PostgreSQL
**Visualization**: Prometheus + Grafana
**Metrics**: OpenTelemetry with OTLP export

### Phase 3: Production (Month 2+)

**Storage**: Time-series database (InfluxDB/TimescaleDB)
**Visualization**: Custom dashboards + alerting
**Metrics**: Advanced attribution and cost prediction

## Instrumentation Model

### Trace Structure

Each user request creates a trace with the following spans:

```
PromptSession (trace_id: conversation_id + message_id)
├── UploadNormalize (if attachments present)
│   ├── ProcessPDF
│   ├── ProcessImage
│   ├── ProcessAudio
│   └── ProcessVideo
├── ContextSelect
├── ContextDistill (if needed)
│   └── DistillationCall (to chosen model)
├── ProviderCalls (parallel)
│   ├── ProviderCall.openai
│   ├── ProviderCall.anthropic
│   ├── ProviderCall.gemini
│   └── ProviderCall.perplexity
└── Synthesis
    └── SynthesisCall (to Gemini Thinking Mode)
```

### Span Attributes

#### PromptSession
- `trace_id`: Unique identifier
- `conversation_id`: Conversation context
- `message_id`: Specific message
- `user_id`: Hashed user identifier
- `timestamp`: Request start time
- `total_duration_ms`: End-to-end latency
- `providers_called`: List of providers
- `providers_succeeded`: Count of successful responses
- `partial_result`: Boolean (true if some providers failed)
- `attachment_count`: Number of files uploaded
- `attachment_total_bytes`: Total upload size

#### ProviderCall.{provider}
- `provider`: openai | anthropic | gemini | perplexity
- `model`: Specific model used
- `enabled`: Boolean
- `success`: Boolean
- `error_type`: If failed (timeout | api_error | network_error | rate_limit)
- `http_status`: Response status code
- `retries`: Number of retry attempts
- `timeout_ms`: Configured timeout (if set)
- `start_ts`: Start timestamp
- `end_ts`: End timestamp
- `duration_ms`: Total time
- `ttft_ms`: Time to first token (streaming only)
- `tokens_in`: Input tokens
- `tokens_out`: Output tokens
- `token_rate_tps`: Tokens per second (streaming only)
- `estimated_cost_usd`: Calculated cost
- `response_size_bytes`: Response payload size
- `is_long_pole`: Boolean (true if slowest provider)

#### ContextDistill
- `summary_chars_before`: Character count before distillation
- `summary_chars_after`: Character count after distillation
- `messages_distilled`: Number of messages processed
- `fidelity`: high | standard | low
- `distillation_mode`: single | per-model
- `distillation_model`: Model used for distillation
- `duration_ms`: Distillation time

#### Synthesis
- `tokens_in_total`: Sum of all provider outputs
- `tokens_in_by_provider`: JSON map {provider: token_count}
- `tokens_out`: Synthesis output tokens
- `duration_ms`: Synthesis time
- `attribution_weights`: JSON map {provider: weight} (0.0-1.0)
- `attribution_method`: heuristic | embedding | hybrid

## Metrics to Collect

### Phase 1: MVP Metrics

#### Counters
- `multibrain_requests_total{user_id, conversation_id}`
- `multibrain_provider_calls_total{provider, model, success}`
- `multibrain_provider_errors_total{provider, error_type}`
- `multibrain_tokens_in_total{provider, model}`
- `multibrain_tokens_out_total{provider, model}`
- `multibrain_synthesis_total{success}`

#### Histograms
- `multibrain_request_duration_ms{user_id}` - End-to-end latency
- `multibrain_provider_duration_ms{provider, model}` - Per-provider latency
- `multibrain_provider_ttft_ms{provider, model}` - Time to first token
- `multibrain_distillation_duration_ms{model, fidelity}` - Distillation time
- `multibrain_synthesis_duration_ms` - Synthesis time

#### Gauges
- `multibrain_estimated_cost_usd{provider, model}` - Running cost total
- `multibrain_active_requests` - Current in-flight requests

### Phase 2: Advanced Metrics

- `multibrain_provider_contribution{provider}` - Attribution weights
- `multibrain_long_pole_frequency{provider}` - How often each provider is slowest
- `multibrain_partial_results_total` - Requests with incomplete provider responses
- `multibrain_token_rate_tps{provider, model}` - Streaming token rate
- `multibrain_cache_hits{type}` - If caching is added

## Contribution Analysis

### Method 1: Heuristic Attribution (Phase 1)

Ask the synthesis model to output attribution weights:

```python
synthesis_prompt += """

After your synthesis, output a JSON block with attribution:
{
  "attribution": {
    "openai": 0.35,
    "anthropic": 0.30,
    "gemini": 0.25,
    "perplexity": 0.10
  },
  "rationale": "OpenAI provided the most detailed technical explanation..."
}
"""
```

**Pros**: Simple, fast, interpretable
**Cons**: Self-reported, may be biased

### Method 2: Embedding-Based Similarity (Phase 2)

1. Chunk the synthesis into sentences
2. Compute embeddings for each sentence
3. Compute embeddings for each provider response
4. Calculate cosine similarity between synthesis chunks and provider responses
5. Normalize to attribution weights

**Pros**: Objective, measurable
**Cons**: Computationally expensive, requires embedding model

### Method 3: Hybrid (Phase 3)

Combine heuristic and embedding-based methods:
- Use embeddings for quantitative similarity
- Use heuristic for qualitative assessment
- Weight both methods (e.g., 60% embedding, 40% heuristic)

## Long Pole Identification

Track which provider is slowest for each request:

```python
# After all providers return
provider_durations = {
    "openai": 1250,
    "anthropic": 890,
    "gemini": 2100,  # ← Long pole
    "perplexity": 450
}

long_pole = max(provider_durations, key=provider_durations.get)
metrics.increment("long_pole_frequency", {"provider": long_pole})
```

**Dashboard View**:
- Bar chart: Average latency per provider
- Pie chart: Long pole frequency distribution
- Timeline: Provider latencies over time
- Alert: If one provider is consistently slow (> 2x median)

## Latency Breakdown

### Components to Measure

1. **Network Delay**
   - DNS resolution time
   - TCP connection time
   - TLS handshake time
   - Request upload time
   - Response download time

2. **TTFS (Time to First Token)**
   - Time from request sent to first token received
   - Only measurable with streaming enabled
   - Critical for user-perceived latency

3. **Token Rate**
   - Tokens per second during streaming
   - Average: `tokens_out / (end_time - ttft_time)`
   - Helps identify provider throughput

4. **Processing Time**
   - Provider-side processing (inferred from total - network)
   - Distillation time
   - Synthesis time

### Implementation

```python
class ProviderMetrics:
    def __init__(self):
        self.start_time = None
        self.ttft_time = None
        self.end_time = None
        self.tokens_received = 0
        
    def on_request_start(self):
        self.start_time = time.time()
        
    def on_first_token(self):
        self.ttft_time = time.time()
        
    def on_token_received(self):
        self.tokens_received += 1
        
    def on_request_end(self):
        self.end_time = time.time()
        
    def get_metrics(self):
        total_duration = (self.end_time - self.start_time) * 1000
        ttft = (self.ttft_time - self.start_time) * 1000 if self.ttft_time else None
        token_rate = self.tokens_received / (self.end_time - self.ttft_time) if self.ttft_time else None
        
        return {
            "duration_ms": total_duration,
            "ttft_ms": ttft,
            "token_rate_tps": token_rate,
            "tokens_out": self.tokens_received
        }
```

## Cost Tracking

### Pricing Tables (Configurable)

```python
PRICING = {
    "openai": {
        "gpt-4o": {"input": 2.50, "output": 10.00},  # per 1M tokens
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    },
    "anthropic": {
        "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
        "claude-3-5-haiku-20241022": {"input": 0.80, "output": 4.00},
    },
    "gemini": {
        "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
        "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
        "gemini-2.0-flash-thinking-exp": {"input": 0.00, "output": 0.00},  # Free preview
    },
    "perplexity": {
        "sonar": {"input": 1.00, "output": 1.00},
        "sonar-pro": {"input": 3.00, "output": 15.00},
    }
}

def calculate_cost(provider, model, tokens_in, tokens_out):
    pricing = PRICING.get(provider, {}).get(model)
    if not pricing:
        return 0.0
    
    cost_in = (tokens_in / 1_000_000) * pricing["input"]
    cost_out = (tokens_out / 1_000_000) * pricing["output"]
    return cost_in + cost_out
```

### Cost Dashboard

- **Per-request cost**: Show breakdown by provider
- **Per-conversation cost**: Cumulative cost over conversation
- **Per-user cost**: Monthly/daily totals
- **Cost trends**: Graph over time
- **Budget alerts**: Notify when approaching limits

## Storage & Visualization

### Phase 1: Simple (MVP)

**Storage**:
```python
# In-memory ring buffer (last 1000 sessions)
session_buffer = deque(maxlen=1000)

# JSONL file rotation (daily)
with open(f"telemetry_{date}.jsonl", "a") as f:
    f.write(json.dumps(session_data) + "\n")
```

**Visualization**:
- Internal `/telemetry` page showing:
  - Recent sessions table
  - Provider latency sparklines
  - Cost summary
  - Long pole frequency chart

### Phase 2: Scalable

**Storage**:
```sql
-- SQLite → PostgreSQL
CREATE TABLE prompt_sessions (
    id UUID PRIMARY KEY,
    conversation_id UUID,
    user_id VARCHAR(64),
    timestamp TIMESTAMP,
    total_duration_ms INT,
    providers_called TEXT[],
    providers_succeeded INT,
    partial_result BOOLEAN,
    total_cost_usd DECIMAL(10,6)
);

CREATE TABLE provider_calls (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES prompt_sessions(id),
    provider VARCHAR(32),
    model VARCHAR(64),
    success BOOLEAN,
    duration_ms INT,
    ttft_ms INT,
    tokens_in INT,
    tokens_out INT,
    token_rate_tps DECIMAL(8,2),
    estimated_cost_usd DECIMAL(10,6),
    is_long_pole BOOLEAN,
    error_type VARCHAR(32)
);

CREATE TABLE synthesis_calls (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES prompt_sessions(id),
    duration_ms INT,
    tokens_in INT,
    tokens_out INT,
    attribution_weights JSONB
);
```

**Visualization**:
- Prometheus `/metrics` endpoint
- Grafana dashboards:
  - Request rate and latency
  - Provider comparison
  - Cost tracking
  - Error rates

### Phase 3: Production

**Storage**:
- TimescaleDB for time-series data
- Separate OLAP database for analytics
- S3 for long-term archival

**Visualization**:
- Custom React dashboard
- Real-time updates via WebSocket
- Alerting via PagerDuty/Slack
- Cost prediction ML model

## Implementation Plan

### Week 1: Foundation
- [ ] Add OpenTelemetry instrumentation
- [ ] Create span structure for all operations
- [ ] Implement basic counters and histograms
- [ ] Add JSONL logging
- [ ] Create in-memory session buffer

### Week 2: Streaming & TTFT
- [ ] Implement streaming for synthesis (Gemini)
- [ ] Add streaming for OpenAI
- [ ] Capture TTFT metrics
- [ ] Calculate token rates
- [ ] Identify long pole per request

### Week 3: Dashboard & Attribution
- [ ] Create `/telemetry` internal page
- [ ] Implement heuristic attribution
- [ ] Add cost calculation
- [ ] Display provider comparison charts
- [ ] Add session detail view

### Week 4: Scalability
- [ ] Set up SQLite database
- [ ] Migrate to PostgreSQL
- [ ] Add Prometheus exporter
- [ ] Create Grafana dashboards
- [ ] Implement data retention policies

## Privacy & Security

### Data Protection
- Hash user IDs before logging
- Never log raw prompts or responses (only metadata)
- Never log API keys or credentials
- Redact PII from error messages

### Access Control
- Telemetry dashboard requires authentication
- Per-user views (users see only their data)
- Admin view for aggregate metrics
- Audit log for telemetry access

### Compliance
- GDPR: Allow users to request deletion of telemetry data
- Data retention: 90 days for detailed logs, 1 year for aggregates
- Export capability for user data requests

## Configuration

### Environment Variables
```bash
# Telemetry settings
TELEMETRY_ENABLED=true
TELEMETRY_SAMPLING_RATE=1.0  # 0.0-1.0
TELEMETRY_EXPORT_INTERVAL_SECONDS=60
TELEMETRY_STORAGE_PATH=/var/log/multibrain/telemetry

# OTLP export (Phase 2)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=multibrain

# Cost tracking
COST_TRACKING_ENABLED=true
COST_ALERT_THRESHOLD_USD=100.0
```

### User Settings
```python
class TelemetrySettings:
    enabled: bool = True
    detailed_logging: bool = False  # Include request/response samples
    cost_alerts: bool = True
    cost_alert_threshold_usd: float = 50.0
```

## Success Metrics

### Phase 1 Success Criteria
- ✅ Track latency for all provider calls
- ✅ Identify long pole for each request
- ✅ Calculate estimated costs
- ✅ Display basic dashboard
- ✅ Store last 1000 sessions

### Phase 2 Success Criteria
- ✅ Streaming enabled with TTFT metrics
- ✅ Attribution weights calculated
- ✅ Prometheus metrics exported
- ✅ Grafana dashboards deployed
- ✅ Database persistence

### Phase 3 Success Criteria
- ✅ Real-time dashboard updates
- ✅ Cost prediction model
- ✅ Automated alerting
- ✅ Advanced attribution methods
- ✅ Performance optimization recommendations

## Appendix: Example Telemetry Output

```json
{
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "conversation_id": "conv_123",
  "message_id": "msg_456",
  "user_id": "hash_abc",
  "timestamp": "2025-11-25T16:00:00Z",
  "total_duration_ms": 3250,
  "providers_called": ["openai", "anthropic", "gemini", "perplexity"],
  "providers_succeeded": 4,
  "partial_result": false,
  "provider_calls": [
    {
      "provider": "openai",
      "model": "gpt-4o",
      "success": true,
      "duration_ms": 1250,
      "ttft_ms": 320,
      "tokens_in": 1500,
      "tokens_out": 450,
      "token_rate_tps": 48.4,
      "estimated_cost_usd": 0.00825,
      "is_long_pole": false
    },
    {
      "provider": "gemini",
      "model": "gemini-1.5-flash",
      "success": true,
      "duration_ms": 2100,
      "ttft_ms": 450,
      "tokens_in": 1500,
      "tokens_out": 520,
      "token_rate_tps": 31.5,
      "estimated_cost_usd": 0.00027,
      "is_long_pole": true
    }
  ],
  "synthesis": {
    "duration_ms": 1800,
    "tokens_in": 1420,
    "tokens_out": 680,
    "attribution_weights": {
      "openai": 0.35,
      "anthropic": 0.30,
      "gemini": 0.25,
      "perplexity": 0.10
    }
  },
  "total_cost_usd": 0.0245
}
```

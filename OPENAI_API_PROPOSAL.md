# OpenAI-Style API Proposal

## Executive Summary

This proposal outlines adding an OpenAI-compatible API endpoint to MultiBrain, allowing external clients to use MultiBrain as a drop-in replacement for OpenAI's API while benefiting from multi-provider aggregation and synthesis.

## Goals

1. **Compatibility**: Support OpenAI's `/v1/chat/completions` endpoint format
2. **Streaming**: Implement Server-Sent Events (SSE) for token streaming
3. **Authentication**: Secure API access with bearer tokens
4. **Multi-tenancy**: Support multiple users/applications
5. **Extensions**: Add MultiBrain-specific features via custom fields

## API Design

### Endpoint

```
POST /v1/chat/completions
```

### Request Format (OpenAI-Compatible)

```json
{
  "model": "multibrain-default",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"}
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000,
  "top_p": 1.0,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "n": 1,
  "stop": null,
  "user": "user-123"
}
```

### MultiBrain Extensions (Optional)

```json
{
  "model": "multibrain-default",
  "messages": [...],
  "stream": false,
  
  // MultiBrain-specific fields
  "multibrain": {
    "providers": ["openai", "anthropic", "gemini"],  // Filter providers
    "include_provider_details": true,  // Include individual responses
    "distillation_fidelity": "high",  // high | standard | low
    "distillation_model": "gemini",  // Which model to use for distillation
    "distillation_mode": "single"  // single | per-model
  }
}
```

### Response Format (OpenAI-Compatible)

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "multibrain-default",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The capital of France is Paris."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 8,
    "total_tokens": 23
  }
}
```

### MultiBrain Extensions in Response

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "multibrain-default",
  "choices": [...],
  "usage": {...},
  
  // MultiBrain-specific fields
  "multibrain": {
    "providers_called": ["openai", "anthropic", "gemini", "perplexity"],
    "providers_succeeded": 4,
    "synthesis_model": "gemini-2.0-flash-thinking-exp",
    "total_latency_ms": 2150,
    "attribution": {
      "openai": 0.35,
      "anthropic": 0.30,
      "gemini": 0.25,
      "perplexity": 0.10
    },
    "provider_details": [
      {
        "provider": "openai",
        "model": "gpt-4o",
        "success": true,
        "latency_ms": 1250,
        "tokens": {"input": 15, "output": 120},
        "response": "The capital of France is Paris, a major European city..."
      },
      // ... other providers
    ]
  }
}
```

### Streaming Response (SSE)

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"multibrain-default","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"multibrain-default","choices":[{"index":0,"delta":{"content":"The"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"multibrain-default","choices":[{"index":0,"delta":{"content":" capital"},"finish_reason":null}]}

...

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"multibrain-default","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

## Implementation

### Backend Endpoint

```python
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
import json
import time

class ChatCompletionRequest(BaseModel):
    model: str = "multibrain-default"
    messages: List[Dict[str, str]]
    stream: bool = False
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    top_p: Optional[float] = 1.0
    frequency_penalty: Optional[float] = 0.0
    presence_penalty: Optional[float] = 0.0
    n: Optional[int] = 1
    stop: Optional[List[str]] = None
    user: Optional[str] = None
    
    # MultiBrain extensions
    multibrain: Optional[Dict[str, Any]] = None

class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]
    multibrain: Optional[Dict[str, Any]] = None

@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    authorization: str = Header(None)
):
    # Authenticate
    username = await verify_api_key(authorization)
    
    # Extract last user message
    user_message = next(
        (m["content"] for m in reversed(request.messages) if m["role"] == "user"),
        None
    )
    if not user_message:
        raise HTTPException(400, "No user message found")
    
    # Get user settings
    settings = users_store.get_user_settings(username)
    
    # Apply MultiBrain extensions
    mb_config = request.multibrain or {}
    providers_filter = mb_config.get("providers")
    include_details = mb_config.get("include_provider_details", False)
    
    # Build context from messages
    context_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in request.messages[:-1]  # All except last user message
    ]
    
    # Call providers
    start_time = time.time()
    responses = await call_all_providers(
        user_message,
        settings,
        context_messages,
        providers_filter=providers_filter
    )
    
    # Synthesize
    synthesis = await synthesize_responses(responses, settings)
    total_latency = int((time.time() - start_time) * 1000)
    
    # Calculate usage
    total_prompt_tokens = sum(r.tokens_in for r in responses if r.success)
    total_completion_tokens = sum(r.tokens_out for r in responses if r.success)
    
    # Build response
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"
    
    response_data = ChatCompletionResponse(
        id=completion_id,
        created=int(time.time()),
        model=request.model,
        choices=[{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": synthesis
            },
            "finish_reason": "stop"
        }],
        usage={
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "total_tokens": total_prompt_tokens + total_completion_tokens
        }
    )
    
    # Add MultiBrain details if requested
    if include_details:
        response_data.multibrain = {
            "providers_called": [r.provider for r in responses],
            "providers_succeeded": sum(1 for r in responses if r.success),
            "synthesis_model": "gemini-2.0-flash-thinking-exp",
            "total_latency_ms": total_latency,
            "provider_details": [
                {
                    "provider": r.provider,
                    "model": r.model,
                    "success": r.success,
                    "response": r.response if r.success else None,
                    "error": r.error if not r.success else None
                }
                for r in responses
            ]
        }
    
    if request.stream:
        return StreamingResponse(
            stream_completion(response_data),
            media_type="text/event-stream"
        )
    else:
        return response_data

async def stream_completion(response: ChatCompletionResponse):
    """Stream completion as SSE."""
    completion_id = response.id
    content = response.choices[0]["message"]["content"]
    
    # Send role first
    yield f"data: {json.dumps({
        'id': completion_id,
        'object': 'chat.completion.chunk',
        'created': response.created,
        'model': response.model,
        'choices': [{
            'index': 0,
            'delta': {'role': 'assistant'},
            'finish_reason': None
        }]
    })}\n\n"
    
    # Stream content word by word (simulate streaming)
    words = content.split()
    for i, word in enumerate(words):
        chunk = word + (" " if i < len(words) - 1 else "")
        yield f"data: {json.dumps({
            'id': completion_id,
            'object': 'chat.completion.chunk',
            'created': response.created,
            'model': response.model,
            'choices': [{
                'index': 0,
                'delta': {'content': chunk},
                'finish_reason': None
            }]
        })}\n\n"
        await asyncio.sleep(0.01)  # Simulate streaming delay
    
    # Send finish
    yield f"data: {json.dumps({
        'id': completion_id,
        'object': 'chat.completion.chunk',
        'created': response.created,
        'model': response.model,
        'choices': [{
            'index': 0,
            'delta': {},
            'finish_reason': 'stop'
        }]
    })}\n\n"
    
    yield "data: [DONE]\n\n"
```

### Authentication

```python
async def verify_api_key(authorization: str) -> str:
    """Verify API key and return username."""
    if not authorization:
        raise HTTPException(401, "Missing authorization header")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid authorization format")
    
    api_key = authorization[7:]  # Remove "Bearer "
    
    # Check if it's a JWT token (existing auth)
    try:
        username = verify_token(api_key)
        return username
    except:
        pass
    
    # Check if it's a dedicated API key
    username = users_store.get_user_by_api_key(api_key)
    if not username:
        raise HTTPException(401, "Invalid API key")
    
    return username
```

### API Key Management

```python
@dataclass
class ApiKey:
    """API key for external access."""
    id: str
    key: str  # Hashed
    name: str
    created_at: datetime
    last_used: Optional[datetime] = None
    expires_at: Optional[datetime] = None

class UsersStore:
    # ... existing code ...
    
    def create_api_key(self, username: str, name: str, expires_days: Optional[int] = None) -> str:
        """Create a new API key for user."""
        if username not in self.api_keys:
            self.api_keys[username] = []
        
        # Generate key
        key = f"mb-{secrets.token_urlsafe(32)}"
        key_hash = pwd_context.hash(key)
        
        # Create record
        api_key = ApiKey(
            id=str(uuid.uuid4()),
            key=key_hash,
            name=name,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=expires_days) if expires_days else None
        )
        
        self.api_keys[username].append(api_key)
        
        return key  # Return unhashed key (only time it's visible)
    
    def get_user_by_api_key(self, key: str) -> Optional[str]:
        """Find user by API key."""
        for username, keys in self.api_keys.items():
            for api_key in keys:
                if pwd_context.verify(key, api_key.key):
                    # Check expiration
                    if api_key.expires_at and api_key.expires_at < datetime.utcnow():
                        continue
                    
                    # Update last used
                    api_key.last_used = datetime.utcnow()
                    return username
        
        return None
```

### Settings UI for API Keys

```typescript
// SettingsPage.tsx addition
function ApiKeysSection() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  
  const createApiKey = async () => {
    const response = await fetch(`${API_URL}/api/keys`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name: newKeyName })
    })
    
    if (response.ok) {
      const data = await response.json()
      setCreatedKey(data.key)  // Show once
      loadApiKeys()
    }
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Create new key */}
          <div className="flex gap-2">
            <Input
              placeholder="Key name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
            <Button onClick={createApiKey}>Create Key</Button>
          </div>
          
          {/* Show created key once */}
          {createdKey && (
            <Alert>
              <AlertTitle>New API Key Created</AlertTitle>
              <AlertDescription>
                <code className="block p-2 bg-gray-100 rounded">
                  {createdKey}
                </code>
                <p className="text-sm text-red-600 mt-2">
                  Save this key now. You won't be able to see it again.
                </p>
              </AlertDescription>
            </Alert>
          )}
          
          {/* List existing keys */}
          <div className="space-y-2">
            {apiKeys.map(key => (
              <div key={key.id} className="flex justify-between items-center p-2 border rounded">
                <div>
                  <div className="font-medium">{key.name}</div>
                  <div className="text-sm text-gray-500">
                    Created {new Date(key.created_at).toLocaleDateString()}
                  </div>
                </div>
                <Button variant="destructive" size="sm" onClick={() => deleteKey(key.id)}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

## Model Mapping

```python
MODEL_MAPPING = {
    "multibrain-default": {
        "providers": ["openai", "anthropic", "gemini", "perplexity"],
        "synthesis": "gemini"
    },
    "multibrain-fast": {
        "providers": ["openai", "gemini"],  # Fewer providers for speed
        "synthesis": "gemini"
    },
    "multibrain-quality": {
        "providers": ["openai", "anthropic", "gemini"],  # Skip Perplexity
        "synthesis": "gemini"
    },
    # Pass-through to specific providers
    "gpt-4o": {
        "providers": ["openai"],
        "synthesis": None  # No synthesis, direct response
    },
    "claude-3-5-sonnet": {
        "providers": ["anthropic"],
        "synthesis": None
    },
    "gemini-1.5-pro": {
        "providers": ["gemini"],
        "synthesis": None
    }
}
```

## Client Examples

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    api_key="mb-your-api-key-here",
    base_url="https://app-jecgxfyn.fly.dev/v1"
)

# Standard usage
response = client.chat.completions.create(
    model="multibrain-default",
    messages=[
        {"role": "user", "content": "What is the capital of France?"}
    ]
)

print(response.choices[0].message.content)

# With MultiBrain extensions
response = client.chat.completions.create(
    model="multibrain-default",
    messages=[
        {"role": "user", "content": "What is the capital of France?"}
    ],
    extra_body={
        "multibrain": {
            "include_provider_details": True,
            "distillation_fidelity": "high"
        }
    }
)

# Access MultiBrain details
print(response.multibrain["attribution"])
```

### Streaming

```python
stream = client.chat.completions.create(
    model="multibrain-default",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### cURL

```bash
curl https://app-jecgxfyn.fly.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mb-your-api-key" \
  -d '{
    "model": "multibrain-default",
    "messages": [
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }'
```

## Rate Limiting

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/v1/chat/completions")
@limiter.limit("60/minute")  # 60 requests per minute
async def chat_completions(request: Request, ...):
    # ... existing code ...
```

## Usage Tracking

```python
@dataclass
class ApiUsage:
    """Track API usage per user."""
    user_id: str
    date: date
    requests: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    estimated_cost: float = 0.0

def track_usage(username: str, tokens_in: int, tokens_out: int, cost: float):
    """Track API usage."""
    today = date.today()
    key = f"{username}:{today}"
    
    if key not in usage_tracker:
        usage_tracker[key] = ApiUsage(username, today)
    
    usage_tracker[key].requests += 1
    usage_tracker[key].tokens_in += tokens_in
    usage_tracker[key].tokens_out += tokens_out
    usage_tracker[key].estimated_cost += cost
```

## Documentation

### API Reference Page

Create `/docs/api` endpoint with:
- Authentication guide
- Request/response formats
- Code examples
- Rate limits
- Error codes
- MultiBrain extensions

### OpenAPI Spec

```python
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title="MultiBrain API",
        version="1.0.0",
        description="OpenAI-compatible API with multi-provider aggregation",
        routes=app.routes,
    )
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi
```

## Security Considerations

1. **API Key Storage**: Hash keys with bcrypt, never store plaintext
2. **Rate Limiting**: Prevent abuse with per-user limits
3. **Input Validation**: Sanitize all inputs
4. **CORS**: Restrict to known domains in production
5. **Logging**: Log API usage but not sensitive data
6. **Expiration**: Support key expiration and rotation

## Migration Path

### Phase 1: Basic Endpoint
- Implement `/v1/chat/completions` (non-streaming)
- Basic authentication with JWT tokens
- Standard OpenAI response format

### Phase 2: Streaming
- Add SSE streaming support
- Implement proper token-by-token streaming
- Add TTFT metrics

### Phase 3: API Keys
- Dedicated API key management
- Settings UI for key creation/deletion
- Usage tracking

### Phase 4: Extensions
- MultiBrain-specific fields
- Provider filtering
- Attribution data

## Success Metrics

- ✅ OpenAI SDK compatibility (drop-in replacement)
- ✅ Streaming support with proper SSE format
- ✅ API key management UI
- ✅ Rate limiting and usage tracking
- ✅ Documentation and examples

## Timeline

- **Week 1**: Basic endpoint + authentication
- **Week 2**: Streaming support
- **Week 3**: API key management
- **Week 4**: Extensions + documentation

# Multimodal Support Proposal

## Executive Summary

This proposal outlines a phased approach to adding multimodal input/output support to MultiBrain. The system will support images, PDFs, audio, tables, charts, spreadsheets, and video across OpenAI, Anthropic, Gemini, and Perplexity (where supported).

## Supported Modalities

Based on provider research (see MULTIMODAL_RESEARCH.md):

| Modality | OpenAI | Anthropic | Gemini | Perplexity | Phase |
|----------|--------|-----------|--------|------------|-------|
| Images | ✅ | ✅ | ✅ | ❌ | 1 |
| PDFs (text) | ✅ | ⚠️ | ✅ | ❌ | 1 |
| Tables/Spreadsheets | ✅ | ⚠️ | ✅ | ❌ | 1 |
| Audio | ✅ | ❌ | ✅ | ❌ | 2 |
| Video | ⚠️ | ❌ | ✅ | ❌ | 2 |
| Charts (as images) | ✅ | ✅ | ✅ | ❌ | 1 |

## Architecture

### Upload Pipeline

```
User Upload → Frontend → Backend API → Normalization → Provider Adapters → Providers
                                              ↓
                                         Storage (S3)
```

### Data Model

```python
@dataclass
class Attachment:
    """Normalized attachment representation."""
    id: str
    type: AttachmentType  # image, audio, video, document, table
    filename: str
    content_type: str  # MIME type
    size_bytes: int
    storage_url: str  # S3 URL or local path
    metadata: Dict[str, Any]
    processed_data: Optional[Dict[str, Any]] = None  # Extracted text, transcripts, etc.

@dataclass
class AttachmentPart:
    """Provider-specific representation."""
    type: str  # text, image_url, image_data, file_ref
    content: Any
    metadata: Dict[str, Any]
```

### Message Model Update

```python
@dataclass
class MessageRecord:
    """A single message in a conversation."""
    id: str
    role: str
    content: str
    attachments: List[Attachment] = field(default_factory=list)  # NEW
    provider_responses: Optional[Dict] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
```

## Phase 1: Core Multimodal (Weeks 1-3)

### Supported Modalities
- **Images**: JPEG, PNG, GIF, WebP
- **PDFs**: Text extraction + optional page images
- **Tables/Spreadsheets**: CSV, XLSX → Markdown tables
- **Charts**: As images

### Implementation Steps

#### 1. Frontend Upload Component

```typescript
// New component: AttachmentUpload.tsx
interface AttachmentUploadProps {
  onUpload: (files: File[]) => void
  maxFiles?: number
  maxSizeBytes?: number
  acceptedTypes?: string[]
}

// Supported types for Phase 1
const PHASE1_TYPES = [
  'image/jpeg',
  'image/png', 
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
```

#### 2. Backend Upload Endpoint

```python
@app.post("/api/conversations/{conversation_id}/attachments")
async def upload_attachment(
    conversation_id: str,
    file: UploadFile,
    username: str = Depends(verify_token)
):
    # Validate file type and size
    if file.size > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large")
    
    # Store file (S3 or local)
    storage_url = await store_file(file)
    
    # Create attachment record
    attachment = Attachment(
        id=str(uuid.uuid4()),
        type=detect_type(file.content_type),
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=file.size,
        storage_url=storage_url,
        metadata={}
    )
    
    # Process based on type
    if attachment.type == AttachmentType.PDF:
        attachment.processed_data = await extract_pdf_text(storage_url)
    elif attachment.type == AttachmentType.TABLE:
        attachment.processed_data = await parse_table(storage_url)
    
    return attachment
```

#### 3. Normalization Layer

```python
class AttachmentNormalizer:
    """Convert attachments to provider-specific formats."""
    
    async def normalize_for_openai(self, attachment: Attachment) -> List[Dict]:
        if attachment.type == AttachmentType.IMAGE:
            return [{
                "type": "image_url",
                "image_url": {"url": attachment.storage_url}
            }]
        elif attachment.type == AttachmentType.PDF:
            # Use extracted text
            return [{
                "type": "text",
                "text": f"[PDF: {attachment.filename}]\n{attachment.processed_data['text']}"
            }]
        elif attachment.type == AttachmentType.TABLE:
            return [{
                "type": "text",
                "text": f"[Table: {attachment.filename}]\n{attachment.processed_data['markdown']}"
            }]
    
    async def normalize_for_anthropic(self, attachment: Attachment) -> List[Dict]:
        if attachment.type == AttachmentType.IMAGE:
            # Anthropic requires base64
            image_data = await load_image_base64(attachment.storage_url)
            return [{
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": attachment.content_type,
                    "data": image_data
                }
            }]
        else:
            # Text fallback
            return await self.normalize_for_openai(attachment)
    
    async def normalize_for_gemini(self, attachment: Attachment) -> List[Dict]:
        if attachment.type == AttachmentType.IMAGE:
            return [{
                "mime_type": attachment.content_type,
                "data": await load_image_base64(attachment.storage_url)
            }]
        elif attachment.type == AttachmentType.PDF:
            # Gemini supports native PDF
            return [{
                "mime_type": "application/pdf",
                "data": await load_file_base64(attachment.storage_url)
            }]
        else:
            return await self.normalize_for_openai(attachment)
```

#### 4. Provider Adapter Updates

```python
async def call_openai(
    prompt: str, 
    settings: Settings, 
    context_messages: Optional[List[Dict]] = None,
    attachments: Optional[List[Attachment]] = None
) -> ProviderResponse:
    # ... existing code ...
    
    messages = context_messages or []
    
    # Add user message with attachments
    user_message = {"role": "user", "content": []}
    
    # Add attachments first
    if attachments:
        normalizer = AttachmentNormalizer()
        for attachment in attachments:
            parts = await normalizer.normalize_for_openai(attachment)
            user_message["content"].extend(parts)
    
    # Add text prompt
    user_message["content"].append({"type": "text", "text": prompt})
    
    messages.append(user_message)
    
    # ... rest of existing code ...
```

#### 5. Storage Configuration

```python
# config.py
class StorageConfig:
    STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")  # local | s3
    
    # Local storage
    LOCAL_STORAGE_PATH = os.getenv("LOCAL_STORAGE_PATH", "/tmp/multibrain/uploads")
    
    # S3 storage
    S3_BUCKET = os.getenv("S3_BUCKET", "multibrain-uploads")
    S3_REGION = os.getenv("S3_REGION", "us-east-1")
    S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY")
    S3_SECRET_KEY = os.getenv("S3_SECRET_KEY")
    
    # Limits
    MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 100 * 1024 * 1024))  # 100MB
    MAX_FILES_PER_MESSAGE = int(os.getenv("MAX_FILES_PER_MESSAGE", 10))
    
    # Retention
    FILE_RETENTION_DAYS = int(os.getenv("FILE_RETENTION_DAYS", 30))
```

### File Processing

#### PDF Processing

```python
async def extract_pdf_text(file_path: str) -> Dict[str, Any]:
    """Extract text and optionally page images from PDF."""
    import PyPDF2
    
    with open(file_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        
        text_parts = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            text_parts.append(f"[Page {i+1}]\n{text}")
        
        return {
            "text": "\n\n".join(text_parts),
            "page_count": len(reader.pages),
            "metadata": reader.metadata
        }
```

#### Table Processing

```python
async def parse_table(file_path: str) -> Dict[str, Any]:
    """Parse CSV/Excel to Markdown table."""
    import pandas as pd
    
    # Detect file type
    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)
    
    # Convert to Markdown
    markdown = df.to_markdown(index=False)
    
    return {
        "markdown": markdown,
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": df.columns.tolist()
    }
```

#### Image Processing

```python
async def process_image(file_path: str) -> Dict[str, Any]:
    """Validate and optionally resize image."""
    from PIL import Image
    
    img = Image.open(file_path)
    
    # Resize if too large (> 20MB or > 4096px)
    max_dimension = 4096
    if max(img.size) > max_dimension:
        img.thumbnail((max_dimension, max_dimension))
        img.save(file_path)
    
    return {
        "width": img.size[0],
        "height": img.size[1],
        "format": img.format,
        "mode": img.mode
    }
```

## Phase 2: Advanced Multimodal (Weeks 4-6)

### Supported Modalities
- **Audio**: MP3, WAV, M4A → Transcription
- **Video**: MP4, MOV → Frame extraction + audio transcription

### Audio Processing

```python
async def process_audio(file_path: str, settings: Settings) -> Dict[str, Any]:
    """Transcribe audio using Whisper API."""
    client = AsyncOpenAI(api_key=settings.openai.api_key)
    
    with open(file_path, 'rb') as audio_file:
        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json"
        )
    
    return {
        "transcript": transcript.text,
        "language": transcript.language,
        "duration": transcript.duration,
        "segments": transcript.segments
    }
```

### Video Processing

```python
async def process_video(file_path: str, settings: Settings) -> Dict[str, Any]:
    """Extract frames and audio from video."""
    import cv2
    import subprocess
    
    # Extract audio
    audio_path = file_path.replace('.mp4', '.mp3')
    subprocess.run([
        'ffmpeg', '-i', file_path,
        '-vn', '-acodec', 'libmp3lame',
        audio_path
    ])
    
    # Transcribe audio
    audio_data = await process_audio(audio_path, settings)
    
    # Extract frames (1 fps)
    cap = cv2.VideoCapture(file_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_interval = int(fps)  # 1 frame per second
    
    frames = []
    frame_count = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_count % frame_interval == 0:
            frame_path = f"{file_path}_frame_{frame_count}.jpg"
            cv2.imwrite(frame_path, frame)
            frames.append(frame_path)
        
        frame_count += 1
    
    cap.release()
    
    return {
        "transcript": audio_data["transcript"],
        "frame_paths": frames,
        "frame_count": len(frames),
        "duration": frame_count / fps
    }
```

### Gemini Native Video Support

```python
async def call_gemini_with_video(
    prompt: str,
    video_path: str,
    settings: Settings
) -> ProviderResponse:
    """Use Gemini's native video understanding."""
    import google.generativeai as genai
    
    genai.configure(api_key=settings.gemini.api_key)
    
    # Upload video to Gemini File API
    video_file = genai.upload_file(path=video_path)
    
    # Wait for processing
    while video_file.state.name == "PROCESSING":
        await asyncio.sleep(1)
        video_file = genai.get_file(video_file.name)
    
    # Generate content
    model = genai.GenerativeModel("gemini-1.5-pro")
    response = await model.generate_content_async([video_file, prompt])
    
    return ProviderResponse(
        provider="Gemini",
        model="gemini-1.5-pro",
        response=response.text,
        success=True
    )
```

## Phase 3: Response Multimodality (Weeks 7-8)

### Structured Output Parsing

```python
@dataclass
class StructuredResponse:
    """Parsed provider response with structured elements."""
    text: str
    images: List[str] = field(default_factory=list)
    code_blocks: List[Dict[str, str]] = field(default_factory=list)
    tables: List[str] = field(default_factory=list)
    citations: List[Dict[str, str]] = field(default_factory=list)
```

### Frontend Rendering

```typescript
// Enhanced message display with multimodal support
function MessageContent({ message }: { message: Message }) {
  return (
    <div className="message-content">
      {/* Text content */}
      <div className="prose">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
      
      {/* Attachments */}
      {message.attachments?.map(att => (
        <AttachmentPreview key={att.id} attachment={att} />
      ))}
      
      {/* Code blocks */}
      {message.code_blocks?.map((block, i) => (
        <CodeBlock key={i} language={block.language} code={block.code} />
      ))}
      
      {/* Tables */}
      {message.tables?.map((table, i) => (
        <TableView key={i} markdown={table} />
      ))}
    </div>
  )
}
```

## Storage Strategy

### Development (Phase 1)
- **Backend**: Local filesystem (`/tmp/multibrain/uploads`)
- **Retention**: Session-based (cleared on restart)
- **Pros**: Simple, no external dependencies
- **Cons**: Not durable, not scalable

### Production (Phase 2+)
- **Backend**: AWS S3 or Google Cloud Storage
- **Retention**: Configurable (default 30 days)
- **Pros**: Durable, scalable, CDN-ready
- **Cons**: Requires cloud account and credentials

```python
class StorageBackend:
    """Abstract storage interface."""
    
    async def store(self, file: UploadFile) -> str:
        """Store file and return URL."""
        raise NotImplementedError
    
    async def retrieve(self, url: str) -> bytes:
        """Retrieve file contents."""
        raise NotImplementedError
    
    async def delete(self, url: str) -> bool:
        """Delete file."""
        raise NotImplementedError

class LocalStorage(StorageBackend):
    async def store(self, file: UploadFile) -> str:
        path = f"{LOCAL_STORAGE_PATH}/{uuid.uuid4()}_{file.filename}"
        with open(path, 'wb') as f:
            f.write(await file.read())
        return f"file://{path}"

class S3Storage(StorageBackend):
    async def store(self, file: UploadFile) -> str:
        key = f"uploads/{uuid.uuid4()}_{file.filename}"
        s3_client.upload_fileobj(file.file, S3_BUCKET, key)
        return f"https://{S3_BUCKET}.s3.amazonaws.com/{key}"
```

## Size Limits & Constraints

### Phase 1 Limits
- **Images**: 20MB per image, 10 images per message
- **PDFs**: 100MB per PDF, 1 PDF per message
- **Tables**: 10MB per file, 1 file per message
- **Total**: 200MB per message

### Phase 2 Limits
- **Audio**: 100MB per file, 25MB for Whisper API
- **Video**: 500MB per file, 1 hour max duration
- **Total**: 1GB per message

### Provider-Specific Limits
- **OpenAI**: 20MB per image, varies by model for context
- **Anthropic**: 5MB per image, ~1600 images max
- **Gemini**: 2GB per file via File API, up to 2M tokens context
- **Perplexity**: Text only

## Error Handling

```python
class AttachmentError(Exception):
    """Base class for attachment errors."""
    pass

class FileTooLargeError(AttachmentError):
    """File exceeds size limit."""
    pass

class UnsupportedFileTypeError(AttachmentError):
    """File type not supported."""
    pass

class ProcessingError(AttachmentError):
    """Error processing file."""
    pass

# Usage
try:
    attachment = await process_attachment(file)
except FileTooLargeError:
    return {"error": "File too large", "max_size": MAX_FILE_SIZE}
except UnsupportedFileTypeError:
    return {"error": "File type not supported", "accepted_types": ACCEPTED_TYPES}
except ProcessingError as e:
    return {"error": f"Processing failed: {str(e)}"}
```

## Security Considerations

### File Validation
- Verify MIME type matches file extension
- Scan for malware (ClamAV integration)
- Limit file sizes to prevent DoS
- Sanitize filenames

### Access Control
- Users can only access their own attachments
- Generate signed URLs with expiration (S3 presigned URLs)
- No directory traversal vulnerabilities

### Privacy
- Encrypt files at rest (S3 encryption)
- Encrypt files in transit (HTTPS)
- Automatic deletion after retention period
- No logging of file contents

## Dependencies

### Python Packages
```toml
# pyproject.toml additions
[tool.poetry.dependencies]
# Existing...
PyPDF2 = "^3.0.0"  # PDF processing
pandas = "^2.0.0"  # Table processing
openpyxl = "^3.1.0"  # Excel support
Pillow = "^10.0.0"  # Image processing
python-multipart = "^0.0.6"  # File uploads
boto3 = "^1.28.0"  # S3 storage (optional)
opencv-python = "^4.8.0"  # Video processing (Phase 2)
```

### System Dependencies (Phase 2)
```bash
# For video processing
apt-get install ffmpeg

# For malware scanning (optional)
apt-get install clamav
```

## Testing Strategy

### Unit Tests
- File upload validation
- MIME type detection
- Size limit enforcement
- Processing functions (PDF, table, image)

### Integration Tests
- End-to-end upload → process → provider call
- Multi-attachment messages
- Error handling
- Storage backend switching

### Manual Testing
- Upload various file types
- Test with each provider
- Verify response quality
- Check storage and cleanup

## Migration Path

### Existing Conversations
- No changes required (attachments optional)
- Backward compatible message format

### Database Migration
```python
# Add attachments field to MessageRecord
# Already using dataclass, just add default
@dataclass
class MessageRecord:
    # ... existing fields ...
    attachments: List[Attachment] = field(default_factory=list)  # NEW
```

## Success Metrics

### Phase 1
- ✅ Support images, PDFs, tables
- ✅ 3 providers with multimodal (OpenAI, Anthropic, Gemini)
- ✅ Local storage working
- ✅ File size limits enforced
- ✅ Basic error handling

### Phase 2
- ✅ Support audio and video
- ✅ S3 storage integration
- ✅ Gemini native video support
- ✅ Automatic cleanup/retention

### Phase 3
- ✅ Structured response parsing
- ✅ Rich frontend rendering
- ✅ Citation support
- ✅ Performance optimization

## Timeline

- **Week 1-2**: Frontend upload UI + backend endpoints
- **Week 2-3**: PDF and table processing + provider adapters
- **Week 3**: Image support across all providers
- **Week 4-5**: Audio transcription
- **Week 5-6**: Video processing
- **Week 7-8**: Response multimodality + polish

## Open Questions

1. Should we support real-time collaboration on attachments?
2. Should we cache processed attachments (e.g., PDF text extraction)?
3. Should we support attachment versioning?
4. Should we integrate with external storage (Google Drive, Dropbox)?
5. Should we support OCR for scanned PDFs?

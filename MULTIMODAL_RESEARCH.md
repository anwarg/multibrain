# Multimodal Capabilities Research

## Overview
Research on multimodal input/output capabilities for OpenAI, Perplexity, Anthropic, and Gemini as of November 2025.

## OpenAI

### Input Capabilities
- **Text**: Full support across all models
- **Images**: GPT-4o, GPT-4 Turbo, GPT-4o mini support image inputs via URL or base64
  - Supports JPEG, PNG, GIF, WebP formats
  - Max image size: 20MB per image
  - Multiple images per request supported
- **Audio**: 
  - Whisper API for audio transcription (mp3, mp4, mpeg, mpga, m4a, wav, webm)
  - GPT-4o audio preview supports native audio input/output
- **Video**: Not directly supported; common pattern is to extract frames + audio
- **Files/Documents**:
  - Assistants API supports file uploads (PDFs, DOCX, etc.) up to 512MB
  - File Search tool can process documents
  - Code Interpreter can process spreadsheets (CSV, XLSX)
- **Tables/Charts**: Can be provided as images or structured text

### Output Capabilities
- **Text**: Full support with streaming
- **Images**: DALL-E 3 for image generation (separate API)
- **Audio**: GPT-4o audio preview supports audio output
- **Structured data**: JSON mode, function calling

### API Details
- Streaming: Yes (SSE)
- Context window: Up to 128K tokens (GPT-4 Turbo)
- Rate limits: Tier-based

## Anthropic

### Input Capabilities
- **Text**: Full support across Claude models
- **Images**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
  - Supports JPEG, PNG, GIF, WebP formats
  - Base64 encoded or via URL (with media_type)
  - Max 5MB per image, multiple images supported
  - Max ~1600 images per request
- **Audio**: Not directly supported; requires transcription first
- **Video**: Not directly supported; requires frame extraction
- **Files/Documents**: 
  - PDFs can be converted to images (page-by-page) or text extraction
  - No native file upload API like OpenAI Assistants
- **Tables/Charts**: Can be provided as images or Markdown tables

### Output Capabilities
- **Text**: Full support with streaming
- **Images**: Not supported (text-only output)
- **Structured data**: Can output JSON, XML

### API Details
- Streaming: Yes (SSE)
- Context window: Up to 200K tokens (Claude 3.5 Sonnet)
- Rate limits: Tier-based

## Gemini

### Input Capabilities
- **Text**: Full support
- **Images**: Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0 Flash
  - Supports JPEG, PNG, WebP, HEIC, HEIF
  - Inline data (base64) or File API
  - Multiple images supported
- **Audio**: 
  - Gemini 1.5 Pro/Flash support audio files
  - Formats: WAV, MP3, AIFF, AAC, OGG, FLAC
  - Up to 9.5 hours of audio
- **Video**:
  - Gemini 1.5 Pro/Flash support video files
  - Formats: MP4, MPEG, MOV, AVI, FLV, MPG, WEBM, WMV, 3GPP
  - Up to 1 hour of video
  - Native video understanding (no need for frame extraction)
- **Files/Documents**:
  - File API supports large files up to 2GB
  - PDF support (native understanding)
  - Long context: up to 2M tokens (Gemini 1.5 Pro)
- **Tables/Charts**: Can process from images, PDFs, or structured text

### Output Capabilities
- **Text**: Full support with streaming
- **Images**: Imagen 3 for image generation (separate API)
- **Structured data**: JSON mode

### API Details
- Streaming: Yes
- Context window: Up to 2M tokens (Gemini 1.5 Pro)
- Rate limits: Quota-based

## Perplexity

### Input Capabilities
- **Text**: Full support
- **Images**: Limited/unclear multimodal support in API
  - Primarily focused on text + web search/retrieval
  - Some models may support images but not well documented
- **Audio**: Not supported
- **Video**: Not supported
- **Files/Documents**: Not directly supported
- **Tables/Charts**: Text-based only

### Output Capabilities
- **Text**: Full support with citations
- **Images**: Not supported
- **Structured data**: Text with inline citations

### API Details
- Streaming: Yes
- Context window: Model-dependent
- Focus: Search-augmented generation

## Summary Matrix

| Provider | Images | Audio | Video | PDFs | Spreadsheets | Native Streaming | Best For |
|----------|--------|-------|-------|------|--------------|------------------|----------|
| OpenAI | ✅ Strong | ✅ Whisper/GPT-4o | ❌ (frames) | ✅ Assistants | ✅ Code Interp | ✅ | General multimodal |
| Anthropic | ✅ Strong | ❌ | ❌ | ⚠️ (as images) | ⚠️ (as text) | ✅ | Image + text |
| Gemini | ✅ Strong | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ | Rich multimodal |
| Perplexity | ⚠️ Limited | ❌ | ❌ | ❌ | ❌ | ✅ | Text + search |

## Recommendations for MultiBrain v1

### Phase 1: Core Multimodal (MVP)
1. **Images**: Implement for OpenAI, Anthropic, Gemini (skip Perplexity)
2. **PDFs**: Text extraction for all; native support for Gemini
3. **Audio**: Transcribe via Whisper, then send text to all providers
4. **Tables/Spreadsheets**: Convert to Markdown tables for all providers

### Phase 2: Advanced Multimodal
1. **Video**: Native support for Gemini; frame extraction for OpenAI
2. **Audio**: Native audio for Gemini; keep transcription for others
3. **Large files**: Use Gemini File API for documents > 10MB

### Phase 3: Provider-Specific Features
1. OpenAI Assistants API integration for file search
2. Code Interpreter for spreadsheet analysis
3. Perplexity for text-only search augmentation

## Implementation Notes

### Upload Pipeline
1. User uploads file(s) via frontend
2. Backend normalizes to common format:
   ```python
   {
     "type": "text" | "image" | "audio" | "video" | "file",
     "content": "...",  # text or base64
     "content_type": "image/jpeg",
     "url": "...",  # optional
     "metadata": {...}
   }
   ```
3. Provider adapters convert to provider-specific format

### Storage Considerations
- **Development**: Local ephemeral storage
- **Production**: S3/GCS with presigned URLs
- **Max sizes**: 
  - Images: 20MB
  - Audio: 100MB
  - Video: 500MB
  - PDFs: 100MB
  - Total per request: 1GB

### Processing Pipeline
- **Images**: Pass through (resize if > 20MB)
- **Audio**: Transcribe with Whisper API
- **Video**: 
  - Extract audio → transcribe
  - Sample frames (1 fps) → send as images
  - For Gemini: send native video
- **PDFs**: 
  - Extract text with PyPDF2/pdfplumber
  - For Gemini: send native PDF
- **Spreadsheets**: Parse with pandas → Markdown table

# MultiBrain

MultiBrain is a multi-provider AI aggregation platform that allows you to query multiple AI models simultaneously and receive a synthesized, unified response. It features multi-user support, conversation history with context preservation, and secure API key storage.

## Features

- **Multi-Provider Support**: Query OpenAI (ChatGPT), Perplexity, Anthropic (Claude), and Google Gemini simultaneously
- **Intelligent Synthesis**: Automatically synthesizes responses from multiple providers into a coherent, comprehensive answer using Gemini Thinking Mode
- **Multi-User Accounts**: Secure user registration and authentication with per-user API key storage
- **Conversation History**: Create and manage multiple conversations with full message history
- **Context Preservation**: Automatic conversation distillation to maintain context across long multi-turn conversations
- **Flexible Distillation**: Choose between single-model or per-model distillation strategies
- **Secure Storage**: Encrypted API key storage and bcrypt password hashing
- **Quick Prompt Mode**: Single-shot prompting without conversation history

## Architecture

### Backend (FastAPI + Python)
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **Storage**: In-memory data store with encrypted API keys (Fernet encryption)
- **Providers**: Async API calls to OpenAI, Perplexity, Anthropic, and Gemini
- **Distillation**: Intelligent conversation summarization for context preservation

### Frontend (React + TypeScript + Vite)
- **UI Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React hooks
- **Routing**: Client-side routing with conditional rendering

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- Poetry (Python package manager)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
poetry install
```

3. Create a `.env` file with the following variables:
```env
JWT_SECRET_KEY=your-secret-key-here
AUTH_USERNAME=admin
AUTH_PASSWORD=admin123
API_KEYS_ENC_KEY=your-fernet-key-here
ALLOW_SELF_REG=true
```

To generate a Fernet key for `API_KEYS_ENC_KEY`:
```python
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

4. Start the development server:
```bash
poetry run fastapi dev app/main.py
```

The backend will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
VITE_API_URL=http://localhost:8000
```

4. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Usage

### First Time Setup

1. Access the application at `http://localhost:5173`
2. Log in with default credentials: `admin` / `admin123`
3. Navigate to Settings and configure your API keys for the providers you want to use
4. Configure distillation settings (single-model or per-model)
5. Change your password for security

### Creating Conversations

1. Click "New Conversation" in the sidebar
2. Enter a title for your conversation
3. Start chatting! Your messages will be sent to all enabled providers
4. View the synthesized response, or expand provider details to see individual responses

### Quick Prompt Mode

1. Click "Quick Prompt" in the header
2. Enter a single prompt to get responses from all providers
3. No conversation history is maintained in this mode

## Configuration

### Distillation Settings

MultiBrain offers two distillation modes for preserving context in long conversations:

- **Single Model**: Use one model (default: Gemini) to distill all conversation history
- **Per-Model**: Each provider distills its own conversation turns

Distillation automatically triggers when:
- Conversation exceeds 8 turns, OR
- Total message content exceeds 4000 characters

### Provider Settings

Each provider can be individually configured with:
- API Key (encrypted at rest)
- Model selection
- Enable/disable toggle

## Security

- **Password Storage**: Passwords are hashed using bcrypt
- **API Key Storage**: API keys are encrypted using Fernet symmetric encryption
- **Authentication**: JWT tokens with configurable expiration
- **Per-User Isolation**: Each user's data is completely isolated

## Deployment

### Backend Deployment (Fly.io)

The backend can be deployed to Fly.io using the deployment tools provided.

### Frontend Deployment

The frontend can be deployed as a static site to any hosting provider.

## Environment Variables

### Backend
- `JWT_SECRET_KEY`: Secret key for JWT token generation
- `AUTH_USERNAME`: Default admin username (default: admin)
- `AUTH_PASSWORD`: Default admin password (default: admin123)
- `API_KEYS_ENC_KEY`: Fernet encryption key for API keys
- `ALLOW_SELF_REG`: Allow self-registration (true/false, default: true)

### Frontend
- `VITE_API_URL`: Backend API URL

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - Login
- `POST /api/change-password` - Change password

### Settings
- `GET /api/settings` - Get user settings (masked API keys)
- `POST /api/settings` - Update user settings

### Conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations` - List user's conversations
- `GET /api/conversations/{id}` - Get conversation with messages
- `POST /api/conversations/{id}/messages` - Send message in conversation
- `DELETE /api/conversations/{id}` - Delete conversation

### Quick Prompt
- `POST /api/prompt` - Send single prompt (no conversation history)

## Technology Stack

### Backend
- FastAPI
- Python 3.12
- Poetry
- Pydantic
- Passlib (bcrypt)
- Cryptography (Fernet)
- OpenAI SDK
- Anthropic SDK
- Google Generative AI SDK
- httpx

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Lucide Icons

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

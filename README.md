# MultiBrain

MultiBrain is a multi-provider AI aggregation platform that allows you to query multiple AI models simultaneously and receive a synthesized, unified response. It features multi-user support, conversation history with context preservation, configurable distillation fidelity, and secure API key storage.

## What MultiBrain Does

MultiBrain acts as an intelligent aggregator that queries multiple AI providers (OpenAI, Perplexity, Anthropic, and Google Gemini) in parallel, collects their responses, and synthesizes them into a single coherent answer. This approach leverages the strengths of different AI models to provide more comprehensive and balanced responses than any single provider could offer alone.

The platform maintains conversation history across multiple turns while intelligently managing context through configurable distillation strategies. When conversations grow long, MultiBrain automatically summarizes the history to preserve essential context without overwhelming the AI models with excessive token counts. Users can control the granularity of this distillation through fidelity settings, balancing between detailed context preservation and concise summaries.

## Features

- **Multi-Provider Support**: Query OpenAI (ChatGPT), Perplexity, Anthropic (Claude), and Google Gemini simultaneously
- **Intelligent Synthesis**: Automatically synthesizes responses from multiple providers into a coherent, comprehensive answer using Gemini Thinking Mode
- **Multi-User Accounts**: Secure user registration and authentication with per-user API key storage
- **Conversation History**: Create and manage multiple conversations with full message history
- **Context Preservation**: Automatic conversation distillation to maintain context across long multi-turn conversations
- **Configurable Fidelity**: Control the granularity of context distillation (high/standard/low) globally and per-conversation
- **Flexible Distillation**: Choose between single-model or per-model distillation strategies
- **Secure Storage**: Encrypted API key storage and bcrypt password hashing
- **Quick Prompt Mode**: Single-shot prompting without conversation history
- **Collapsible Provider Details**: View synthesized response prominently with expandable provider details

## Architecture

### Backend (FastAPI + Python)
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **Storage**: In-memory data store with encrypted API keys (Fernet encryption)
- **Providers**: Async API calls to OpenAI, Perplexity, Anthropic, and Gemini
- **Distillation**: Intelligent conversation summarization for context preservation with configurable fidelity

### Frontend (React + TypeScript + Vite)
- **UI Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React hooks
- **Routing**: Client-side routing with conditional rendering

## Design Points

### Security Architecture

**Password Security**: User passwords are hashed using bcrypt with automatic salt generation. The system never stores plaintext passwords, and password verification is performed through secure hash comparison. The default admin account is created at startup with a hashed password.

**API Key Encryption**: All provider API keys are encrypted at rest using Fernet symmetric encryption. A master encryption key (API_KEYS_ENC_KEY) is required for the backend to function. API keys are only decrypted in memory immediately before making provider API calls and are never logged or returned in API responses. The GET /api/settings endpoint returns masked API keys (***) to prevent accidental exposure.

**Authentication Flow**: The system uses JWT tokens with configurable expiration times. Each token contains the username as the subject claim. All protected endpoints verify the JWT token and extract the username to ensure per-user data isolation.

### Multi-User Data Isolation

**Per-User Storage**: Each user has their own isolated settings and conversations. The UsersStore maintains separate dictionaries for user records and per-user conversation collections. All API endpoints that access user data require authentication and use the verified username to scope data access.

**Settings Isolation**: Provider API keys, model preferences, and distillation settings are stored per-user. When a user updates their settings, only their own encrypted settings are modified. This ensures that users cannot access or modify other users' API keys or configurations.

**Conversation Isolation**: Conversations are stored in a nested dictionary structure (username -> conversation_id -> ConversationRecord). All conversation operations verify that the authenticated user owns the conversation before allowing access or modifications.

### Context Management and Distillation

**Distillation Triggers**: The system automatically distills conversation history when either of two thresholds is exceeded: more than 8 conversation turns, or total message content exceeding 4000 characters. This prevents context windows from growing unbounded while maintaining conversation coherence.

**Incremental Summarization**: Rather than re-summarizing the entire conversation each time, the system uses incremental summarization. It takes the existing summary and the most recent messages (last 4 turns) and updates the summary to incorporate new information. This approach is more efficient and maintains consistency across the conversation.

**Fidelity Levels**: Users can control the granularity of distillation through three fidelity levels:
- **High Fidelity**: Creates detailed summaries that preserve nuances, specific details, examples, and context. Prioritizes thoroughness over brevity. Best for technical discussions or when precise details matter.
- **Standard Fidelity**: Creates balanced summaries that capture key points, important details, and essential context. Balances comprehensiveness with conciseness. Suitable for most conversations.
- **Low Fidelity**: Creates concise, high-level summaries focusing only on the most critical points and main themes. Prioritizes brevity. Useful for casual conversations or when context window size is a concern.

**Global and Per-Conversation Settings**: Users can set a global default fidelity in their settings, which applies to all new conversations. Each conversation can override this default with its own fidelity setting, allowing fine-grained control over context preservation strategies for different types of discussions.

**Distillation Modes**: The system supports two distillation modes:
- **Single Model Mode**: Uses one selected model (default: Gemini) to distill all conversation history. This provides consistent summarization style and is more cost-effective.
- **Per-Model Mode**: Each provider uses its own model to distill its conversation turns. This preserves provider-specific context and nuances but increases API costs.

**Context Window Selection**: After distillation, the system constructs the context for the next API call by combining the summary with the last N messages (default: 6). This provides both the high-level context from the summary and the immediate conversational context from recent messages.

### Provider Integration

**Parallel Execution**: All enabled provider API calls are executed concurrently using Python's asyncio. This minimizes total response time since the system waits for the slowest provider rather than the sum of all provider response times.

**Error Handling**: Each provider call is wrapped in error handling that captures failures without blocking other providers. If one provider fails, the others continue and the synthesis incorporates only the successful responses. Failed providers are marked in the response with error details.

**Synthesis Strategy**: The system uses Gemini in Thinking Mode to synthesize responses from multiple providers. The synthesis prompt instructs the model to cross-reference responses, identify consensus and disagreements, merge complementary information, and structure the output for clarity. This produces a response that is more comprehensive than any single provider's output.

**Provider Response Visibility**: The UI displays the synthesized response prominently while keeping individual provider responses collapsed by default. Users can expand a dropdown to view detailed responses from each provider, including the specific model used and any errors encountered. This design prioritizes the synthesized answer while maintaining transparency about the underlying sources.

### In-Memory Storage Design

**Proof of Concept Approach**: The system uses in-memory storage rather than a persistent database. This simplifies deployment and eliminates database dependencies, making it ideal for proof-of-concept deployments and personal use. All data (users, conversations, messages) is stored in Python dictionaries and dataclasses.

**Data Loss on Restart**: Since storage is in-memory, all user accounts, conversations, and settings are lost when the backend restarts. The system automatically recreates the default admin account on startup. For production use, the storage layer could be replaced with a persistent database without changing the API contracts.

**Encryption Key Management**: The API_KEYS_ENC_KEY must be consistent across restarts if data persistence is added later. For the current in-memory implementation, a new encryption key can be generated on each startup since no encrypted data persists.

### Frontend Architecture

**Component Structure**: The frontend is organized into distinct components: LoginPage for authentication, ConversationInterface for multi-turn conversations, PromptInterface for quick single prompts, and SettingsPage for configuration. The App component handles routing between these views based on authentication state.

**State Management**: The application uses React hooks for local state management. Authentication state (JWT token) is stored in localStorage and included in all API requests via the getAuthHeaders utility. This simple approach avoids the complexity of state management libraries while maintaining security.

**API Communication**: All API calls use the fetch API with centralized error handling. The API_URL is configured via environment variables, allowing the frontend to connect to different backend instances (local development vs. deployed production) without code changes.

**Real-Time Updates**: The conversation interface updates in real-time as messages are sent and received. The UI optimistically updates with the user's message immediately, then appends the assistant's response when the API call completes. This provides responsive feedback even when provider API calls take several seconds.

### Deployment Architecture

**Backend Deployment**: The backend is deployed to Fly.io as a containerized FastAPI application. The deployment includes all necessary dependencies specified in pyproject.toml. Environment variables (JWT_SECRET_KEY, API_KEYS_ENC_KEY, etc.) are configured in the Fly.io environment.

**Frontend Deployment**: The frontend is built as a static site (npm run build) and deployed to a static hosting service. The build process bundles all JavaScript, CSS, and assets into the dist directory. The VITE_API_URL environment variable is set to the deployed backend URL before building.

**CORS Configuration**: The backend includes CORS middleware configured to allow all origins. This is necessary for the deployed frontend to communicate with the deployed backend. In a production environment, this should be restricted to specific allowed origins.

### User Experience Design

**Conversation-First Interface**: The default view is the conversation interface, emphasizing multi-turn interactions over single prompts. This design choice reflects the platform's strength in maintaining context across extended discussions.

**Progressive Disclosure**: Provider details are hidden by default, showing only the synthesized response. Users can expand the details if they want to see individual provider responses or diagnose issues. This keeps the interface clean while maintaining transparency.

**Fidelity Control Visibility**: The fidelity setting is displayed in the conversation header as a dropdown, making it easy to adjust without navigating to settings. This placement acknowledges that users may want different fidelity levels for different conversations.

**Settings Organization**: The settings page groups related configurations together: provider API keys and models, distillation mode and model selection, and default fidelity. This organization helps users understand the relationship between different settings.

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

MultiBrain offers flexible distillation configuration:

**Distillation Modes**:
- **Single Model**: Use one model (default: Gemini) to distill all conversation history
- **Per-Model**: Each provider distills its own conversation turns

**Fidelity Levels**:
- **High**: Detailed summaries preserving nuances and specific details
- **Standard**: Balanced summaries (default)
- **Low**: Concise high-level summaries

**Global Default**: Set your preferred fidelity level in Settings, which applies to all new conversations

**Per-Conversation Override**: Each conversation can use a different fidelity level via the dropdown in the conversation header

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
- `PATCH /api/conversations/{id}/fidelity` - Update conversation fidelity setting
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

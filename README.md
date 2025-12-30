# Medical Note · SMART on FHIR

A clinical documentation assistant built with **Next.js 16**, **SMART on FHIR**, and **AI integration** (OpenAI GPT / Google Gemini). This application helps healthcare providers efficiently review patient data, generate clinical summaries, and create medical notes through voice recording and AI assistance.

## 🎯 Key Features

### Clinical Data Integration
- **SMART on FHIR OAuth 2.0** authentication with PKCE
- Real-time patient data retrieval from FHIR servers
- Comprehensive clinical data display:
  - Patient demographics and vital signs
  - Diagnoses and conditions
  - Medications and allergies
  - Diagnostic reports and observations
  - Visit history

### AI-Powered Documentation
- **Medical Chat**: Interactive AI assistant for clinical queries and note generation
- **Clinical Insights**: Automated generation of clinical summaries with customizable prompts
- **Voice Recording**: Audio recording with Whisper transcription for hands-free documentation
- **Data Selection**: Filter and select specific clinical data for context-aware AI responses

### Multi-Language Support
- English and Traditional Chinese (繁體中文) interface
- Seamless language switching

### Modern UI/UX
- Responsive design (mobile, tablet, desktop)
- Split-panel layout with resizable dividers
- Dark mode support
- Built with shadcn/ui components and Tailwind CSS

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router)
- **UI Components**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS 4
- **FHIR Client**: fhirclient 2.6.3
- **AI Integration**: OpenAI API, Google Gemini API
- **State Management**: React Context API
- **Testing**: Jest with React Testing Library
- **TypeScript**: Full type safety

---

## 📋 Prerequisites

- **Node.js**: 18.18+ or 20.x LTS
- **Package Manager**: npm, pnpm, or yarn
- **API Keys** (at least one):
  - OpenAI API key (for GPT models)
  - Google Gemini API key (for Gemini models)
- **FHIR Server**: Access to a SMART on FHIR sandbox or EHR system

---

## 🚀 Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Development Server

```bash
# Using webpack (recommended for development)
npm run dev:webpack

# Using Turbopack (experimental)
npm run dev
```

The application will be available at `http://localhost:3000`

### 3. Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### 4. Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm test:watch

# Generate coverage report
npm test:coverage
```

---

## 🔐 SMART on FHIR Configuration

### Sandbox Setup

1. Register your application in a SMART on FHIR sandbox (e.g., SMART Health IT Launcher)

2. Configure the following settings:
   - **Launch URL**: `http://localhost:3000/smart/launch`
   - **Redirect URL**: `http://localhost:3000/smart/callback`
   - **Client Type**: Public (PKCE)
   - **Client ID**: `my_web_app` (or your registered ID)
   - **Scopes**: `launch openid fhirUser patient/*.read online_access`

3. Launch the app through the SMART launcher

### Important Notes
- Always initiate the app through `/smart/launch`
- Do not refresh `/smart/callback` directly
- Session data is stored in browser storage

---

## 🔑 API Key Configuration

API keys are required for AI features. Configure them in the **Settings** tab:

1. Navigate to the Settings tab in the application
2. Enter your OpenAI API key and/or Google Gemini API key
3. Keys are stored securely in browser local storage
4. Select your preferred AI model for note generation

### Supported Models
- **OpenAI**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **Google**: Gemini Pro, Gemini 1.5 Pro

---

## 📁 Project Structure

```
medical-note-smart-on-fhir/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── gemini-proxy/         # Gemini API proxy
│   │   └── llm/                  # LLM integration
│   ├── smart/                    # SMART on FHIR auth
│   │   ├── launch/               # OAuth launch endpoint
│   │   └── callback/             # OAuth callback endpoint
│   └── page.tsx                  # Main application page
├── components/                   # Reusable UI components
│   └── ui/                       # shadcn/ui components
├── features/                     # Feature modules
│   ├── clinical-insights/        # AI-generated clinical insights
│   ├── clinical-summary/         # Patient data display
│   ├── data-selection/           # Clinical data filtering
│   ├── medical-chat/             # AI chat interface
│   └── settings/                 # Application settings
├── src/
│   ├── application/              # Application layer
│   │   ├── adapters/             # External service adapters
│   │   ├── dto/                  # Data transfer objects
│   │   ├── hooks/                # Custom React hooks
│   │   └── providers/            # Context providers
│   ├── core/                     # Domain layer
│   │   ├── entities/             # Domain entities
│   │   ├── interfaces/           # Domain interfaces
│   │   └── use-cases/            # Business logic
│   ├── infrastructure/           # Infrastructure layer
│   │   ├── ai/                   # AI service implementations
│   │   └── fhir/                 # FHIR client implementations
│   ├── layouts/                  # Layout components
│   └── shared/                   # Shared utilities
└── __tests__/                    # Test files
```

---

## 🏗️ Architecture

This application follows **Clean Architecture** principles:

- **Domain Layer** (`src/core`): Business entities and use cases
- **Application Layer** (`src/application`): Application-specific logic, hooks, and providers
- **Infrastructure Layer** (`src/infrastructure`): External service integrations (FHIR, AI)
- **Presentation Layer** (`app`, `features`, `components`): UI components and pages

### Key Design Patterns
- **Provider Pattern**: Context-based state management
- **Repository Pattern**: Data access abstraction
- **Adapter Pattern**: External API integration
- **Feature-based Organization**: Modular feature structure

---

## 🧪 Testing

The project uses Jest and React Testing Library for testing:

```bash
# Run all tests
npm test

# Watch mode for development
npm test:watch

# Generate coverage report
npm test:coverage
```

Test files are located in `__tests__/` directory, mirroring the source structure.

---

## 🌐 Deployment

### GitHub Pages

```bash
# Build and deploy to GitHub Pages
npm run deploy
```

This will build the application with static export and deploy to the `gh-pages` branch.

### Other Platforms

The application can be deployed to any platform supporting Next.js:
- Vercel
- Netlify
- AWS Amplify
- Docker containers

---

## 📖 User Documentation

For clinical users, please refer to [USER_GUIDE.md](./USER_GUIDE.md) for detailed usage instructions.

---

## 🤝 Contributing

1. Follow the existing code structure and patterns
2. Write tests for new features
3. Ensure all tests pass before submitting
4. Follow TypeScript best practices
5. Use conventional commit messages

---

## 📄 License

This project is private and proprietary.

---

## 🆘 Support

For technical issues or questions, please contact the development team.
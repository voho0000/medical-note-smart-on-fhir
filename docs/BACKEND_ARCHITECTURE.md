# Backend Architecture with Firebase Functions

## Overview

This document describes the recommended backend architecture for the Medical Note SMART on FHIR application, using **Firebase Functions** as the serverless backend for AI Agent orchestration and FHIR tool execution.

## Why Firebase Functions?

| Aspect | Firebase Functions | Dedicated Server | MCP Server |
|--------|-------------------|------------------|------------|
| **Setup** | ✅ Already have infrastructure | ❌ New server needed | ❌ Complex setup |
| **Cost** | ✅ Pay per use | ❌ Always running | ❌ Always running |
| **Scaling** | ✅ Auto-scale | ⚠️ Manual | ⚠️ Manual |
| **Cold Start** | ⚠️ 1-3s first call | ✅ None | ✅ None |
| **Streaming** | ✅ Supported (Gen 2) | ✅ Full support | ✅ Full support |
| **MCP Compatible** | ❌ No (stateless) | ✅ Yes | ✅ Yes |

**Recommendation**: Use Firebase Functions without MCP. MCP requires persistent connections which don't fit serverless architecture. Instead, implement FHIR tools directly in Firebase Functions.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   SMART     │  │   Clinical  │  │   Medical   │  │   Chat Component    │ │
│  │   Launch    │  │   Summary   │  │   Chat UI   │  │   (simplified)      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
         │                                      │
         │ FHIR OAuth Token                     │ POST /agentChat
         │ (stored in browser)                  │ { message, fhirToken, patientId }
         ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FIREBASE FUNCTIONS (Gen 2)                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  agentChat (HTTP Callable)                                              ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │                    AI Agent Orchestrator                         │   ││
│  │  │  • Receives message + FHIR token from frontend                  │   ││
│  │  │  • Calls AI (OpenAI/Gemini) with tools                          │   ││
│  │  │  • Executes FHIR tools server-side                              │   ││
│  │  │  • Streams response back to frontend                            │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  │                              │                                          ││
│  │           ┌──────────────────┼──────────────────┐                      ││
│  │           ▼                  ▼                  ▼                      ││
│  │  ┌─────────────┐   ┌─────────────────┐   ┌─────────────────┐          ││
│  │  │ AI Provider │   │   FHIR Tools    │   │  API Key Vault  │          ││
│  │  │ (Vercel AI) │   │ (server-side)   │   │ (Secret Mgr)    │          ││
│  │  └─────────────┘   └─────────────────┘   └─────────────────┘          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Existing Functions                                                     ││
│  │  • openaiProxy - Proxy for OpenAI API                                  ││
│  │  • geminiProxy - Proxy for Gemini API                                  ││
│  │  • transcribe - Audio transcription                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (with OAuth Bearer Token)
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FHIR Server (Epic/Cerner/etc)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Frontend (Next.js) - Simplified

The frontend becomes much simpler - no more complex tool calling logic:

```typescript
// Simplified frontend chat hook
const sendMessage = async (message: string) => {
  const fhirClient = await getFhirClient();
  const fhirToken = fhirClient.state.tokenResponse?.access_token;
  const fhirServerUrl = fhirClient.state.serverUrl;
  
  const response = await fetch('https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/agentChat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      patientId,
      fhirServerUrl,
      fhirToken,  // Pass FHIR token to backend
      conversationHistory,
      modelId,
    }),
  });
  
  // Handle streaming response
  const reader = response.body.getReader();
  // ...
};
```

### 2. Firebase Functions Structure

```
functions/
├── src/
│   ├── index.ts                    # Function exports
│   ├── agent/
│   │   ├── agentChat.ts            # Main agent function (NEW)
│   │   ├── fhir-tools.ts           # FHIR tool definitions
│   │   └── fhir-client.ts          # Server-side FHIR client
│   ├── proxy/
│   │   ├── openaiProxy.ts          # Existing OpenAI proxy
│   │   └── geminiProxy.ts          # Existing Gemini proxy
│   └── transcribe/
│       └── transcribe.ts           # Existing transcription
├── package.json
└── tsconfig.json
```

### 3. FHIR Tools (Server-Side)

Tools are executed server-side with the FHIR token passed from frontend:

```typescript
// functions/src/agent/fhir-tools.ts
import { tool } from 'ai';
import { z } from 'zod';

export function createFhirTools(fhirServerUrl: string, fhirToken: string, patientId: string) {
  return {
    queryDiagnosticReports: tool({
      description: 'Query patient diagnostic reports (lab panels, radiology)',
      parameters: z.object({
        category: z.enum(['LAB', 'RAD', 'PATH']).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }),
      execute: async ({ category, dateFrom, dateTo }) => {
        const response = await fetch(
          `${fhirServerUrl}/DiagnosticReport?patient=${patientId}${category ? `&category=${category}` : ''}`,
          {
            headers: {
              'Authorization': `Bearer ${fhirToken}`,
              'Accept': 'application/fhir+json',
            },
          }
        );
        const bundle = await response.json();
        // Transform and return results...
      },
    }),
    // ... other tools
  };
}
```

## Data Flow

### Chat Request Flow

```
1. User sends message in frontend
   │
2. Frontend gets FHIR token from fhirclient
   │
3. Frontend sends POST to Firebase Function
   │  Body: { message, patientId, fhirServerUrl, fhirToken, conversationHistory }
   │
4. Firebase Function creates AI agent with FHIR tools
   │
5. AI decides to call FHIR tool (e.g., queryDiagnosticReports)
   │
6. Firebase Function executes FHIR query using provided token
   │
7. Results returned to AI
   │
8. AI generates response based on tool results
   │
9. Response streamed back to frontend
```

### Token Flow

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Frontend   │────▶│ Firebase Function │────▶│ FHIR Server  │
│  (Browser)   │     │   (agentChat)     │     │ (Epic/etc)   │
└──────────────┘     └──────────────────┘     └──────────────┘
       │                      │                      │
       │  1. SMART Launch     │                      │
       │◀─────────────────────│──────────────────────│
       │     (get token)      │                      │
       │                      │                      │
       │  2. Send token       │                      │
       │─────────────────────▶│  3. Use token        │
       │                      │─────────────────────▶│
       │                      │                      │
       │  4. Stream response  │                      │
       │◀─────────────────────│                      │
```

## Implementation Details

### Firebase Function: agentChat

```typescript
// functions/src/agent/agentChat.ts
import { onRequest } from 'firebase-functions/v2/https';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createFhirTools } from './fhir-tools';

export const agentChat = onRequest(
  { 
    cors: true,
    timeoutSeconds: 300,  // 5 minutes for long conversations
    memory: '1GiB',
  },
  async (req, res) => {
    const { message, patientId, fhirServerUrl, fhirToken, conversationHistory, modelId } = req.body;

    // Validate inputs
    if (!fhirToken || !patientId || !fhirServerUrl) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    // Create AI provider with server-side API key
    const openai = createOpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });

    // Create FHIR tools with user's token
    const tools = createFhirTools(fhirServerUrl, fhirToken, patientId);

    // Build messages
    const messages = [
      { role: 'system', content: buildSystemPrompt(patientId) },
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    // Stream response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await streamText({
      model: openai(modelId || 'gpt-4o-mini'),
      messages,
      tools,
      maxSteps: 5,  // Allow multiple tool calls
    });

    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk.textDelta })}\n\n`);
      } else if (chunk.type === 'tool-call') {
        res.write(`data: ${JSON.stringify({ type: 'tool_call', name: chunk.toolName })}\n\n`);
      } else if (chunk.type === 'tool-result') {
        res.write(`data: ${JSON.stringify({ type: 'tool_result', name: chunk.toolName })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  }
);
```

### Request/Response Types

```typescript
interface AgentChatRequest {
  message: string;
  patientId: string;
  fhirServerUrl: string;
  fhirToken: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  modelId?: string;
  clinicalContext?: string;
}

// Server-Sent Events response
interface SSEEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  name?: string;
  error?: string;
}
```

## Security Considerations

### 1. FHIR Token Handling
- Token is passed from frontend (where SMART launch happens)
- Token is used only for the duration of the request
- Token is never stored in Firebase

### 2. API Key Protection
- OpenAI/Gemini keys stored in Firebase Secret Manager
- Never exposed to frontend

### 3. CORS Configuration
- Restrict to your domain in production:
```typescript
cors: ['https://your-app.web.app', 'https://your-custom-domain.com']
```

### 4. Rate Limiting
- Use Firebase App Check for abuse prevention
- Consider implementing per-user rate limits

## Deployment

### 1. Update Firebase Functions

```bash
cd functions
npm install ai @ai-sdk/openai zod
```

### 2. Set Secrets

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set GEMINI_API_KEY
```

### 3. Deploy

```bash
firebase deploy --only functions:agentChat
```

## Benefits of Firebase Functions Architecture

1. **Simplicity**
   - No separate backend server to manage
   - Reuse existing Firebase infrastructure

2. **Cost Effective**
   - Pay only for actual usage
   - No idle server costs

3. **Security**
   - API keys protected server-side
   - FHIR token passed per-request (not stored)

4. **Scalability**
   - Auto-scales with demand
   - No capacity planning needed

5. **Simplified Frontend**
   - No complex tool calling logic
   - Just send message, receive stream

## Migration Path

### Phase 1: Create agentChat Function
- Implement basic agent with FHIR tools
- Test with existing frontend

### Phase 2: Update Frontend
- Simplify useAgentChat hook
- Remove client-side tool execution

### Phase 3: Optimize
- Add caching for FHIR queries
- Implement conversation history storage (optional)

## Comparison: Before vs After

| Aspect | Before (Client-Side) | After (Firebase Functions) |
|--------|---------------------|---------------------------|
| Tool Execution | Browser | Server |
| API Keys | User provides | Server-side |
| Complexity | High (multi-turn handling) | Low (SDK handles it) |
| Streaming | Complex | Simple (SSE) |
| FHIR Token | Browser only | Passed to server |
| Cold Start | None | 1-3s (acceptable) |

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14, React, TypeScript |
| Backend | Firebase Functions (Gen 2) |
| AI SDK | Vercel AI SDK |
| AI Provider | OpenAI / Gemini |
| FHIR Client | Native fetch (server-side) |
| Deployment | Vercel (frontend), Firebase (functions) |

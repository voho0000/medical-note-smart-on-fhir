/**
 * OpenAI Request Transformer
 * Transforms AI SDK request to OpenAI API expected format
 * 
 * Main transformation: "developer" role → "system" role
 * AI SDK uses "developer" for newer OpenAI models, but OpenAI API expects "system"
 */

export interface OpenAIRequest {
  model?: string
  messages?: Array<{
    role: string
    content: string
  }>
  [key: string]: unknown
}

export class OpenAIRequestTransformer {
  /**
   * Transform developer role to system role
   */
  transform(request: OpenAIRequest): OpenAIRequest {
    if (!request.messages || !Array.isArray(request.messages)) {
      return request
    }

    return {
      ...request,
      messages: request.messages.map((msg) => ({
        ...msg,
        role: msg.role === 'developer' ? 'system' : msg.role,
      })),
    }
  }
}

export const openAIRequestTransformer = new OpenAIRequestTransformer()

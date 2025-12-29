// FHIR Client Service
import type FHIR from 'fhirclient'

export type FHIRClient = Awaited<ReturnType<typeof FHIR.oauth2.ready>>

export class FhirClientService {
  private static instance: FhirClientService
  private client: FHIRClient | null = null

  private constructor() {}

  static getInstance(): FhirClientService {
    if (!FhirClientService.instance) {
      FhirClientService.instance = new FhirClientService()
    }
    return FhirClientService.instance
  }

  async getClient(): Promise<FHIRClient> {
    if (this.client) {
      return this.client
    }

    try {
      const FHIR = (await import('fhirclient')).default
      this.client = await FHIR.oauth2.ready()
      return this.client
    } catch (error) {
      console.error('Failed to initialize FHIR client:', error)
      throw new Error('Failed to initialize FHIR client')
    }
  }

  async request<T = any>(query: string): Promise<T> {
    const client = await this.getClient()
    return await client.request(query)
  }

  clearClient(): void {
    this.client = null
  }
}

export const fhirClient = FhirClientService.getInstance()

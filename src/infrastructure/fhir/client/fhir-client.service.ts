// FHIR Client Service
import type FHIR from 'fhirclient'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

export type FHIRClient = Awaited<ReturnType<typeof FHIR.oauth2.ready>>

/**
 * Thrown by FhirClientService.getClient() when the app is running with a
 * locally-imported FHIR Bundle (no SMART OAuth state in the URL). Callers
 * should catch this specifically and silently treat the FHIR client as
 * "unavailable" — printing the error would be noise, not a bug.
 */
export class LocalBundleModeError extends Error {
  constructor() {
    super('App is running in local-bundle mode; SMART client is not initialised.')
    this.name = 'LocalBundleModeError'
  }
}

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

    // Bundle-import mode: no SMART OAuth state exists in the URL, so don't
    // even try to call FHIR.oauth2.ready() — it would throw "No 'state'
    // parameter found" and the catch below would mask the cause behind a
    // generic "Failed to initialize FHIR client" message. Throw a typed
    // error so callers can recognise and silently skip.
    if (LocalBundleService.hasData()) {
      throw new LocalBundleModeError()
    }

    try {
      const FHIR = (await import('fhirclient')).default
      this.client = await FHIR.oauth2.ready()
      return this.client
    } catch (error) {
      if (error instanceof LocalBundleModeError) throw error
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

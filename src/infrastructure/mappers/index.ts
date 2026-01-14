// Data Mappers Export and Registration
// Centralized mapper registration for all data sources

import { dataMapperRegistry } from '@/src/core/interfaces/data-mapper.interface'
import { fhirDataMapper } from './fhir-data.mapper'

// Register all mappers
dataMapperRegistry.register(fhirDataMapper)

// Export registry for use in application
export { dataMapperRegistry }

// Export individual mappers if needed
export { fhirDataMapper } from './fhir-data.mapper'
export { FhirDataMapper } from './fhir-data.mapper'

// Example mapper is not registered by default
// To use it, import and register manually:
// import { ExampleHospitalDataMapper } from './example-hospital-data.mapper'
// dataMapperRegistry.register(new ExampleHospitalDataMapper())

/**
 * Host-facing type facade. Clinical contracts live in the private care package
 * so rule implementations and their result types are released together; the
 * host-resource shapes the adapter reads come from the FHIR adapter package.
 */
export type * from '@voho0000/personalized-care'
export type * from '@voho0000/personalized-care-fhir'

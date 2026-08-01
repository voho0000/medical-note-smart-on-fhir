import {
  createPackRegistry,
  PersonalizationSdkError,
  type PackRegistrationOptions,
} from '@voho0000/personalization-sdk'
import { BUNDLED_CARE_PACKS, DEFAULT_CARE_PACK_ID } from './bundled'
import type { CdssPatientProfile, ClinicalGuidelinePack } from '../types'

const careRegistry = createPackRegistry<ClinicalGuidelinePack>({
  packKind: 'care',
  validate(pack) {
    if (
      !pack.diseaseCode.trim()
      || typeof pack.enabled !== 'boolean'
      || !pack.label?.zh?.trim()
      || !pack.label?.en?.trim()
      || typeof pack.applies !== 'function'
      || typeof pack.build !== 'function'
    ) {
      throw new PersonalizationSdkError(
        'INVALID_PACK',
        `Care pack "${pack.id}" does not satisfy the ClinicalGuidelinePack contract`,
        { packId: pack.id },
      )
    }
  },
})

let defaultCarePackId: string | undefined

export interface RegisterCarePacksOptions extends PackRegistrationOptions {
  defaultPackId?: string
}

export function registerCarePacks(
  packs: readonly ClinicalGuidelinePack[],
  options: RegisterCarePacksOptions,
): void {
  careRegistry.register(packs, options)

  if (options.defaultPackId) {
    const defaultPack = careRegistry.get(options.defaultPackId)
    if (!defaultPack) {
      throw new PersonalizationSdkError(
        'DEFAULT_PACK_NOT_FOUND',
        `Default care pack "${options.defaultPackId}" was not registered`,
        { defaultPackId: options.defaultPackId, source: options.source },
      )
    }
    defaultCarePackId = options.defaultPackId
  }
}

export function getEnabledClinicalGuidelinePacks(): readonly ClinicalGuidelinePack[] {
  return careRegistry.getAll().filter((pack) => pack.enabled)
}

export function getClinicalGuidelinePack(id: string): ClinicalGuidelinePack | undefined {
  const pack = careRegistry.get(id)
  return pack?.enabled ? pack : undefined
}

export function getApplicableClinicalGuidelinePacks(
  profile: CdssPatientProfile,
): readonly ClinicalGuidelinePack[] {
  return getEnabledClinicalGuidelinePacks().filter((pack) => pack.applies(profile))
}

export function getDefaultClinicalGuidelinePack(): ClinicalGuidelinePack {
  const pack = defaultCarePackId ? getClinicalGuidelinePack(defaultCarePackId) : undefined
  if (!pack) {
    throw new PersonalizationSdkError(
      'DEFAULT_PACK_NOT_FOUND',
      'No enabled default care pack has been registered',
      { defaultCarePackId },
    )
  }
  return pack
}

registerCarePacks(BUNDLED_CARE_PACKS, {
  source: 'medical-note-smart-on-fhir/bundled-care-packs',
  defaultPackId: DEFAULT_CARE_PACK_ID,
})

export interface Cha2ds2VascInput {
  age?: number
  sex?: 'male' | 'female' | 'other' | 'unknown'
  congestiveHeartFailure: boolean
  hypertension: boolean
  diabetes: boolean
  priorStrokeTiaThromboembolism: boolean
  vascularDisease: boolean
}

export interface Cha2ds2VascAssessment {
  score: number
  threshold:
    | 'oral-anticoagulation-recommended'
    | 'oral-anticoagulation-reasonable'
    | 'below-example-threshold'
    | 'threshold-not-evaluable'
  components: readonly {
    id: 'heart-failure' | 'hypertension' | 'age' | 'diabetes'
      | 'stroke-tia-embolism' | 'vascular-disease' | 'sex-category'
    points: number
  }[]
  missingDemographics: readonly ('age' | 'sex')[]
}

/**
 * Calculates a documented minimum CHA₂DS₂-VASc score.
 *
 * A false condition input means only that the governed data slice did not
 * establish that component. Callers must not present a low score as proof that
 * undocumented comorbidity is absent.
 */
export function calculateDocumentedCha2ds2Vasc(
  input: Cha2ds2VascInput,
): Cha2ds2VascAssessment {
  const agePoints = input.age === undefined
    ? 0
    : input.age >= 75
      ? 2
      : input.age >= 65
        ? 1
        : 0
  const components: Cha2ds2VascAssessment['components'] = [
    { id: 'heart-failure', points: input.congestiveHeartFailure ? 1 : 0 },
    { id: 'hypertension', points: input.hypertension ? 1 : 0 },
    { id: 'age', points: agePoints },
    { id: 'diabetes', points: input.diabetes ? 1 : 0 },
    { id: 'stroke-tia-embolism', points: input.priorStrokeTiaThromboembolism ? 2 : 0 },
    { id: 'vascular-disease', points: input.vascularDisease ? 1 : 0 },
    { id: 'sex-category', points: input.sex === 'female' ? 1 : 0 },
  ]
  const score = components.reduce((sum, component) => sum + component.points, 0)
  const missingDemographics = [
    ...(input.age === undefined ? ['age' as const] : []),
    ...(input.sex !== 'male' && input.sex !== 'female' ? ['sex' as const] : []),
  ]
  const threshold = missingDemographics.length > 0
    ? 'threshold-not-evaluable' as const
    : input.sex === 'male'
      ? score >= 2
        ? 'oral-anticoagulation-recommended' as const
        : score === 1
          ? 'oral-anticoagulation-reasonable' as const
          : 'below-example-threshold' as const
      : score >= 3
        ? 'oral-anticoagulation-recommended' as const
        : score === 2
          ? 'oral-anticoagulation-reasonable' as const
          : 'below-example-threshold' as const

  return {
    score,
    threshold,
    components,
    missingDemographics,
  }
}

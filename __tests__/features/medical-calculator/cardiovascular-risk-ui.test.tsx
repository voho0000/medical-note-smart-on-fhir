import { act, fireEvent, render, screen } from '@testing-library/react'
import { CardiovascularRiskCalculator } from '@/features/medical-calculator/components/CardiovascularRiskCalculator'
import { useCvdRiskResultsStore } from '@/features/medical-calculator/cardiovascular-risk-results'
import { applyHypertensionRiskResults } from '@/features/clinical-decision-support/utils/hypertension-risk-results'
import { HYPERTENSION_GUIDELINE_PACK, type CdssPatientProfile } from '@voho0000/personalized-care'
const autofill={resolve:()=>undefined}
jest.mock('@/features/medical-calculator/hooks/use-lab-autofill.hook',()=>({useLabAutofill:()=>({autofill,isLoading:false,error:null})}))
jest.mock('@/src/application/hooks/patient/use-patient-query.hook',()=>({usePatient:()=>({patient:{id:'patient-a'}})}))
jest.mock('@/src/application/providers/language.provider',()=>({useLanguage:()=>({locale:'zh-TW'})}))
const context={sbp:{value:'134',date:'2026-09-12',source:'Clinic BP'}}
beforeEach(()=>useCvdRiskResultsStore.setState({byPatient:{}}))
it('requires complete, confirmed inputs; applies the calculator result to the real HTN pack and invalidates after editing',()=>{
 render(<CardiovascularRiskCalculator id="prevent-cvd" context={context} onBack={()=>{}} />)
 expect(screen.getByTestId('risk-apply')).toBeDisabled()
 const values={age:'65',sex:'male',tc:'200',hdl:'40',egfr:'75',bmi:'28',smoking:'yes',diabetes:'no',cvd:'no',bpTreatment:'no',statin:'no'}
 for(const [key,value] of Object.entries(values))fireEvent.change(screen.getByTestId(`risk-input-${key}`),{target:{value}})
 expect(screen.getByTestId('risk-result').textContent).toContain('%')
 expect(screen.getByTestId('risk-apply')).toBeDisabled()
 fireEvent.click(screen.getByTestId('risk-confirm'));fireEvent.click(screen.getByTestId('risk-apply'))
 const record=useCvdRiskResultsStore.getState().byPatient['patient-a']['prevent-cvd']!
 expect(record.numericValue).toBeGreaterThan(7.5)
 const profile:CdssPatientProfile={id:'patient-a',facts:{bloodPressure:{zh:'134/84 mmHg',en:'134/84 mmHg',date:'2026-09-12'}},eligibleDiseasePackIds:['hypertension-poc']}
 const updated=applyHypertensionRiskResults(profile,{'prevent-cvd':record},autofill,context)
 const result=HYPERTENSION_GUIDELINE_PACK.build({profile:updated,locale:'zh-TW'})
 expect(result.recommendations.find(r=>r.id==='hypertension-treatment-threshold')?.status).toBe('actionable')
 fireEvent.change(screen.getByTestId('risk-input-smoking'),{target:{value:''}})
 expect(useCvdRiskResultsStore.getState().byPatient['patient-a']['prevent-cvd']).toBeUndefined()
 expect(screen.getByTestId('risk-apply')).toBeDisabled()
})
it('does not carry typed inputs to another patient',()=>{
 const {rerender}=render(<CardiovascularRiskCalculator id="prevent-cvd" patientId="a" context={context} onBack={()=>{}} />)
 fireEvent.change(screen.getByTestId('risk-input-age'),{target:{value:'65'}})
 rerender(<CardiovascularRiskCalculator id="prevent-cvd" patientId="b" context={context} onBack={()=>{}} />)
 expect(screen.getByTestId('risk-input-age')).toHaveValue(null)
})
it('removes the applied status when the result expires while the calculator is open',()=>{
 jest.useFakeTimers()
 try {
  render(<CardiovascularRiskCalculator id="prevent-cvd" context={context} onBack={()=>{}} />)
  const values={age:'65',sex:'male',tc:'200',hdl:'40',egfr:'75',bmi:'28',smoking:'yes',diabetes:'no',cvd:'no',bpTreatment:'no',statin:'no'}
  for(const [key,value] of Object.entries(values))fireEvent.change(screen.getByTestId(`risk-input-${key}`),{target:{value}})
  fireEvent.click(screen.getByTestId('risk-confirm'));fireEvent.click(screen.getByTestId('risk-apply'))
  expect(screen.getByRole('status')).toHaveTextContent('已引用')
  act(()=>jest.advanceTimersByTime(86400000))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(useCvdRiskResultsStore.getState().byPatient['patient-a']['prevent-cvd']).toBeUndefined()
 } finally { jest.useRealTimers() }
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PatientDemographicsEditorDialog } from '@/features/clinical-summary/patient-info/components/PatientDemographicsEditorDialog'
import type { UserEnteredPatientProfile } from '@/src/core/entities/patient.entity'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      common: {
        cancel: '取消',
        save: '儲存',
      },
      patient: {
        profileDialogTitle: '補充病人基本資料',
        profileDialogDescription: 'SDK 沒有提供結構化基本資料',
        aiProfileDialogTitle: '產生 AI 摘要前請補充基本資料',
        aiProfileDialogDescription: '性別與出生日期會影響摘要準確度',
        aiProfileRequired: '請填寫性別與出生日期後再產生摘要。',
        name: '姓名',
        namePlaceholder: '輸入姓名（選填）',
        gender: '性別',
        leaveUnknown: '維持未知',
        female: '女性',
        male: '男性',
        other: '其他',
        birthDate: '出生日期',
        birthYear: '出生年',
        ageCalculatedFromBirthDate: '年齡會自動計算',
        ageCalculatedFromBirthYear: '只需填出生年',
        localProfilePrivacy: '只會加密保存在這個瀏覽器',
        invalidBirthDate: '出生日期無效',
        invalidBirthYear: '出生年無效',
        profileSaveFailed: '無法安全儲存',
        clearUserEntered: '清除自行填寫資料',
        savingProfile: '儲存中…',
      },
    },
  }),
}))

describe('PatientDemographicsEditorDialog', () => {
  it('submits a normalized local profile', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    render(
      <PatientDemographicsEditorDialog
        open
        onOpenChange={jest.fn()}
        profile={null}
        saving={false}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText('姓名'), {
      target: { value: '  王   小明  ' },
    })
    fireEvent.change(screen.getByLabelText('出生日期'), {
      target: { value: '1980-01-15' },
    })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      source: 'user-entered',
      name: '王 小明',
      birthDate: '1980-01-15',
    }))
  })

  it('does not submit a future birth date', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    render(
      <PatientDemographicsEditorDialog
        open
        onOpenChange={jest.fn()}
        profile={null}
        saving={false}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText('出生日期'), {
      target: { value: '2999-01-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('出生日期無效')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('can clear an existing user-entered profile', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    const profile: UserEnteredPatientProfile = {
      source: 'user-entered',
      name: '王小明',
      updatedAt: '2026-07-30T00:00:00.000Z',
    }
    render(
      <PatientDemographicsEditorDialog
        open
        onOpenChange={jest.fn()}
        profile={profile}
        saving={false}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '清除自行填寫資料' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null))
  })

  it('requires both gender and birth year when opened for AI generation', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    render(
      <PatientDemographicsEditorDialog
        open
        onOpenChange={jest.fn()}
        profile={null}
        saving={false}
        onSave={onSave}
        requiredForAi
      />,
    )

    expect(screen.getByText('產生 AI 摘要前請補充基本資料')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '請填寫性別與出生日期後再產生摘要。',
    )
    expect(onSave).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: '清除自行填寫資料' }),
    ).not.toBeInTheDocument()
  })

  it('stores only a four-digit birth year for AI generation', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    render(
      <PatientDemographicsEditorDialog
        open
        onOpenChange={jest.fn()}
        profile={null}
        saving={false}
        onSave={onSave}
        requiredForAi
      />,
    )

    fireEvent.change(screen.getByLabelText(/出生年/), {
      target: { value: '1980' },
    })
    fireEvent.click(screen.getByRole('combobox', { name: /性別/ }))
    fireEvent.click(screen.getByRole('option', { name: '女性' }))
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      gender: 'female',
      birthDate: '1980',
    }))
  })
})

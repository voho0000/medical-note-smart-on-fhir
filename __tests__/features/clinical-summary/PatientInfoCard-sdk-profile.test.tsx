import { fireEvent, render, screen } from '@testing-library/react'
import { PatientInfoCard } from '@/features/clinical-summary/patient-info/PatientInfoCard'

const mockSaveProfile = jest.fn().mockResolvedValue(undefined)
let mockSourceMetadata: any
let mockPatient: any
let mockLocalProfile: any

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({
    patient: mockPatient,
    loading: false,
    error: null,
  }),
}))

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => ({ sourceMetadata: mockSourceMetadata }),
}))

jest.mock('@/src/application/hooks/patient/use-local-patient-profile.hook', () => ({
  useLocalPatientProfile: () => mockLocalProfile,
}))

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
  },
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      common: { cancel: '取消', save: '儲存' },
      errors: { fetchPatient: '無法取得病人資料' },
      patient: {
        info: '病人資訊',
        name: '姓名',
        gender: '性別',
        age: '年齡',
        birthDate: '出生日期',
        male: '男性',
        female: '女性',
        other: '其他',
        unknown: '未知',
        userEntered: '自行填寫',
        addLocalProfile: '補充資料',
        editLocalProfile: '編輯資料',
        profileDialogTitle: '補充病人基本資料',
        profileDialogDescription: 'SDK 沒有提供結構化基本資料',
        namePlaceholder: '輸入姓名（選填）',
        leaveUnknown: '維持未知',
        ageCalculatedFromBirthDate: '年齡會自動計算',
        localProfilePrivacy: '只會加密保存在這個瀏覽器',
        invalidBirthDate: '出生日期無效',
        profileSaveFailed: '無法安全儲存',
        clearUserEntered: '清除自行填寫資料',
        savingProfile: '儲存中…',
        profileSaved: '已儲存',
        profileCleared: '已清除',
        showMore: '顯示更多資料',
        showLess: '收合詳細資料',
        nationalId: '身分證字號',
        medicalRecordNumber: '病歷號',
        passportNumber: '護照號碼',
        socialSecurityNumber: '社會安全號碼',
        identifierGeneric: '識別碼',
        phone: '電話',
        email: 'Email',
        fax: '傳真',
        sms: '簡訊',
        contactGeneric: '聯絡方式',
        address: '地址',
        maritalStatus: '婚姻狀態',
        married: '已婚',
        single: '未婚',
        divorced: '離婚',
        widowed: '喪偶',
        separated: '分居',
        language: '語言',
        languageZhTW: '繁體中文',
        languageZhCN: '簡體中文',
        languageEn: '英文',
        languageJa: '日文',
        contact: '聯絡人',
        relationshipFather: '父親',
        relationshipMother: '母親',
        relationshipSpouse: '配偶',
        relationshipSibling: '兄弟姐妹',
        relationshipChild: '子女',
        relationshipGuardian: '監護人',
        relationshipEmergency: '緊急聯絡人',
      },
    },
  }),
}))

describe('PatientInfoCard SDK local profile', () => {
  beforeEach(() => {
    mockSourceMetadata = { source: 'health-bank-sdk-json' }
    mockPatient = {
      resourceType: 'Patient',
      id: 'sdk-patient',
      name: [{ text: 'Unknown' }],
      gender: 'unknown',
    }
    mockLocalProfile = {
      available: true,
      importId: 'import-1',
      profile: null,
      saving: false,
      saveProfile: mockSaveProfile,
    }
  })

  it('shows SDK demographics immediately and opens the optional editor only on request', () => {
    render(<PatientInfoCard />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByText('未知')).toHaveLength(2)
    expect(screen.getByText('N/A')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '補充資料' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not expose the editor for non-SDK FHIR data', () => {
    mockSourceMetadata = undefined
    mockLocalProfile = {
      ...mockLocalProfile,
      available: false,
      importId: null,
    }
    render(<PatientInfoCard />)

    expect(screen.queryByRole('button', { name: '補充資料' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('marks each demographic value supplied by the user', () => {
    mockPatient = {
      ...mockPatient,
      name: [{ text: '王小明' }],
      gender: 'male',
      birthDate: '1980-01-15',
      demographicsSource: 'user-entered-local-profile',
      userEnteredDemographicFields: ['name', 'gender', 'birthDate'],
    }
    mockLocalProfile = {
      ...mockLocalProfile,
      profile: {
        source: 'user-entered',
        name: '王小明',
        gender: 'male',
        birthDate: '1980-01-15',
        updatedAt: '2026-07-30T00:00:00.000Z',
      },
    }
    render(<PatientInfoCard />)

    expect(screen.getByText('王小明')).toBeInTheDocument()
    expect(screen.getByText('男性')).toBeInTheDocument()
    // Name, gender, calculated age, and the detailed birth-date row.
    expect(screen.getAllByText('自行填寫')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '編輯資料' })).toBeInTheDocument()
  })
})

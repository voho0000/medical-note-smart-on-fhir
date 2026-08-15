"use client"

import { useState } from 'react'
import { LockKeyhole, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/src/application/providers/language.provider'
import {
  createUserEnteredPatientProfile,
  isValidPatientBirthDate,
  type UserEnteredPatientProfile,
  type UserEnteredPatientProfileInput,
} from '@/src/core/entities/patient.entity'

interface PatientDemographicsEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: UserEnteredPatientProfile | null
  /** Source demographics used to prefill fields that have no local override. */
  initialValues?: UserEnteredPatientProfileInput
  saving: boolean
  onSave: (profile: UserEnteredPatientProfile | null) => Promise<void>
  /** AI summaries need sex plus a birth year; the pencil editor remains optional. */
  requiredForAi?: boolean
}

function todayLocal(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function PatientDemographicsEditorDialog({
  open,
  onOpenChange,
  profile,
  initialValues,
  saving,
  onSave,
  requiredForAi = false,
}: PatientDemographicsEditorDialogProps) {
  const { t } = useLanguage()
  const initialBirthDate = profile?.birthDate ?? initialValues?.birthDate ?? ''
  const [name, setName] = useState(
    profile?.name ?? initialValues?.name ?? '',
  )
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>(
    profile?.gender ?? initialValues?.gender ?? '',
  )
  const useBirthYearInput =
    requiredForAi || /^\d{4}$/.test(initialBirthDate)
  const [birthDate, setBirthDate] = useState(
    useBirthYearInput
      ? initialBirthDate.slice(0, 4)
      : initialBirthDate,
  )
  const [error, setError] = useState('')
  const maxBirthDate = todayLocal()

  const submit = async () => {
    if (requiredForAi && (!gender || !birthDate)) {
      setError(t.patient.aiProfileRequired)
      return
    }
    if (birthDate && !isValidPatientBirthDate(birthDate)) {
      setError(
        useBirthYearInput
          ? t.patient.invalidBirthYear
          : t.patient.invalidBirthDate,
      )
      return
    }
    setError('')
    try {
      await onSave(createUserEnteredPatientProfile({
        name,
        gender: gender || undefined,
        birthDate: birthDate || undefined,
      }))
    } catch {
      setError(t.patient.profileSaveFailed)
    }
  }

  const clear = async () => {
    setError('')
    try {
      await onSave(null)
    } catch {
      setError(t.patient.profileSaveFailed)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {requiredForAi
              ? t.patient.aiProfileDialogTitle
              : t.patient.profileDialogTitle}
          </DialogTitle>
          <DialogDescription>
            {requiredForAi
              ? t.patient.aiProfileDialogDescription
              : t.patient.profileDialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="local-patient-name">{t.patient.name}</Label>
            <Input
              id="local-patient-name"
              value={name}
              maxLength={100}
              autoComplete="name"
              placeholder={t.patient.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="local-patient-gender">
              {t.patient.gender}
              {requiredForAi && (
                <span className="ml-1 text-destructive" aria-hidden>*</span>
              )}
            </Label>
            <Select
              value={gender || 'unspecified'}
              onValueChange={(value) => {
                setGender(value === 'unspecified'
                  ? ''
                  : value as 'male' | 'female' | 'other')
              }}
              disabled={saving}
            >
              <SelectTrigger
                id="local-patient-gender"
                className="w-full"
                aria-invalid={requiredForAi && Boolean(error) && !gender}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unspecified">{t.patient.leaveUnknown}</SelectItem>
                <SelectItem value="female">{t.patient.female}</SelectItem>
                <SelectItem value="male">{t.patient.male}</SelectItem>
                <SelectItem value="other">{t.patient.other}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="local-patient-birth-date">
              {useBirthYearInput ? t.patient.birthYear : t.patient.birthDate}
              {requiredForAi && (
                <span className="ml-1 text-destructive" aria-hidden>*</span>
              )}
            </Label>
            <Input
              id="local-patient-birth-date"
              type={useBirthYearInput ? 'text' : 'date'}
              inputMode={useBirthYearInput ? 'numeric' : undefined}
              pattern={useBirthYearInput ? '[0-9]{4}' : undefined}
              maxLength={useBirthYearInput ? 4 : undefined}
              placeholder={useBirthYearInput ? '1980' : undefined}
              value={birthDate}
              max={useBirthYearInput ? maxBirthDate.slice(0, 4) : maxBirthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              disabled={saving}
              aria-invalid={Boolean(error) && (
                !requiredForAi || !birthDate || !isValidPatientBirthDate(birthDate)
              )}
            />
            <p className="text-xs text-muted-foreground">
              {useBirthYearInput
                ? t.patient.ageCalculatedFromBirthYear
                : t.patient.ageCalculatedFromBirthDate}
            </p>
          </div>

          <div className="flex gap-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-900 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
            <LockKeyhole className="mt-0.5 size-4 shrink-0" />
            <span>{t.patient.localProfilePrivacy}</span>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {profile && !requiredForAi && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={clear}
                disabled={saving}
              >
                <Trash2 />
                {t.patient.clearUserEntered}
              </Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t.common.cancel}
            </Button>
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? t.patient.savingProfile : t.common.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

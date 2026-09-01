// Patient Info Display Component
import { useState } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import type { PatientInfo } from '../types'

interface PatientInfoDisplayProps {
  patientInfo: PatientInfo
}

export function PatientInfoDisplay({ patientInfo }: PatientInfoDisplayProps) {
  const { t, locale } = useLanguage()
  const separator = locale === 'en' ? ':' : '：'
  const [showMore, setShowMore] = useState(false)

  const hasExtended =
    (patientInfo.identifiers?.length ?? 0) > 0 ||
    !!patientInfo.birthDate ||
    (patientInfo.telecom?.length ?? 0) > 0 ||
    (patientInfo.addresses?.length ?? 0) > 0 ||
    !!patientInfo.maritalStatus ||
    (patientInfo.languages?.length ?? 0) > 0 ||
    (patientInfo.contacts?.length ?? 0) > 0
  const isUserEntered = (field: 'name' | 'gender' | 'birthDate') =>
    patientInfo.userEnteredFields?.includes(field) ?? false

  return (
    <div className="text-sm space-y-2">
      <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 sm:grid-cols-3 sm:gap-2">
        <span className="font-medium text-muted-foreground">{t.patient.name}{separator}</span>
        <ValueWithSource
          value={patientInfo.name}
          userEntered={isUserEntered('name')}
          label={t.patient.userEntered}
        />

        <span className="font-medium text-muted-foreground">{t.patient.gender}{separator}</span>
        <ValueWithSource
          value={patientInfo.gender}
          userEntered={isUserEntered('gender')}
          label={t.patient.userEntered}
        />

        <span className="font-medium text-muted-foreground">{t.patient.age}{separator}</span>
        <ValueWithSource
          value={patientInfo.age}
          userEntered={isUserEntered('birthDate')}
          label={t.patient.userEntered}
        />

        {patientInfo.id && (
          <>
            <span className="font-medium text-muted-foreground">ID{separator}</span>
            <span className="min-w-0 break-all text-muted-foreground sm:col-span-2">{patientInfo.id}</span>
          </>
        )}
      </div>

      {hasExtended && (
        <details
          open={showMore}
          onToggle={(e) => setShowMore((e.target as HTMLDetailsElement).open)}
          className="text-xs"
        >
          <summary className="cursor-pointer text-muted-foreground select-none">
            {showMore ? t.patient.showLess : t.patient.showMore}
          </summary>
          <div className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 sm:grid-cols-3 sm:gap-2">
            {(patientInfo.identifiers ?? []).map((id, i) => (
              <FieldRow key={`id-${i}`} label={id.label} value={id.value} />
            ))}
            {patientInfo.birthDate && (
              <FieldRow
                label={t.patient.birthDate}
                value={patientInfo.birthDate}
                userEntered={isUserEntered('birthDate')}
                userEnteredLabel={t.patient.userEntered}
              />
            )}
            {(patientInfo.telecom ?? []).map((tel, i) => (
              <FieldRow key={`tel-${i}`} label={tel.label} value={tel.value} />
            ))}
            {(patientInfo.addresses ?? []).map((a, i) => (
              <FieldRow key={`addr-${i}`} label={t.patient.address} value={a} />
            ))}
            {patientInfo.maritalStatus && (
              <FieldRow label={t.patient.maritalStatus} value={patientInfo.maritalStatus} />
            )}
            {(patientInfo.languages ?? []).length > 0 && (
              <FieldRow
                label={t.patient.language}
                value={(patientInfo.languages ?? []).join(', ')}
              />
            )}
            {(patientInfo.contacts ?? []).map((c, i) => (
              <FieldRow
                key={`con-${i}`}
                label={locale === 'en'
                  ? `${t.patient.contact} (${c.relationship})`
                  : `${t.patient.contact}（${c.relationship}）`}
                value={c.phone ? `${c.name} · ${c.phone}` : c.name}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function UserEnteredBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] leading-none text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
      {label}
    </span>
  )
}

function ValueWithSource({
  value,
  userEntered,
  label,
}: {
  value: string
  userEntered: boolean
  label: string
}) {
  return (
    <span className="sm:col-span-2 flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="break-words">{value}</span>
      {userEntered && <UserEnteredBadge label={label} />}
    </span>
  )
}

function FieldRow({
  label,
  value,
  userEntered = false,
  userEnteredLabel = '',
}: {
  label: string
  value: string
  userEntered?: boolean
  userEnteredLabel?: string
}) {
  const { locale } = useLanguage()
  return (
    <>
      <span className="font-medium text-muted-foreground break-words min-w-0">{label}{locale === 'en' ? ':' : '：'}</span>
      <span className="sm:col-span-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="break-words">{value}</span>
        {userEntered && <UserEnteredBadge label={userEnteredLabel} />}
      </span>
    </>
  )
}

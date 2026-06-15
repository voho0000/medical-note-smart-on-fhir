// Patient Info Display Component
import { useState } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import type { PatientInfo } from '../types'

interface PatientInfoDisplayProps {
  patientInfo: PatientInfo
}

export function PatientInfoDisplay({ patientInfo }: PatientInfoDisplayProps) {
  const { t } = useLanguage()
  const [showMore, setShowMore] = useState(false)

  const hasExtended =
    (patientInfo.identifiers?.length ?? 0) > 0 ||
    !!patientInfo.birthDate ||
    (patientInfo.telecom?.length ?? 0) > 0 ||
    (patientInfo.addresses?.length ?? 0) > 0 ||
    !!patientInfo.maritalStatus ||
    (patientInfo.languages?.length ?? 0) > 0 ||
    (patientInfo.contacts?.length ?? 0) > 0

  return (
    <div className="text-sm space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2">
        <span className="font-medium text-muted-foreground">{t.patient.name}：</span>
        <span className="sm:col-span-2">{patientInfo.name}</span>

        <span className="font-medium text-muted-foreground">{t.patient.gender}：</span>
        <span className="sm:col-span-2">{patientInfo.gender}</span>

        <span className="font-medium text-muted-foreground">{t.patient.age}：</span>
        <span className="sm:col-span-2">{patientInfo.age}</span>

        {patientInfo.id && (
          <>
            <span className="font-medium text-muted-foreground">ID：</span>
            <span className="sm:col-span-2 text-muted-foreground">{patientInfo.id}</span>
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
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2">
            {(patientInfo.identifiers ?? []).map((id, i) => (
              <FieldRow key={`id-${i}`} label={id.label} value={id.value} />
            ))}
            {patientInfo.birthDate && (
              <FieldRow label={t.patient.birthDate} value={patientInfo.birthDate} />
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
                label={`${t.patient.contact}（${c.relationship}）`}
                value={c.phone ? `${c.name} · ${c.phone}` : c.name}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="font-medium text-muted-foreground break-words min-w-0">{label}：</span>
      <span className="sm:col-span-2 break-words min-w-0">{value}</span>
    </>
  )
}

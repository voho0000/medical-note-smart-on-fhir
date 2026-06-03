// DevicesCard — IPS "Medical Devices" section (FHIR R4 Device).
//
// Surfaces 植入物 / 醫療器材 from 健保存摺 (心臟節律器, 人工關節, 支架 …).
// List layout: each device is one row with its type as the heading, a status
// chip, and a detail line (manufacturer / model / serial / UDI).
//
// SCAFFOLD: field access follows standard FHIR R4. Implant date typically
// lives on a related Procedure, not the Device — joining that in is deferred
// until bridge samples confirm whether the date arrives here or separately.
// Display strings come from the source verbatim; nothing fabricated.
"use client"

import { useMemo } from 'react'
import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { getCodeableConceptText } from "@/src/shared/utils/fhir-helpers"
import type { DeviceEntity } from "@/src/core/entities/clinical-data.entity"

function getDeviceName(d: DeviceEntity): string {
  const typeText = getCodeableConceptText(d.type)
  if (typeText && typeText !== '—') return typeText
  const named = Array.isArray(d.deviceName) ? d.deviceName.find((n) => n?.name)?.name : undefined
  return named || '—'
}

function getUdi(d: DeviceEntity): string | undefined {
  const carrier = Array.isArray(d.udiCarrier) ? d.udiCarrier[0] : undefined
  return carrier?.carrierHRF || carrier?.deviceIdentifier
}

export function DevicesCard() {
  const { t } = useLanguage()
  const { devices, isLoading, error } = useClinicalData()

  const tt = (t as any).devices || {
    title: 'Medical Devices',
    noData: 'No devices recorded (not provided by source).',
    manufacturer: 'Manufacturer',
    model: 'Model',
    serial: 'Serial No.',
    udi: 'UDI',
    statusActive: 'Active',
    statusInactive: 'Inactive',
  }

  const items = useMemo(() => {
    const list = Array.isArray(devices) ? devices : []
    return list.map((d) => ({
      id: d.id || `device-${Math.random()}`,
      name: getDeviceName(d),
      status: d.status,
      statusLabel:
        d.status === 'active' ? tt.statusActive : d.status === 'inactive' ? tt.statusInactive : d.status,
      manufacturer: d.manufacturer,
      model: d.modelNumber,
      serial: d.serialNumber,
      udi: getUdi(d),
    }))
  }, [devices, tt])

  return (
    <FeatureCard
      title={tt.title}
      featureId="devices"
      isLoading={isLoading}
      error={error}
      isEmpty={items.length === 0}
      emptyMessage={tt.noData}
    >
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="rounded-md border border-border/60 p-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{it.name}</span>
              {it.statusLabel && (
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-xs " +
                    (it.status === 'active'
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  {it.statusLabel}
                </span>
              )}
            </div>
            {(it.manufacturer || it.model || it.serial || it.udi) && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {it.manufacturer && <span>{tt.manufacturer}: {it.manufacturer}</span>}
                {it.model && <span>{tt.model}: {it.model}</span>}
                {it.serial && <span>{tt.serial}: {it.serial}</span>}
                {it.udi && <span>{tt.udi}: {it.udi}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </FeatureCard>
  )
}

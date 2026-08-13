import React from 'react'

const LABELS = {
  elegibilidad_mt: 'Elegibilidad Movistar Total',
  consumo_datos: 'Consumo de datos',
  internet_hogar: 'Internet hogar',
  app_uso: 'Uso de app',
  antiguedad: 'Antigüedad',
  satisfaccion: 'Satisfacción (NPS)',
  elegibilidad_upgrade: 'Elegibilidad upgrade',
  elegibilidad_equipo: 'Elegibilidad equipo',
  elegibilidad_hogar: 'Elegibilidad plan hogar',
  sin_internet_hogar: 'Sin internet hogar',
}

function labelFor(key) {
  return LABELS[key] || key.replace(/_/g, ' ')
}

export default function ShapExplainability({ shapValues }) {
  const entries = Object.entries(shapValues || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  const max = Math.max(...entries.map(([, v]) => v), 0.01)

  return (
    <div className="space-y-2.5">
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">{labelFor(key)}</span>
            <span className="font-mono font-medium text-navy-800">+{Math.round(value * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400"
              style={{ width: `${Math.max((value / max) * 100, 6)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

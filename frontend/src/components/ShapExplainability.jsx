import React from 'react'

const REASONS = {
  elegibilidad_mt: 'Es elegible para Movistar Total',
  consumo_datos: 'Alto consumo de datos',
  internet_hogar: 'Tiene internet en casa',
  sin_internet_hogar: 'No tiene internet en casa',
  app_uso: 'Usa mucho la app',
  antiguedad: 'Lleva tiempo como cliente',
  satisfaccion: 'Buena satisfacción (NPS)',
  elegibilidad_upgrade: 'Es elegible para un upgrade',
  elegibilidad_equipo: 'Es elegible para equipo nuevo',
  elegibilidad_hogar: 'Es elegible para Plan Hogar',
}

function reasonFor(key) {
  return REASONS[key] || key.replace(/_/g, ' ')
}

/**
 * "Por qué esta oferta": traduce los shap_values a frases entendibles.
 * Cada factor suma puntos (pts) a la probabilidad de que el cliente acepte.
 */
export default function ShapExplainability({ shapValues }) {
  const entries = Object.entries(shapValues || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  if (entries.length === 0) return <div className="space-y-2.5" />

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-600 dark:text-slate-300">{reasonFor(key)}</span>
          <span className="shrink-0 rounded-full bg-cyan-500/10 px-2 py-0.5 font-mono font-semibold text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300">
            +{Math.round(value * 100)} pts
          </span>
        </div>
      ))}
    </div>
  )
}
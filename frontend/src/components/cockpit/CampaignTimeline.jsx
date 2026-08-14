import React, { Fragment } from 'react'
import { Sparkles, CircleDashed } from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

const STAGE_DOT = {
  Analizado: 'bg-slate-400',
  Contactado: 'bg-cyan-400',
  Oferta: 'bg-blue-400',
  Recomendación: 'bg-emerald-400',
}

export default function CampaignTimeline({ campanias, topOffer }) {
  const nodes = campanias.map((c, i) => ({
    key: `camp-${i}`,
    label: c.campaña,
    date: formatDate(c.fecha),
    stage: c.etapa,
    resultado: c.resultado,
    oferta: c.oferta,
    kind: 'past',
  }))
  nodes.push({
    key: 'now',
    label: topOffer?.oferta || 'NBO actual',
    date: 'Hoy',
    stage: 'Recomendación',
    resultado: null,
    kind: topOffer ? 'now' : 'pending',
  })

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-start min-w-max">
        {nodes.map((n, i) => (
          <Fragment key={n.key}>
            <div className="flex w-[168px] shrink-0 flex-col">
              <div>
                {n.kind === 'now' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                    <Sparkles className="h-3 w-3" />
                    {n.label}
                  </span>
                ) : n.kind === 'pending' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-white/5 dark:text-white/50">
                    <CircleDashed className="h-3 w-3" />
                    {n.label}
                  </span>
                ) : (
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-white/80">{n.label}</span>
                )}
                {n.kind === 'past' && n.oferta && (
                  <p className="mt-1 truncate text-[11px] font-medium text-cyan-600 dark:text-cyan-300">
                    Oferta: {n.oferta}
                  </p>
                )}
              </div>
              <div className="mt-2.5 flex items-center">
                <div
                  className={`h-3 w-3 shrink-0 rounded-full ${
                    STAGE_DOT[n.stage] || 'bg-slate-300'
                  } ${n.kind === 'now' ? 'ring-4 ring-emerald-400/25' : ''}`}
                />
                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
              </div>
              <p className="mt-2 font-mono text-[11px] text-slate-400">{n.date}</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/50">
                {n.stage}
                {n.resultado ? ` · ${n.resultado}` : n.kind === 'now' ? ' · En proceso' : ''}
              </p>
            </div>
            {i === nodes.length - 1 && <div className="w-4 shrink-0" />}
          </Fragment>
        ))}
      </div>
      {nodes.length === 1 && (
        <p className="mt-3 text-xs text-slate-400">Sin campañas previas; la recomendación aparecerá aquí.</p>
      )}
    </div>
  )
}

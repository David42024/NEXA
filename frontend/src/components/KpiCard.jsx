import React from 'react'

const gradientMap = {
  cyan: 'from-cyan-500 to-sky-500',
  blue: 'from-sky-500 to-blue-600',
  emerald: 'from-emerald-500 to-teal-500',
  navy: 'from-navy-700 to-navy-800',
}

export default function KpiCard({ icon, label, value, sublabel, accent = 'blue', loading = false }) {
  const gradient = gradientMap[accent] || gradientMap.blue
  return (
    <div className="rounded-2xl border border-black/60 bg-white p-5 transition-colors duration-200 dark:border-white/60 dark:bg-navy-800/60">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl text-white shadow-lg shadow-blue-500/10 ${gradient}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="label-eyebrow">{label}</p>
          {loading ? (
            <div className="mt-1.5 h-6 w-16 animate-pulse rounded bg-slate-200 dark:bg-navy-700" />
          ) : (
            <p className="mt-0.5 truncate font-display text-2xl font-bold text-navy-900 dark:text-white">
              {value}
            </p>
          )}
          {sublabel && !loading && <p className="mt-0.5 truncate text-xs text-slate-400">{sublabel}</p>}
        </div>
      </div>
    </div>
  )
}
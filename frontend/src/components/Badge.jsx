import React from 'react'

const STYLES = {
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  info: 'bg-cyan-50 text-cyan-700',
  neutral: 'bg-slate-100 text-slate-600',
}

export default function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge ${STYLES[tone]}`}>{children}</span>
}

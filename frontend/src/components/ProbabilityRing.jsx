import React from 'react'

export default function ProbabilityRing({ value, size = 88, lowProbability = false }) {
  const pct = Math.round(value * 100)
  const radius = (size - 10) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  const color = lowProbability ? '#F59E0B' : pct >= 70 ? '#00AEEF' : '#0EA5A5'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5EAF1" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-lg leading-none" style={{ color }}>{pct}%</span>
        <span className="text-[9px] text-slate-400 mt-0.5">prob.</span>
      </div>
    </div>
  )
}

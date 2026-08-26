import React from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * Breadcrumb de navegacion geografica: Peru > Departamento > Provincia
 */
export default function HeatmapBreadcrumb({ path, onNavigate }) {
  return (
    <nav aria-label="Navegacion geografica" className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
      {path.map((item, i) => (
        <React.Fragment key={item.id ?? 'root'}>
          {i > 0 && <ChevronRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600" />}
          {i < path.length - 1 ? (
            <button
              onClick={() => onNavigate(item)}
              className="font-medium text-cyan-600 transition-colors hover:text-cyan-500 hover:underline dark:text-cyan-400 dark:hover:text-cyan-300"
            >
              {item.label}
            </button>
          ) : (
            <span className="font-semibold text-navy-800 dark:text-white">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

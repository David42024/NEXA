import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../utils/api'
import ScoreBadge from '../components/ScoreBadge.jsx'
import ScoreLegend from '../components/ScoreLegend.jsx'
import SegmentChips, { SEGMENT_DEFS } from '../components/SegmentChips.jsx'

const PAGE_SIZE = 10

const ELIG_MOTIVOS = ['Elegible MT', 'Elegible upgrade', 'Elegible equipo', 'Elegible Plan Hogar']

function ArrowRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

export default function ClientSearch() {
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const [validationError, setValidationError] = useState(null)
  const [searchMode, setSearchMode] = useState(false)

  const [list, setList] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [soloAhora, setSoloAhora] = useState(false)
  const [segmentos, setSegmentos] = useState([])
  const [segFiltro, setSegFiltro] = useState('Todos')
  const [progreso, setProgreso] = useState(null)
  const reqId = useRef(0)
  const navigate = useNavigate()

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    api.get('/api/asesor/progreso').then(({ data }) => setProgreso(data)).catch(() => null)
  }, [])

  async function loadList(p, seg = segFiltro) {
    setListLoading(true)
    try {
      const { data } = await api.get(
        `/api/clients?segmento=${encodeURIComponent(seg)}&page=${p}&page_size=${PAGE_SIZE}${soloAhora ? '&solo_ahora=true' : ''}`
      )
      setList(data.results)
      setTotal(data.total)
      setPage(data.page)
      setSegmentos(data.segmentos || [])
    } finally {
      setListLoading(false)
    }
  }

  function handleSegClick(segId) {
    setSegFiltro(segId)
    loadList(1, segId)
  }

  async function fetchSearch(q) {
    setLoading(true)
    setSearched(true)
    try {
      const { data } = await api.get(
        `/api/clients/search?q=${encodeURIComponent(q.trim())}${soloAhora ? '&solo_ahora=true' : ''}`
      )
      return data
    } finally {
      setLoading(false)
    }
  }

  // Filtrado en vivo: cada tecla vuelve a consultar (debounce 300ms).
  // Si se borra todo (o nunca se escribe), muestra la lista completa paginada.
  useEffect(() => {
    const q = query.trim()
    const id = ++reqId.current
    const t = setTimeout(async () => {
      if (!q) {
        setSearchMode(false)
        setSearched(false)
        setConfirmation(null)
        setValidationError(null)
        setResults([])
        loadList(1)
        return
      }
      setSearchMode(true)
      setConfirmation(null)
      const data = await fetchSearch(q).catch(() => ({ results: [] }))
      if (id === reqId.current) setResults(data.results)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, soloAhora])

  function handleSubmit(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    // Enter: ademas del filtrado en vivo, muestra confirmacion cuando el ID
    // no existe exacto pero hay coincidencias parciales (spec 10.5).
    setConfirmation(null)
    setSearchMode(true)
    fetchSearch(q).then((data) => {
      setResults(data.results)
      if (data.is_id_query && !data.exact_match && data.results.length > 0) {
        setConfirmation(data.results[0])
      }
    })
  }

  function confirmClient() {
    if (confirmation) navigate(`/clientes/${confirmation.id}`)
  }

  function cancelConfirmation() {
    setQuery('')
  }

  function selectClient(id) {
    navigate(`/clientes/${id}`)
  }

  function backToAll() {
    setQuery('')
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-eyebrow">Clientes</p>
          <h1 className="font-display font-bold text-2xl text-navy-900 mb-6">Buscar cliente</h1>
        </div>
        {progreso && (
          <div
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500 dark:border-white/10 dark:bg-navy-800/60 dark:text-slate-400"
            title="Ventas del día vs meta diaria configurada por el admin"
          >
            🎯 Meta diaria <span className="font-semibold text-navy-800 dark:text-white">{progreso.meta_diaria}</span>
            <span className="mx-1">·</span>
            hoy <span className="font-semibold text-navy-800 dark:text-white">{progreso.ventas_dia}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-2 max-w-xl">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setValidationError(null) }}
          placeholder="ID (C00125), nombre o DNI…"
          className={`input ${validationError ? '!border-rose-400 !ring-rose-200' : ''}`}
          autoFocus
          aria-label="Buscar cliente por ID, nombre o DNI"
        />
        <button className="btn-primary inline-flex shrink-0 items-center gap-1.5" type="submit">Buscar
          <ArrowRightIcon className="h-4 w-4" />
        </button>

      </form>

      {validationError && (
        <p className="text-sm text-rose-600 mb-4" role="alert">{validationError}</p>
      )}

      <button
        onClick={() => setSoloAhora((v) => !v)}
        aria-pressed={soloAhora}
        className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          soloAhora
            ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/60 dark:text-emerald-300'
            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-white/10 dark:bg-navy-800/60 dark:text-slate-400'
        }`}
        title="Muestra solo clientes cuya mejor hora de atención incluye el horario actual"
      >
        <span className={`h-2 w-2 rounded-full ${soloAhora ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        Solo llamables ahora
      </button>

      {loading && <p className="text-sm text-slate-400">Buscando…</p>}

      {searchMode && !loading && searched && results.length === 0 && !confirmation && (
        <div className="card p-6 max-w-xl">
          <p className="font-medium text-navy-900">No se encontró cliente con ese ID</p>
          <p className="text-sm text-slate-500 mt-1">Verifique el ID o busque por nombre.</p>
          <button onClick={backToAll} className="btn-secondary text-sm mt-4">Ver todos los clientes</button>
        </div>
      )}

      {searchMode && !loading && results.length > 0 && !confirmation && (
        <>
          <div className="flex items-center justify-between mb-2 max-w-2xl">
            <p className="text-xs text-slate-400">Resultados de búsqueda</p>
            <button onClick={backToAll} className="btn-ghost text-xs">Ver todos los clientes →</button>
          </div>
          <div className="flex flex-wrap items-start gap-6">
            <div className="card divide-y divide-slate-100 max-w-2xl min-w-0 flex-1">
              {results.map((c) => (
                <ClientRow key={c.id} c={c} onSelect={selectClient} />
              ))}
            </div>
            <div className="shrink-0 lg:sticky lg:top-24">
              <ScoreLegend />
            </div>
          </div>
        </>
      )}

      {!searchMode && (
        <>
          {segmentos.length > 0 && (
            <SegmentChips segmentos={segmentos} active={segFiltro} onSelect={handleSegClick} />
          )}
          <p className="mb-2 text-xs text-slate-400">
            Todos los clientes ordenados por probabilidad de aceptación (motor NBO)
          </p>
          <div className="flex flex-wrap items-start gap-6">
            <div className="min-w-0 flex-1 max-w-2xl">
              {listLoading ? (
                <p className="text-sm text-slate-400">Cargando clientes…</p>
              ) : list.length === 0 ? (
                <div className="card p-6 max-w-2xl">
                  <p className="text-sm text-slate-500">No hay clientes registrados.</p>
                </div>
              ) : (
                <div className="card divide-y divide-slate-100 max-w-2xl">
                  {list.map((c) => (
                    <ClientRow key={c.id} c={c} onSelect={selectClient} />
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3 max-w-2xl">
                <button
                  onClick={() => loadList(page - 1)}
                  disabled={page <= 1 || listLoading}
                  className="btn-secondary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Anterior
                </button>
                <span className="text-xs text-slate-500">
                  Página {page} de {totalPages} · {total} clientes
                </span>
                <button
                  onClick={() => loadList(page + 1)}
                  disabled={page >= totalPages || listLoading}
                  className="btn-secondary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente →
                </button>
              </div>
            </div>
            <div className="shrink-0 lg:sticky lg:top-24">
              <ScoreLegend />
            </div>
          </div>
        </>
      )}

      {confirmation && (
        <div
          className="fixed inset-0 bg-navy-950/50 flex items-center justify-center px-4 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar cliente"
        >
          <div className="card p-6 w-full max-w-md">
            <p className="font-display font-semibold text-navy-900 mb-1">
              ¿Estás seguro de que este es el ID correcto?
            </p>
            <p className="text-sm text-slate-600 mb-1">
              Este ID pertenece a: <span className="font-medium text-navy-900">{confirmation.name}</span>
            </p>
            <p className="text-xs text-slate-400 mb-5 font-mono">
              {confirmation.id} · {confirmation.district}
            </p>
            <div className="flex gap-2">
              <button onClick={confirmClient} className="btn-primary text-sm">Confirmar</button>
              <button onClick={cancelConfirmation} className="btn-secondary text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientRow({ c, onSelect }) {
  return (
    <button
      onClick={() => onSelect(c.id)}
      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors dark:hover:bg-white/5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="w-10 h-10 shrink-0 rounded-full bg-navy-900/5 flex items-center justify-center font-display font-semibold text-navy-800">
          {c.name?.[0]}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-navy-900 dark:text-white truncate">{c.name}</p>
          <p className="text-xs text-slate-400 font-mono truncate">
            {c.id} · {c.district} · Plan {c.plan_actual || '—'}
          </p>
          {c.mejor_hora && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
              🕒 Mejor hora {c.mejor_hora}
            </p>
          )}
          {c.top_offer && (
            <p className="mt-0.5 text-[11px] text-cyan-600 dark:text-cyan-400 truncate">
              → {c.top_offer}
              {c.motivo && !ELIG_MOTIVOS.includes(c.motivo) ? ` · por ${c.motivo}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        {c.segmento && SEGMENT_DEFS[c.segmento] && (
          <span className={`badge ${SEGMENT_DEFS[c.segmento].pill}`}>{SEGMENT_DEFS[c.segmento].label}</span>
        )}
        {c.llamable_ahora && (
          <span
            className="badge hidden bg-emerald-500/10 text-emerald-600 sm:inline-flex dark:bg-emerald-400/10 dark:text-emerald-300"
            title="Su mejor hora de atención incluye el horario actual"
          >
            Llamable ahora
          </span>
        )}
        {c.elegible && (
          <span
            className="badge hidden bg-cyan-500/10 text-cyan-600 sm:inline-flex dark:bg-cyan-400/10 dark:text-cyan-300"
            title="Elegible para Movistar Total"
          >
            Elegible MT
          </span>
        )}
        <ScoreBadge value={c.score} />
      </div>
    </button>
  )
}
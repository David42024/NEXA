import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../utils/api'
import ScoreBadge from '../components/ScoreBadge.jsx'
import ScoreLegend from '../components/ScoreLegend.jsx'

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
  const reqId = useRef(0)
  const navigate = useNavigate()

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function loadList(p) {
    setListLoading(true)
    try {
      const { data } = await api.get(`/api/clients?page=${p}&page_size=${PAGE_SIZE}`)
      setList(data.results)
      setTotal(data.total)
      setPage(data.page)
    } finally {
      setListLoading(false)
    }
  }

  async function fetchSearch(q) {
    setLoading(true)
    setSearched(true)
    try {
      const { data } = await api.get(`/api/clients/search?q=${encodeURIComponent(q.trim())}`)
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
  }, [query])

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
      <p className="label-eyebrow">Clientes</p>
      <h1 className="font-display font-bold text-2xl text-navy-900 mb-6">Buscar cliente</h1>

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

              <div className="mt-4 flex items-center gap-3 max-w-2xl">
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
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-navy-900/5 flex items-center justify-center font-display font-semibold text-navy-800">
          {c.name?.[0]}
        </div>
        <div>
          <p className="font-medium text-navy-900 dark:text-white">{c.name}</p>
          <p className="text-xs text-slate-400 font-mono">
            {c.id} · {c.district} · Plan {c.plan_actual || '—'}
          </p>
          {c.top_offer && (
            <p className="mt-0.5 text-[11px] text-cyan-600 dark:text-cyan-400">
              → {c.top_offer}
              {c.motivo && !ELIG_MOTIVOS.includes(c.motivo) ? ` · por ${c.motivo}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {c.elegible && (
          <span
            className="badge bg-cyan-500/10 text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-300"
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
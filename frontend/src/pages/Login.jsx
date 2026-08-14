import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'

const DEMO_USERS = [
  { role: 'Asesor', email: 'asesor@nexa.demo', password: 'asesor123' },
  { role: 'Supervisor', email: 'supervisor@nexa.demo', password: 'supervisor123' },
  { role: 'Admin', email: 'admin@nexa.demo', password: 'admin123' },
]

// --- Iconos minimalistas (inline) ---
function MailIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

function LockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <path d="m2 2 20 20" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  )
}

function UserIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function AlertIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function ArrowRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function SpinnerIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin" {...props}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
    </svg>
  )
}

// Logo: usa la imagen provista en /nexa-logo.png. Sin imagen, cede el espacio al wordmark NEXA.
function BrandMark({ className = 'h-10 w-auto' }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    <img
      src="/nexa-logo.png"
      alt="Logo NEXA"
      className={`object-contain ${className}`}
      onError={() => setBroken(true)}
    />
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { login, loading, error } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    const ok = await login(email.trim(), password)
    if (ok) navigate('/')
  }

  function fillDemo(u) {
    setEmail(u.email)
    setPassword(u.password)
    setShowPassword(false)
  }

  const activeRole = DEMO_USERS.find((u) => u.email === email.trim())?.role

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 text-navy-900 transition-colors duration-200 dark:bg-navy-950 dark:text-white">
      <ThemeToggle className="absolute right-5 top-5 z-20" />

      {/* Luces ambientales muy sutiles (el color de acento NEXA). */}
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-cyan-400/20 blur-3xl dark:bg-cyan-500/[0.08]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-24 h-[30rem] w-[30rem] rounded-full bg-sky-300/25 blur-3xl dark:bg-cyan-400/[0.05]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(8,169,230,0.05),transparent_55%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-10 lg:grid lg:max-w-7xl lg:grid-cols-2 lg:items-center lg:gap-20 lg:px-12">
        {/* Masthead (mobile/tablet) */}
        <div className="animate-nexa-rise mb-10 flex items-center gap-3 lg:hidden">
          <BrandMark className="h-9 w-auto" />
          <div>
            <p className="font-display text-lg font-bold leading-none tracking-tight text-navy-900 dark:text-white">
              NEXA
            </p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Next Experience &amp; Offer AI
            </p>
          </div>
        </div>

        {/* Branding (desktop) */}
        <div className="hidden lg:block">
          <div className="animate-nexa-rise">
            <BrandMark className="h-14 w-auto" />
            <h1 className="mt-8 font-display text-5xl font-extrabold leading-none tracking-tight text-navy-900 dark:text-white">
              NEXA
            </h1>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-600 dark:text-cyan-400">
              Next Experience &amp; Offer AI
            </p>
            <p className="mt-9 max-w-md text-2xl font-semibold leading-snug text-navy-800 dark:text-white/95">
              La oferta correcta.
              <br />
              <span className="text-slate-500 dark:text-slate-300">En el momento correcto.</span>
            </p>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
              Prioriza tus clientes con el motor NBO, comprende cada
              recomendación con explicabilidad SHAP y cierra la venta con un
              speech adaptado a cada conversación.
            </p>
          </div>
        </div>

        {/* Panel de autenticación */}
        <div className="animate-nexa-rise mx-auto w-full max-w-md [animation-delay:80ms] lg:max-w-none">
          <div className="rounded-2xl border border-black/60 bg-white/70 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_30px_60px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-white/60 dark:bg-navy-900/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_30px_60px_-30px_rgba(2,8,20,0.9)] sm:p-8">
            <h2 className="font-display text-xl font-semibold tracking-tight text-navy-900 dark:text-white">
              Bienvenido de vuelta
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Inicia sesión para acceder a tus clientes priorizados y
              recomendaciones inteligentes.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
              <fieldset disabled={loading} className="space-y-5">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@empresa.com"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-900 placeholder:text-slate-400 transition duration-200 outline-none hover:border-slate-300 focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500 dark:hover:border-white/20 dark:focus:border-cyan-400/70 dark:focus:bg-white/[0.06] dark:focus:ring-cyan-500/25"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Contraseña
                  </label>
                  <div className="relative">
                    <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-11 text-sm text-navy-900 placeholder:text-slate-400 transition duration-200 outline-none hover:border-slate-300 focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500 dark:hover:border-white/20 dark:focus:border-cyan-400/70 dark:focus:bg-white/[0.06] dark:focus:ring-cyan-500/25"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition duration-200 hover:text-cyan-600 focus-visible:text-cyan-600 dark:text-slate-500 dark:hover:text-cyan-400 dark:focus-visible:text-cyan-400"
                    >
                      {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </fieldset>

              {error && (
                <p
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                >
                  <AlertIcon className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="group relative flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 font-semibold text-navy-950 transition duration-200 hover:bg-cyan-400 focus-visible:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 dark:focus-visible:ring-offset-navy-900"
              >
                {loading ? (
                  <>
                    <SpinnerIcon />
                    <span>Iniciando sesión…</span>
                  </>
                ) : (
                  <>
                    <span>Iniciar sesión</span>
                    <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            {/* Accesos de demostración */}
            <div className="mt-7 border-t border-slate-200/70 pt-6 dark:border-white/[0.07]">
              <p className="label-eyebrow text-slate-500 dark:text-slate-500">Accesos de demostración</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {DEMO_USERS.map((u) => {
                  const active = activeRole === u.role
                  return (
                    <button
                      key={u.email}
                      type="button"
                      onClick={() => fillDemo(u)}
                      aria-label={`Usar acceso de ${u.role}`}
                      className={`flex min-h-[48px] flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium transition duration-200 ${
                        active
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-600 dark:border-cyan-400/60 dark:bg-cyan-500/10 dark:text-cyan-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-cyan-400/60 hover:bg-slate-100 hover:text-navy-900 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-cyan-400/40 dark:hover:bg-white/[0.05] dark:hover:text-white'
                      }`}
                    >
                      <UserIcon className="h-4 w-4" />
                      <span>{u.role}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Indicador de seguridad */}
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <ShieldIcon className="h-3.5 w-3.5" />
            Conexión segura · tus datos viajan cifrados
          </p>
        </div>
      </div>
    </div>
  )
}
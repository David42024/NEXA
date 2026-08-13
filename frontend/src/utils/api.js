import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nexa_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise = null

async function tryRefreshToken() {
  const refreshToken = localStorage.getItem('nexa_refresh')
  if (!refreshToken) return null
  // Usa una llamada cruda (sin interceptores) para evitar recursividad.
  const { data } = await axios.post(
    `${import.meta.env.VITE_API_URL || ''}/api/auth/refresh`,
    { refresh_token: refreshToken }
  )
  localStorage.setItem('nexa_token', data.access_token)
  if (data.refresh_token) localStorage.setItem('nexa_refresh', data.refresh_token)
  return data.access_token
}

function clearSession() {
  localStorage.removeItem('nexa_token')
  localStorage.removeItem('nexa_refresh')
  localStorage.removeItem('nexa_user')
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    const isAuthCall = original?.url?.includes('/api/auth/login') || original?.url?.includes('/api/auth/refresh')
    const isRefreshCall = original?.url?.includes('/api/auth/refresh')

    if (err.response?.status === 401 && !original?._retry && !isAuthCall) {
      original._retry = true
      // Evita lanzar dos refrescos en paralelo para el mismo 401.
      if (!refreshPromise) {
        refreshPromise = tryRefreshToken().finally(() => {
          refreshPromise = null
        })
      }
      try {
        const newToken = await refreshPromise
        if (newToken) {
          original.headers.Authorization = `Bearer ${newToken}`
          return api(original)
        }
      } catch (e) {
        // refresh fallo -> sesion invalida
      }
      if (!isRefreshCall) clearSession()
      return Promise.reject(err)
    }

    if (err.response?.status === 401) {
      clearSession()
    }
    return Promise.reject(err)
  }
)

export default api

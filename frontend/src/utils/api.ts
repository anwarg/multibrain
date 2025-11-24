const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

export function isAuthenticated(): boolean {
  return !!getAuthToken()
}

export function logout(): void {
  localStorage.removeItem('auth_token')
}

export { API_URL }

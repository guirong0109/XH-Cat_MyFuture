// Account calls. The session lives in an HttpOnly cookie the page never sees.
import { api } from './api.js'

export const signup = (email, password, language) => api('POST', '/api/auth/signup', { email, password, language })
export const login = (email, password) => api('POST', '/api/auth/login', { email, password })
export const me = () => api('GET', '/api/auth/me')
export const logout = () => api('POST', '/api/auth/logout')
export const deleteMyData = () => api('DELETE', '/api/auth/me')

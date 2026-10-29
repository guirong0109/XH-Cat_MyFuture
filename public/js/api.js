// Calls to the module's API. Every call returns { ok:true, data } or { ok:false, code, retryable }.
export async function api(method, url, body) {
  let response
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, code: 'network', retryable: true }
  }
  const data = await response.json().catch(() => null)
  if (response.ok) return { ok: true, data }
  const error = data?.error
  return error?.code ? { ok: false, code: error.code, retryable: Boolean(error.retryable) } : { ok: false, code: 'server_error', retryable: true }
}

// CV upload from the browser. The server decides what the file really is; this check only saves a pointless upload.
const MAX_BYTES = 10 * 1024 * 1024
const TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

const extension = (file) => file.name.split('.').pop().toLowerCase()

export function checkBeforeUpload(file) {
  if (!file || !file.size || !TYPES[extension(file)]) return { ok: false, code: 'unsupported_type', retryable: false }
  if (file.size > MAX_BYTES) return { ok: false, code: 'too_large', retryable: false }
  return { ok: true }
}

// Sends the file as the raw body. onUploaded() fires once the bytes have left the browser (the server is then working).
// Returns { ok:true, data } or { ok:false, code, retryable } like api().
export function uploadCv(file, { lang, onUploaded = () => {} }) {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/cv/extract')
    request.setRequestHeader('Content-Type', TYPES[extension(file)] ?? 'application/octet-stream')
    request.setRequestHeader('X-Interface-Language', lang)
    request.upload.onload = () => onUploaded()
    request.onerror = () => resolve({ ok: false, code: 'network', retryable: true })
    request.onload = () => {
      let data = null
      try {
        data = JSON.parse(request.responseText)
      } catch {}
      if (request.status === 200 && data?.status === 'ok') return resolve({ ok: true, data })
      const error = data?.error
      resolve(error?.code ? { ok: false, code: error.code, retryable: Boolean(error.retryable) } : { ok: false, code: 'server_error', retryable: true })
    }
    request.send(file)
  })
}

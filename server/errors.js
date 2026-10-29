// One error shape for every API answer: { error: { code, message, retryable } }. No stack traces, no paths.
export function sendError(response, status, code, message, retryable = false) {
  return response.status(status).json({ error: { code, message, retryable } })
}

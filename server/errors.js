// One error shape for every API answer: { error: { code, message, retryable } }. No stack traces, no paths.
import express from 'express'

export function sendError(response, status, code, message, retryable = false) {
  return response.status(status).json({ error: { code, message, retryable } })
}

// JSON body parser whose errors use the same shape.
export function jsonBody(limit) {
  return (request, response, next) =>
    express.json({ limit })(request, response, (error) => {
      if (!error) return next()
      if (error.type === 'entity.too.large') return sendError(response, 413, 'too_large', 'The request is too large.')
      return sendError(response, 400, 'bad_json', 'The request is not valid JSON.')
    })
}

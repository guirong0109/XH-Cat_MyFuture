// A failure of an external Radar data source. `code` is the stable machine name, `detail` holds non-secret hints
// (for example a rate-limit reset time). Never put keys or response bodies in `detail`.
export class SourceError extends Error {
  constructor(code, { retryable = false, detail = {} } = {}) {
    super(code)
    this.name = 'SourceError'
    this.code = code
    this.retryable = retryable
    this.detail = detail
  }
}

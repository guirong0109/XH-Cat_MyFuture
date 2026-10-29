import { describe, expect, it } from 'vitest'
import { checkBeforeUpload } from '../public/js/cvApi.js'

const file = (name, size, type = '') => new File([new Uint8Array(size)], name, { type })

describe('checkBeforeUpload (browser, before anything is sent)', () => {
  it('accepts PDF and DOCX up to 10 MB', () => {
    expect(checkBeforeUpload(file('cv.pdf', 1000, 'application/pdf'))).toEqual({ ok: true })
    expect(checkBeforeUpload(file('CV.DOCX', 10 * 1024 * 1024))).toEqual({ ok: true })
  })
  it('refuses other types, empty files and files over 10 MB', () => {
    expect(checkBeforeUpload(file('photo.png', 10, 'image/png'))).toEqual({ ok: false, code: 'unsupported_type', retryable: false })
    expect(checkBeforeUpload(file('old.doc', 10, 'application/msword'))).toEqual({ ok: false, code: 'unsupported_type', retryable: false })
    expect(checkBeforeUpload(file('cv.pdf', 0))).toEqual({ ok: false, code: 'unsupported_type', retryable: false })
    expect(checkBeforeUpload(file('cv.pdf', 10 * 1024 * 1024 + 1))).toEqual({ ok: false, code: 'too_large', retryable: false })
  })
})

import { describe, expect, it } from 'vitest'
import { detectEvidenceTipo } from './evidenceTipo'

describe('detectEvidenceTipo', () => {
  it('classifies image MIME types as foto', () => {
    expect(detectEvidenceTipo('image/jpeg')).toBe('foto')
    expect(detectEvidenceTipo('image/png')).toBe('foto')
  })

  it('classifies video MIME types as video', () => {
    expect(detectEvidenceTipo('video/mp4')).toBe('video')
    expect(detectEvidenceTipo('video/quicktime')).toBe('video')
  })

  it('classifies everything else as documento', () => {
    expect(detectEvidenceTipo('application/pdf')).toBe('documento')
    expect(detectEvidenceTipo('application/msword')).toBe('documento')
    expect(detectEvidenceTipo('text/plain')).toBe('documento')
  })
})

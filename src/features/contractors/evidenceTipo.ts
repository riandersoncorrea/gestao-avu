import type { EvidenceTipo } from './types'

/** Classifica o arquivo pelo MIME type — o usuário não escolhe manualmente o tipo. */
export function detectEvidenceTipo(mimeType: string): EvidenceTipo {
  if (mimeType.startsWith('image/')) return 'foto'
  if (mimeType.startsWith('video/')) return 'video'
  return 'documento'
}

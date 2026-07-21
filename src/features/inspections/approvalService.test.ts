import { describe, expect, it } from 'vitest'
import { mapBucketToQuery } from './approvalService'

describe('mapBucketToQuery', () => {
  it('maps aguardando_aprovacao to a status filter', () => {
    expect(mapBucketToQuery('aguardando_aprovacao')).toEqual({ status: 'AGUARDANDO_APROVACAO' })
  })

  it('maps aguardando_complementacao to a status filter', () => {
    expect(mapBucketToQuery('aguardando_complementacao')).toEqual({ status: 'AGUARDANDO_EVIDENCIAS' })
  })

  it('maps aprovados to a status filter', () => {
    expect(mapBucketToQuery('aprovados')).toEqual({ status: 'CONCLUIDO' })
  })

  it('maps reprovados to a latestDecision filter, not a status filter (reprovar não usa o status REPROVADO)', () => {
    expect(mapBucketToQuery('reprovados')).toEqual({ latestDecision: 'reprovado' })
  })
})

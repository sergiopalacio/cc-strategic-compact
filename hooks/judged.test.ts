import { describe, expect, test } from 'claude-code/testing'

import { judged } from './register'

/**
 * The asymmetry the whole mod rests on, as a table.
 *
 * A wrong hold costs a turn and the engine's own auto-compaction is the floor
 * under it; a wrong compaction loses work nobody notices is gone. So every shape
 * that is not plainly READY has to fall the cheap way, and the shapes a model
 * actually produces when it ignores a format are what this table is made of.
 */
describe('anything that is not plainly READY holds', () => {
  for (const answer of [
    '',
    '   ',
    'HOLD',
    'READY, I think',
    'I would say READY',
    'Sure! Here is my verdict:\nREADY',
    '```\nREADY\n```',
    '{"verdict":"READY"}',
    'HOLD\nREADY',
    '**READY**',
  ]) {
    test(JSON.stringify(answer), () => {
      expect(judged(answer).isReady).toBe(false)
    })
  }
})

test('READY on its own line is the only way through', () => {
  expect(judged('READY').isReady).toBe(true)
  expect(judged('READY\nkeep: the migration order').isReady).toBe(true)
})

test('the brief comes from the keep line, wherever it sits', () => {
  expect(judged('READY\nkeep: the migration order').line).toBe('the migration order')
  expect(judged('READY\n\nkeep:   spaced out  ').line).toBe('spaced out')
})

test('a hold names nothing, because it is asked for nothing', () => {
  expect(judged('HOLD').line).toBe('')
})

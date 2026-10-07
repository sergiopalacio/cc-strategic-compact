import { expect, test } from 'claude-code/testing'

import { ENDED, world } from './world'


test('a running subagent beats a READY verdict', async ($, on) => {
  const seen = world(on, { verdict: 'READY\nkeep: all of it', agents: [{ status: 'running' }] })

  await $.turn.complete(ENDED)

  expect(seen.compactions).toEqual([])
})

test('the judge is never asked while a gate holds', async ($, on) => {
  const seen = world(on, { agents: [{ status: 'running' }] })

  await $.turn.complete(ENDED)

  // A gate that holds is known before the call, so the call is never billed.
  expect(seen.asked()).toBe(0)
})

test('a hold compacts nothing', async ($, on) => {
  const seen = world(on, { verdict: 'HOLD' })

  await $.turn.complete(ENDED)

  expect(seen.compactions).toEqual([])
})

test('the brief the judge named reaches the summariser', async ($, on) => {
  const seen = world(on, { verdict: 'READY\nkeep: the migration order' })

  await $.turn.complete(ENDED)

  expect(seen.compactions.length).toBe(1)
  expect(seen.compactions[0]).toContain('the migration order')
})

test('a subagent turn never compacts the main conversation', async ($, on) => {
  const seen = world(on, { verdict: 'READY\nkeep: all of it' })

  // Every hook sees subagents' turns too; without the guard a review that spawns
  // twenty of them would try to compact twenty times.
  await $.turn.complete({ ...ENDED, agentId: 'a1' })

  expect(seen.compactions).toEqual([])
})

test('an interrupted turn never compacts', async ($, on) => {
  const seen = world(on, { verdict: 'READY\nkeep: all of it' })

  await $.turn.complete({ ...ENDED, reason: 'aborted' })

  expect(seen.compactions).toEqual([])
})

test('the floor refuses a second compaction inside fifteen minutes', async ($, on) => {
  const { clock, ...seen } = world(on, { verdict: 'READY\nkeep: all of it' })

  await $.turn.complete(ENDED)
  expect(seen.compactions.length).toBe(1)

  await clock.advance(14 * 60_000)
  await $.turn.complete(ENDED)
  expect(seen.compactions.length).toBe(1)

  await clock.advance(2 * 60_000)
  await $.turn.complete(ENDED)
  expect(seen.compactions.length).toBe(2)
})

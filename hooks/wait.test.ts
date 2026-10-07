import { expect, test } from 'claude-code/testing'

import { ENDED, world } from './world'

const READY = 'READY\nkeep: all of it'

/**
 * The one piece with a timer, a deadline and three exits, and until now the only
 * thing that had ever run it was a real session.
 */
test('a held moment is taken up when the work in flight finishes', async ($, on) => {
  const running = [{ status: 'running' }]
  const agents: { status: string }[] = [...running]
  const seen = world(on, { verdict: READY, agents })

  await $.turn.complete(ENDED)
  expect(seen.compactions).toEqual([])

  agents.length = 0
  await seen.clock.advance(20_000)

  expect(seen.compactions.length).toBe(1)
})

test('it asks the judge once the gate clears, not before', async ($, on) => {
  const agents: { status: string }[] = [{ status: 'running' }]
  const seen = world(on, { verdict: READY, agents })

  await $.turn.complete(ENDED)
  await seen.clock.advance(60_000)
  expect(seen.asked()).toBe(0)

  agents.length = 0
  await seen.clock.advance(20_000)
  expect(seen.asked()).toBe(1)
})

test('it gives up after ten minutes', async ($, on) => {
  const seen = world(on, { verdict: READY, agents: [{ status: 'running' }] })

  await $.turn.complete(ENDED)
  await seen.clock.advance(11 * 60_000)

  expect(seen.asked()).toBe(0)
  expect(seen.compactions).toEqual([])
})

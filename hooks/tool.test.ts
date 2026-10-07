import { expect, test } from 'claude-code/testing'

import { ASKS, ENDED, world } from './world'


/**
 * The name the engine registers is derived from the plugin's, so a matcher that
 * drifts from it leaves the tool listed and unanswered. That is how it shipped
 * once, and nothing but this would have caught it.
 */
test('the tool answers under the name the engine gives it', async ($, on) => {
  world(on)

  const { result } = await $.tool.call(ASKS)

  expect(String(result)).toContain('Armed')
})

test('arming compacts at the end of the turn, without asking the judge', async ($, on) => {
  const seen = world(on)

  await $.tool.call(ASKS)
  await $.turn.complete(ENDED)

  expect(seen.compactions.length).toBe(1)
  expect(seen.asked()).toBe(0)
})

test('what the agent says to keep reaches the summariser', async ($, on) => {
  const seen = world(on)

  await $.tool.call({ ...ASKS, keep: 'the index must be partial' })
  await $.turn.complete(ENDED)

  expect(seen.compactions[0]).toContain('the index must be partial')
})

test('a running subagent refuses the call, with the reason', async ($, on) => {
  world(on, { agents: [{ status: 'running' }] })

  const { result } = await $.tool.call(ASKS)

  // Refused with its reason rather than ignored: the caller is a model, and a
  // tool that answers nothing teaches it nothing about when to call again.
  expect(String(result)).toContain('Not armed')
  expect(String(result)).toContain('subagent')
})

test('the floor refuses the call too', async ($, on) => {
  const { clock } = world(on, { verdict: 'READY\nkeep: all of it' })

  await $.turn.complete(ENDED)
  await clock.advance(60_000)
  const { result } = await $.tool.call(ASKS)

  expect(String(result)).toContain('floor')
})

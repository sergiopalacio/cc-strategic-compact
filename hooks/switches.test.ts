import { expect, test } from 'claude-code/testing'

import { ASKS, ENDED, world } from './world'

const READY = 'READY\nkeep: all of it'

test('with the judge off, nothing is asked and nothing compacts', { options: { judgeEnabled: false } }, async ($, on) => {
  const seen = world(on, { verdict: READY })

  await $.turn.complete(ENDED)

  expect(seen.asked()).toBe(0)
  expect(seen.compactions).toEqual([])
})

test('with the judge off, the tool still compacts', { options: { judgeEnabled: false } }, async ($, on) => {
  const seen = world(on)

  await $.tool.call(ASKS)
  await $.turn.complete(ENDED)

  expect(seen.compactions.length).toBe(1)
})

test('with the tool off, a call is refused', { options: { toolEnabled: false } }, async ($, on) => {
  world(on)

  // Switching it off cannot unregister it, so the refusal is what makes the
  // switch take effect before the next session.
  const refused = await $.tool.call(ASKS)

  expect(String(refused.deny)).toContain('switched off')
})

test('with the tool off, the judge still compacts', { options: { toolEnabled: false } }, async ($, on) => {
  const seen = world(on, { verdict: READY })

  await $.turn.complete(ENDED)

  expect(seen.compactions.length).toBe(1)
})

test('below askFromPercent the judge is not asked', { options: { askFromPercent: 40 } }, async ($, on) => {
  // The brake that matters: it measures material rather than the clock, and it is
  // what stops a fork call per turn from the very first turn.
  const seen = world(on, { verdict: READY, percent: 10 })

  await $.turn.complete(ENDED)

  expect(seen.asked()).toBe(0)
  expect(seen.compactions).toEqual([])
})

test('at askFromPercent it is', { options: { askFromPercent: 40 } }, async ($, on) => {
  const seen = world(on, { verdict: READY, percent: 50 })

  await $.turn.complete(ENDED)

  expect(seen.asked()).toBe(1)
  expect(seen.compactions.length).toBe(1)
})

test('with no rules of your own and override, the judge is never asked', { options: { rulesMode: 'override', compactWhen: '' } }, async ($, on) => {
  const seen = world(on, { verdict: READY })

  await $.turn.complete(ENDED)

  expect(seen.asked()).toBe(0)
})

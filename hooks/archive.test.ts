import { expect, test } from 'claude-code/testing'

import { ENDED, world } from './world'

const READY = 'READY\nkeep: all of it'

test('a compaction writes what it replaced', async ($, on) => {
  const seen = world(on, { verdict: READY })

  await $.turn.complete(ENDED)

  expect(seen.compactions.length).toBe(1)
  expect(seen.written.length).toBe(1)
  expect(seen.written[0]?.path).toContain('/.cc-strategic-compaction/compactions/test-session/')
  expect(seen.written[0]?.path).toMatch(/\.jsonl$/)
})

test('a vetoed compaction leaves no file behind', async ($, on) => {
  const seen = world(on, { verdict: READY, skip: 'another plugin said no' })

  await $.turn.complete(ENDED)

  expect(seen.written).toEqual([])
})

test('a hold writes nothing', async ($, on) => {
  const seen = world(on, { verdict: 'HOLD' })

  await $.turn.complete(ENDED)

  expect(seen.written).toEqual([])
})

test('what it writes is the conversation, one message per line', async ($, on) => {
  const replaced = [
    { role: 'user', content: 'do the thing' },
    { role: 'assistant', content: 'done' },
  ]
  const seen = world(on, { verdict: READY, messages: replaced })

  await $.turn.complete(ENDED)

  expect(seen.written[0]?.text.split('\n').map(one => JSON.parse(one))).toEqual(replaced)
})

test('a record that cannot be written does not undo the compaction', async ($, on) => {
  const seen = world(on, { verdict: READY, writeFails: true })

  await $.turn.complete(ENDED)

  expect(seen.compactions.length).toBe(1)
})

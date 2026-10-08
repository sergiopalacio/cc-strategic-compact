import { expect, test } from 'claude-code/testing'

import { SITE, world } from './world'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

/**
 * No surface has every element: mobile draws no field, vscode no Client, the
 * terminal no Svg. The pane asks the table rather than assuming, and this is the
 * check that would have caught the mobile crash before the type error did.
 */
for (const surface of SURFACES) {
  test(`the pane draws on ${surface}`, async ($, on) => {
    world(on, { percent: 50 })

    const ui = await $.ui.mount({
      plugin: 'cc-strategic-compaction',
      surface,
      component: 'Pane',
      props: SITE,
      requestId: 'compaction',
    })

    expect(await ui.find({ type: 'Text', text: /Judge/ })).toBeDefined()
    await ui.unmount()
  })
}

test('pressing the Judge switch writes the setting', async ($, on) => {
  const seen = world(on)

  const ui = await $.ui.mount({
    plugin: 'cc-strategic-compaction',
    surface: 'terminal',
    component: 'Pane',
    props: SITE,
    requestId: 'compaction',
  })
  await ui.press({ key: 'judgeEnabled' })

  expect(seen.written.map(one => one.path)).toContain('cc-strategic-compaction.judgeEnabled')
  await ui.unmount()
})

/**
 * The switch has to draw the setting as it stands, not as it stood when the
 * module loaded: the press is drawn before the reload that renews the options, so
 * a switch drawn from those shows the old state and reads as a dead button.
 */
test('the switch draws the setting as it stands', async ($, on) => {
  world(on, { settings: { judgeEnabled: false } })

  const ui = await $.ui.mount({
    plugin: 'cc-strategic-compaction',
    surface: 'terminal',
    component: 'Pane',
    props: SITE,
    requestId: 'compaction',
  })

  expect(await ui.find({ type: 'Button', text: /off/ })).toBeDefined()
  await ui.unmount()
})

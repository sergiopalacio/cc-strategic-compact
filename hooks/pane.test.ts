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

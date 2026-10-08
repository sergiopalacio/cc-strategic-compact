/**
 * The world beneath the plugin, for tests: everything it calls that nothing else
 * would answer, since the test's own `on` is the bottom of the chain.
 *
 * Not shipped behaviour. It exists so a test can state the one thing it is about
 * and inherit the rest. Variations are asked for through `options` rather than by
 * registering again, because one `on` takes each event once.
 */
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { MockClock } from 'claude-code/testing'

export const ZERO = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

/** A main-loop turn that ended with an answer, whole, as the engine raises it. */
export const ENDED = {
  reason: 'answer' as const,
  answer: '',
  durationMs: 0,
  isAborted: false,
  turnId: 'turn-1',
}

/** The site a Pane is drawn in, as a surface measures it. */
export const SITE = {
  title: 'Compaction',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

/** What the agent sends when it asks for a compaction. */
export const ASKS = {
  tool: 'mcp__cc-strategic-compaction__compact' as const,
  tool_use_id: 'call-1',
  reason: 'wrote it all down',
}

/** A judge that answers `text`, with the usage shape a real fork carries. */
export const says = (text: string) => ({ isAnswered: true as const, text, usage: ZERO })

/**
 * Stand-ins rather than the real prompts: these tests are about whether the
 * placeholders get filled, and reading the real files would break every one of
 * them the next time a sentence is reworded.
 */
const PROMPTS: Record<string, string> = {
  'rules.md': 'RULES',
  'judge.md': 'JUDGE\n{{rules}}',
  'summary.md': 'SUMMARY{{brief}}',
  'tool.md': 'TOOL',
}

const ROWS = [
  { key: 'judgeEnabled', label: 'Judge', value: true },
  { key: 'toolEnabled', label: 'MCP Tool', value: true },
  { key: 'askFromPercent', label: 'Judge from', value: 40 },
  { key: 'toolThreshold', label: 'After N calls', value: 0 },
  { key: 'compactWhen', label: 'Your rules', value: '' },
  { key: 'rulesMode', label: 'Your rules, how', value: 'append' },
]

export type World = {
  /** What the judge answers. */
  verdict?: string
  /** Agents the gate will see. */
  agents?: { status: string }[]
  /** Share of the context window in use, as a percentage. */
  percent?: number
  /** The conversation `session.messages` answers with. */
  messages?: { role: string; content: string }[]
  /** Refuses the compaction, as another plugin's veto would. */
  skip?: string
  /** Settings values, as `config.list` reports them now. */
  settings?: Record<string, boolean | string | number>
  /** Makes the write throw, as a full disk would. */
  writeFails?: boolean
}

export type Seen = {
  clock: MockClock
  /** The instructions of each compaction that ran, in order. */
  compactions: string[]
  /** Every file written, in order. */
  written: { path: string; text: string }[]
  /** How many times the judge was asked. */
  asked: () => number
}

export function world(on: On, options: World = {}): Seen {
  const compactions: string[] = []
  const written: { path: string; text: string }[] = []
  let asked = 0

  // Every test gets a clock it controls: without one `clock.now` has no
  // implementation at all, and the mod reads the time on every decision.
  const clock = mock.clock(on, { now: Date.parse('2026-10-07T12:00:00Z') })
  // The archive reads $HOME to place its file; without this it throws and the
  // record is silently skipped.
  mock.env(on, { HOME: '/home/test' })

  // Versioned for real: `update` reads, writes with `ifVersion`, and retries when
  // the version moved. A store answering the same version forever looks to it like
  // somebody else writing on every try, and it gives up having written nothing.
  const state = new Map<string, { value: unknown; version: number }>()
  const at = (e: { plugin?: unknown; key?: unknown }) => `${String(e.plugin)}.${String(e.key)}`
  const blank = { value: undefined, version: 0 }

  // `turn.complete` and `session.compact` are engine events and answer with their
  // own result; every other line here is a noun call, which answers `{ value }`.
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.compact', (_$, e) => {
    if (options.skip !== undefined) return { skip: options.skip }
    compactions.push(String(e.instructions))
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })

  // Cast at the boundary, with only the fields the mod reads: a whole AgentInfo
  // or SessionMessage here would be noise no test ever looks at.
  on('agent.list', () => ({ value: (options.agents ?? []) as never }))
  on('session.id', () => ({ value: 'test-session' }))
  on('session.turns', () => ({ value: 1 }))
  on('session.messages', () => ({ value: (options.messages ?? []) as never }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 1000, window: 10_000, percent: options.percent ?? 50 },
      rateLimits: [],
    },
  }))
  on('model.fork', () => (asked++, { value: says(options.verdict ?? 'HOLD') }))
  on('fs.read', (_$, e) => ({ value: PROMPTS[String(e.path).split('/').pop() ?? ''] ?? '' }))
  on('fs.write', (_$: unknown, e) => {
    if (options.writeFails) throw new Error('disk full')
    written.push({ path: String(e.path), text: String(e.text) })
    return { value: undefined }
  })
  // The mod talks to the person on its way through; nothing beneath answers these.
  // The pane reads the settings rows and draws; both need a bottom even though
  // the plugin's own hooks answer first.
  on('ui.render', () => ({ type: 'Text' as const, props: {} }))
  on('config.list', () => ({
    value: ROWS.map(one => ({
      ...one,
      value: options.settings?.[one.key] ?? one.value,
      key: `cc-strategic-compaction.${one.key}`,
      kind: typeof one.value === 'boolean' ? ('boolean' as const) : ('string' as const),
      provider: { kind: 'plugin' as const, name: 'cc-strategic-compaction' },
      isLocked: false,
    })) as never,
  }))
  on('config.set', (_$, e) => (written.push({ path: String(e.key), text: String(e.value) }), { value: e.value }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))

  on('state.get', (_$, e) => ({ value: state.get(at(e)) ?? blank }))
  on('state.set', (_$, e) => {
    const held = state.get(at(e)) ?? blank
    const asksFor = (e as { ifVersion?: number }).ifVersion
    if (asksFor !== undefined && asksFor !== held.version) {
      return { value: { isSet: false as const, version: held.version } }
    }
    const version = held.version + 1
    state.set(at(e), { value: e.value, version })
    return { value: { isSet: true as const, version } }
  })

  return { clock, compactions, written, asked: () => asked }
}

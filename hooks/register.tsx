/**
 * Auto-compaction decided by judgement, not by counting.
 *
 * Two things decide. The judge: one question asked over the conversation itself by
 * `$.model.fork`, so it sees what happened and the API serves that prefix from its
 * cache. And the model, through the one tool registered here -- not the same question
 * twice, because the judge is asked cold while the model knows what it just wrote.
 * Nothing else can ask: no noun on `$`, no file to touch. A caller with neither is
 * meant to remind the model to call the tool.
 *
 * `$.session.compact()` rejects while a turn runs, so nothing compacts at the moment
 * it decides to: both paths ARM, and `turn.complete` fires. The judge is asked there,
 * and again when work that was in flight finishes while nobody is typing.
 *
 * The two numeric triggers are off by default, kept for whoever wants them.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { headerSvg, themeOf } from './header'
import { TOOL_INPUT } from '../prompts/tool'
import type { CompactionCounts } from '../types'

const PANE = 'compaction'
const COMMAND = 'compaction'
/** Registered as this; the model calls it by the full name in the matcher below. */
const TOOL = 'compact'

/** Counters the numeric triggers measure against. In `$.state` because a settings
 *  write reloads this module, and a reload would zero them. */
const counts = atom({ plugin: 'cc-strategic-compaction', key: 'counts' } as const, {
  tools: 0,
  toolsAtLast: 0,
})

/** The last answer the judge gave. In `$.state` so a reload does not forget it. */
const judgement = atom({ plugin: 'cc-strategic-compaction', key: 'judgement' } as const, null)

/** What has been compacted this session, newest first. Also where the floor below
 *  reads the last compaction from: as a module variable it survived no reload, and
 *  saving a setting reloads this module, which quietly reopened the floor. */
const history = atom({ plugin: 'cc-strategic-compaction', key: 'history' } as const, [])

/** What the judge has cost so far. */
const spend = atom({ plugin: 'cc-strategic-compaction', key: 'spend' } as const, {
  calls: 0,
  input: 0,
  output: 0,
  cached: 0,
})

/** What the model asked for mid-turn, from the tool: why, and what it says the
 *  summary must carry. Cleared by the `turn.complete` that acts on it. */
let armed: { reason: string; keep: string } | null = null
/** The re-check left running when a gate held the moment, or null when none is. */
let waiting: Timer | null = null

/**
 * Compactions closer together than this are refused, whatever asked for one.
 *
 * It has to be long, because right after a compaction the context is a summary and
 * a summary answers "does anything exist only here?" with no, by construction: the
 * judge would say READY again on the very next turn. `askFromPercent` is the better
 * brake, since the context has to climb back before anything is asked at all, but it
 * is 0 by default and then this is the only one there is.
 */
const FLOOR_MS = 900_000
/** How often the re-check asks whether the gate has cleared. */
const POLL_MS = 15_000
/** How long it keeps asking before letting the moment go. */
const PATIENCE_MS = 600_000
/** How many past compactions the pane can show before the oldest falls off. */
const HISTORY = 8
/** Under `$HOME`: where each compaction leaves the conversation it replaced. */
const ARCHIVE = '.cc-strategic-compaction/compactions'

type Limits = {
  judgeEnabled: boolean
  toolEnabled: boolean
  compactWhen: string
  rulesMode: string
  askFromPercent: number
  toolThreshold: number
  toolInterval: number
}

type Facts = CompactionCounts & {
  tokens: number | null
  window: number | null
  percent: number
}

/** Read fresh at the moment a decision is taken, never carried from an earlier one. */
async function factsFor($: EngineInterface): Promise<Facts> {
  const usage = await $.session.usage()
  const current = await read($, counts)
  return {
    ...current,
    tokens: usage.context?.tokens ?? null,
    window: usage.context?.window ?? null,
    percent: usage.context?.percent ?? 0,
  }
}

/** The rules the judge is given: the packaged ones, the person's, or both. */
/**
 * A prompt, from `prompts/*.md` beside the plugin.
 *
 * Markdown rather than a string literal so that changing what the judge is asked
 * is editing a document, not editing code. That is not taste: the only honest way
 * to tune this is to measure it, and a loop that recompiles to change a sentence
 * is a loop nobody runs. The cost is that a missing file fails at run time rather
 * than at build time.
 *
 * It lives here, and not in a module of its own, because the validator follows `$`
 * only into functions declared in the same file.
 *
 * Held for the life of the module, so a turn never pays for a read twice and a
 * hot reload picks up an edit.
 */
const held = new Map<string, string>()

async function prompt($: EngineInterface, name: string): Promise<string> {
  const have = held.get(name)
  if (have !== undefined) return have
  const text = (await $.fs.read(`${$.plugin.root}/prompts/${name}.md`)).trim()
  held.set(name, text)
  return text
}

async function rulesFor($: EngineInterface, limits: Limits): Promise<string> {
  const mine = limits.compactWhen.trim()
  // Override with nothing of your own reads no file at all: there are no rules.
  if (limits.rulesMode === 'override') return mine
  const packaged = await prompt($, 'rules')
  if (mine === '') return packaged
  return `${packaged}\n\nAlso, from the person working here, and these win where they disagree with the above:\n${mine}`
}

/**
 * The judge's answer, read strictly.
 *
 * Anything that is not plainly READY is a hold, a malformed answer included. The
 * asymmetry in the rules decides this: a wrong hold costs a turn, a wrong compaction
 * loses work nobody notices is gone, so the unparseable case takes the cheap side.
 */
export function judged(text: string): { isReady: boolean; line: string } {
  const lines = text.trim().split('\n').map(one => one.trim()).filter(one => one !== '')
  // The whole line, not a prefix: `/^READY\\b/` let "READY, I think" through, and
  // a hedged verdict is exactly the case the asymmetry says to refuse.
  const isReady = /^ready$/i.test(lines[0] ?? '')
  const named = lines.find(one => /^keep:/i.test(one))
  return { isReady, line: (named ?? '').replace(/^keep:\s*/i, '').trim() }
}

/** Token counts for a line with room for a number, not for six digits. */
function tokens(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
}

/** How long ago, for a line that needs the order of magnitude and nothing finer. */
function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`
}

function nextTools(facts: Facts, limits: Limits): number | null {
  if (limits.toolThreshold <= 0) return null
  return facts.toolsAtLast === 0 ? limits.toolThreshold : facts.toolsAtLast + limits.toolInterval
}

/**
 * What stops a compaction outright, whatever the rules would say.
 *
 * A veto belongs in code and not in the rules: wording in a prompt is advice the
 * judge weighs against other advice, while this cannot be argued with, and a gate
 * that holds is known before the call, so the call is never made and never billed.
 */
async function gated($: EngineInterface): Promise<string | null> {
  // A list that cannot be read holds, as an unparseable verdict does in `judged`
  // and as the rules say an honest "I cannot tell" should: not knowing whether
  // work is in flight is the same as knowing it might be.
  const agents = await $.agent.list().catch(() => null)
  if (agents === null) return 'the agent list could not be read'
  // A subagent still working is work in flight by definition, and its result has
  // not reached this conversation yet. Summarising now summarises a gap.
  const running = agents.filter(one => one.status === 'running').length
  return running === 0 ? null : `${running} subagent${running === 1 ? '' : 's'} still running`
}

/** When the last compaction ran, or 0 before the first one of the session. */
async function lastCompactAt($: EngineInterface): Promise<number> {
  return (await read($, history))[0]?.at ?? 0
}

/** Whether the tool-call trigger has come round, when it is on at all. */
function triggered(facts: Facts, limits: Limits): string | null {
  const tools = nextTools(facts, limits)
  if (tools !== null && facts.tools >= tools) return `${facts.tools} tool calls`
  return null
}

/**
 * Asks, and writes the answer down either way: a mod that never asks and one that
 * keeps deciding not to compact look identical from outside, and the recorded hold
 * is the only thing that tells them apart. Answers READY's brief, or null.
 */
async function judge($: EngineInterface, rules: string, at: number): Promise<string | null> {
  const asked = await $.model.fork({
    prompt: (await prompt($, 'judge')).replace('{{rules}}', rules),
  })
  if ('usage' in asked) {
    const used = asked.usage
    await update($, spend, s => ({
      calls: s.calls + 1,
      input: s.input + used.input_tokens + used.cache_creation_input_tokens,
      output: s.output + used.output_tokens,
      cached: s.cached + used.cache_read_input_tokens,
    }))
  }
  if (!asked.isAnswered) {
    $.ui.log(`compaction could not judge: ${asked.reason}`, { to: 'debug' })
    return null
  }
  const verdict = judged(asked.text)
  await update($, judgement, was => ({
    at,
    ...verdict,
    holds: verdict.isReady ? 0 : (was?.holds ?? 0) + 1,
  }))
  return verdict.isReady ? verdict.line : null
}

/**
 * Writes the conversation a compaction replaced, under `$HOME`.
 *
 * Not a backup: the session's own transcript keeps every message through a
 * compaction, so nothing here is at risk of being lost today. What this adds is
 * the boundary -- what was in context at the moment one ran, addressable without
 * reading the whole session log to find where it fell -- and a copy that outlives
 * `cleanupPeriodDays`, which sweeps transcripts after thirty days.
 *
 * Each file holds the messages since the one before it, so the set reconstructs
 * the conversation without any file repeating another.
 */
async function archive($: EngineInterface, messages: readonly unknown[], at: number): Promise<void> {
  const home = await $.env.get('HOME')
  if (home === undefined) return
  const id = await $.session.id()
  const stamp = new Date(at).toISOString().replace(/[:.]/g, '-')
  const body = messages.map(one => JSON.stringify(one)).join('\n')
  await $.fs.write(`${home}/${ARCHIVE}/${id}/${stamp}.jsonl`, body)
}

/** `brief` is what the asker said the summary must carry, empty when none did. */
async function compact(
  $: EngineInterface,
  facts: Facts,
  reason: string,
  brief: string,
  now: number,
): Promise<void> {
  const since = now - (await lastCompactAt($))
  if (since < FLOOR_MS) {
    $.ui.log(
      `compaction held off (${reason}): the last one was ${Math.round(since / 60_000)}m ago`,
      { to: 'debug' },
    )
    return
  }
  // Read before, written after: once `compact` returns, these messages are no
  // longer the conversation, and a veto must leave no file behind for a
  // compaction that never happened.
  const replaced = await $.session.messages({ as: 'api' })
  const also = brief === '' ? '' : ` Above all keep this, which the next turns need: ${brief}`
  const { skip } = await $.session.compact({
    instructions: (await prompt($, 'summary')).replace('{{brief}}', also),
  })
  if (skip) {
    $.ui.log(`compaction vetoed: ${skip}`, { to: 'debug' })
    return
  }
  await archive($, replaced, now).catch(one => {
    // A record that cannot be written is not a reason to undo a compaction that
    // already ran.
    $.ui.log(`compaction archived nothing: ${String(one)}`, { to: 'debug' })
  })
  await update($, history, past => [{ at: now, reason }, ...past].slice(0, HISTORY))
  await update($, counts, c => ({ ...c, toolsAtLast: c.tools }))
  $.ui.toast(`Compacted: ${reason}`)
}

/**
 * Keeps a held moment alive instead of dropping it.
 *
 * The work a gate waits on usually finishes while nobody is typing, and that idle
 * window is the cheapest moment there is to compact: no turn running, nothing in
 * flight to summarise into a gap, nobody waiting on the answer. Dropping the moment
 * spends the window for nothing and decides at the next message instead, on top of
 * whatever has piled up since.
 *
 * Polling costs nothing by construction: a turn count and a list of agents, and no
 * model call until there is a decision to make.
 */
function waitForGate(
  $: EngineInterface,
  limits: Limits,
  turns: number,
  now: number,
  asked: { reason: string; keep: string } | null,
): void {
  waiting?.cancel()
  const until = now + PATIENCE_MS
  let timer: Timer | null = null
  const stop = () => {
    timer?.cancel()
    if (waiting === timer) waiting = null
  }
  timer = $.clock.every(POLL_MS, async () => {
    try {
      const at = await $.clock.now()
      if (at > until) {
        stop()
        $.ui.log('compaction stopped waiting: the work in flight is still running', { to: 'debug' })
        return
      }
      // The person has spoken. The end of that turn decides the moment with what
      // they just said in view, which is a better-informed decision than this one.
      if ((await $.session.turns()) !== turns) return stop()
      if ((await gated($)) !== null) return
      stop()
      // A request the gate held is honoured, not re-judged: the gate said nothing
      // about whether the request was right.
      if (asked !== null) {
        await compact($, await factsFor($), asked.reason, asked.keep, at)
        return
      }
      const brief = await judge($, await rulesFor($, limits), at)
      if (brief === null) return
      const why = 'the work in flight finished and nothing here is unwritten'
      await compact($, await factsFor($), why, brief, at)
    } catch {
      // The dispatch this was armed from is long gone; a `$` that stops answering
      // is the session having moved on, not a fault worth a line in the log.
      stop()
    }
  })
  waiting = timer
}

export const register: Register = (on, options) => {
  const limits: Limits = {
    // Both default on, so an absent option reads as true rather than as off.
    judgeEnabled: options?.judgeEnabled !== false,
    toolEnabled: options?.toolEnabled !== false,
    compactWhen: String(options?.compactWhen ?? ''),
    rulesMode: String(options?.rulesMode ?? 'append'),
    askFromPercent: Number(options?.askFromPercent ?? 0),
    toolThreshold: Number(options?.toolThreshold ?? 0),
    toolInterval: Number(options?.toolInterval ?? 25),
  }

  on('session.start', async ($, e, next) => {
    // Registering throws on a name the engine already owns, and a hook that throws is
    // skipped whole, so anything after it would never run and say nothing about why.
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Open the compaction pane: the rules, and what they would do now',
      })
      if (limits.toolEnabled) {
        await $.tool.register({
          name: TOOL,
          description: await prompt($, 'tool'),
          inputSchema: TOOL_INPUT,
        })
      }
    } catch (error) {
      $.ui.log(`compaction could not register its command and tool: ${String(error)}`)
    }
    return next(e)
  })

  /**
   * The model arming a compaction on itself, which a shell hook or another session
   * reaches by reminding it to call this rather than by signalling the mod directly.
   *
   * It is not the judge's question asked twice: the judge is asked cold, while the
   * caller here knows it has just written the file. Different information, not a
   * second opinion.
   */
  on('tool.call', { tool: 'mcp__cc-strategic-compaction__compact' }, async ($, e) => {
    if (!limits.toolEnabled) return { deny: 'the compact tool is switched off' }
    // Both refusals carry their reason: the caller is a model, and a tool that
    // answers nothing teaches it nothing about when to call again.
    const since = (await $.clock.now()) - (await lastCompactAt($))
    if (since < FLOOR_MS) {
      return {
        result: `Not armed: the last compaction was ${Math.round(since / 60_000)}m ago, under the ${FLOOR_MS / 60_000}m floor between them.`,
      }
    }
    const hold = await gated($)
    if (hold !== null) {
      return {
        result:
          `Not armed: ${hold}. Their results have not reached this conversation, so ` +
          `a summary written now would summarise a gap. Call again once they have ` +
          `finished and you have read what they returned.`,
      }
    }
    const reason = e.reason.trim()
    armed = armed ?? {
      reason: reason === '' ? 'the agent asked' : reason,
      keep: e.keep?.trim() ?? '',
    }
    return { result: 'Armed. This conversation compacts when the turn ends.' }
  })

  on('command.run', { command: COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: 'Auto-compact' })
    return {}
  })

  // No `.catch`: a failed hook is absent from the chain, and a counter that cannot
  // be written is no reason to stop a tool call. Counted even while the trigger is
  // off, so turning it on mid-session does not start from a pretended zero.
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) await update($, counts, c => ({ ...c, tools: c.tools + 1 }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    // Every hook sees subagents' turns too, and `agentId` is absent only on the main
    // loop. Without this a review that spawns twenty subagents would try to compact
    // twenty times, each while the main turn still runs, which is when compact()
    // rejects.
    if (e.agentId !== undefined) return result
    // An interrupted turn is the person taking over. Summarising on top of that takes
    // the conversation further from what they were about to do.
    if (e.reason !== 'answer') return result

    // A turn has ended, so whatever a held moment was waiting for is decided here
    // instead, with this turn's own result in view.
    waiting?.cancel()
    waiting = null

    const signal = armed
    armed = null

    const facts = await factsFor($)
    const now = await $.clock.now()
    const rules = await rulesFor($, limits)
    // `askFromPercent` holds back the judge's call, not a request already made.
    const asking =
      limits.judgeEnabled && rules.trim() !== '' && facts.percent >= limits.askFromPercent
    const fired = triggered(facts, limits)
    const decided = signal ?? (fired === null ? null : { reason: fired, keep: '' })

    if (decided === null && !asking) return result

    // Ahead of both, and of the model call either would make. Work in flight is in
    // flight whoever asked, so the tool does not get past this one either.
    const hold = await gated($)
    if (hold !== null) {
      $.ui.log(`compaction held: ${hold}`, { to: 'debug' })
      waitForGate($, limits, await $.session.turns(), now, decided)
      return result
    }

    if (decided !== null) {
      await compact($, facts, decided.reason, decided.keep, now)
      return result
    }
    // The judge read the conversation to decide, so it is the best-placed thing in
    // the session to say what the summary must carry. One call, both jobs.
    const named = await judge($, rules, now)
    if (named !== null) {
      await compact($, facts, 'nothing here exists only in this conversation', named, now)
    }
    return result
  })

  // What the editor posts when you press ctrl+s. Data from code, so it is checked
  // rather than trusted: the event's own doc says so.
  on('ui.message', { element: 'rules' }, async ($, e, next) => {
    const data = e.data as { kind?: unknown; text?: unknown } | null
    if (!data || data.kind !== 'save' || typeof data.text !== 'string') return next(e)
    const row = (await $.config.list()).find(one => one.key.endsWith('compactWhen'))
    if (!row) {
      $.ui.toast('compactWhen is not a settings row here')
      return next(e)
    }
    const { deny } = await $.config.set({ key: row.key, value: data.text })
    // The write reloads this module with the new options, which is what makes the
    // saved rules take effect. Hand the instance its new baseline either way, so a
    // refused save does not keep showing as unsaved.
    $.ui.toast(deny ? `Refused: ${deny}` : 'Rules saved')
    return { props: { text: data.text, saved: deny ? '' : data.text } }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // No surface has every element: mobile draws no field, vscode no Client, the
    // terminal no Svg. Asking the table rather than assuming is what keeps the pane
    // from drawing an element the surface cannot make.
    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Button = 'Button' in table ? table.Button : null
    const Input = 'Input' in table ? table.Input : null
    const Select = 'Select' in table ? table.Select : null
    const Client = 'Client' in table ? table.Client : null
    const Svg = 'Svg' in table ? table.Svg : null

    const rows = await $.config.list()
    const facts = await factsFor($)
    const last = await read($, judgement)
    const past = await read($, history)
    const spent = await read($, spend)
    const now = await $.clock.now()
    const mine = limits.compactWhen
    const hasRules = (await rulesFor($, limits)).trim() !== ''
    const judging = hasRules && facts.percent >= limits.askFromPercent
    const toolsNext = nextTools(facts, limits)

    /** The one-line state of play. Only a fault earns colour. */
    const headline = !judging && !limits.toolEnabled
      ? { text: 'Nothing can compact: judge and tool are both off', bad: true }
      : !judging
        ? { text: 'Only when the agent asks, through its tool', bad: !limits.toolEnabled }
        : !limits.judgeEnabled
          ? { text: 'Judge off', bad: true }
          : !hasRules
            ? { text: 'No rules, so the judge will never say yes', bad: true }
            : facts.percent < limits.askFromPercent
              ? { text: `Nothing judged below ${limits.askFromPercent}% of the window`, bad: true }
              : limits.toolEnabled
                ? { text: 'Judged every turn, and the agent can ask', bad: false }
                : { text: 'Judged every turn', bad: false }

    // A window with no token count yet says nothing worth a line of its own.
    const size =
      facts.tokens === null || facts.window === null
        ? null
        : `${tokens(facts.tokens)} of ${tokens(facts.window)}`

    // The only line here that reports rather than configures, and the one that
    // tells a mod which never asks from one which keeps deciding not to. A wait in
    // progress displaces it, being the newer of the two facts.
    const verdict = waiting !== null
      ? { label: 'Waiting', detail: 'for the work in flight to finish' }
      : last === null
        ? { label: 'Not judged yet', detail: judging ? 'the first turn to end will' : '' }
        : last.isReady
          ? { label: 'Ready', detail: ago(last.at, now) }
          : {
              label: 'Holding',
              detail:
                last.holds > 1
                  ? `${last.holds} turns in a row · ${ago(last.at, now)}`
                  : ago(last.at, now),
            }

    // `most` because a percentage has a ceiling and a token count has none; without
    // one, a stray 280 here saves clean and switches the mod off until someone reads
    // the headline closely enough to notice why.
    // The share is the number that matters: the judge is affordable only while the
    // main thread's cache is serving the prefix it forks.
    const billed = spent.input + spent.cached
    const share = billed === 0 ? '' : ` · ${Math.round((spent.cached * 100) / billed)}% from cache`
    const cost =
      spent.calls === 0
        ? 'not called yet'
        : `${spent.calls} ${spent.calls === 1 ? 'call' : 'calls'} · ` +
          `${tokens(spent.input)} in · ${tokens(spent.output)} out${share}`

    // A Button rather than a Select: it is on every surface, and a two-state
    // control that needs a menu to change is a menu, not a switch.
    const toggle = (key: string, label: string, fallback: boolean, hint: string) => {
      const owned = rows.find(one => one.key.endsWith(key))
      // The live value, not `limits`: those were read when the module loaded, and
      // the press that changes one is drawn before the reload that renews them, so
      // a switch drawn from `limits` shows the old state and looks broken.
      const isOn = typeof owned?.value === 'boolean' ? owned.value : fallback
      return (
        <Box key={key} flexDirection="row" gap={1}>
          {/* Bold because it heads a section now; the fields under it stay dim. */}
          <Box width={13}>
            <Text bold>{label}</Text>
          </Box>
          {Button ? (
            <Button
              key={key}
              label={isOn ? ' on ' : ' off'}
              onPress={async () => {
                if (!owned) return
                const { deny } = await $.config.set({ key: owned.key, value: !isOn })
                $.ui.toast(deny ? `Refused: ${deny}` : `${label} ${isOn ? 'off' : 'on'}`)
              }}
            />
          ) : (
            <Text>{isOn ? 'on' : 'off'}</Text>
          )}
          <Text dimColor>{hint}</Text>
        </Box>
      )
    }

    const number = (key: string, label: string, hint: string, value: number, most?: number) => {
      const owned = rows.find(one => one.key.endsWith(key))
      const bad = (n: number) => !Number.isFinite(n) || n < 0 || (most !== undefined && n > most)
      return (
        <Box key={key} flexDirection="row" gap={1}>
          <Box width={13}>
            <Text dimColor>{label}</Text>
          </Box>
          {Input ? (
            <Input
              key={key}
              value={String(value)}
              placeholder={hint}
              submitLabel="set"
              onSubmit={async (text: string) => {
                const n = Number(text)
                if (!owned || bad(n)) {
                  const range = most === undefined ? 'a number from 0' : `0 to ${most}`
                  $.ui.toast(`${label}: ${text} is not ${range}`)
                  return
                }
                const { deny } = await $.config.set({ key: owned.key, value: n })
                $.ui.toast(deny ? `Refused: ${deny}` : `${label} saved`)
              }}
            />
          ) : (
            <Text>{String(value)}</Text>
          )}
          <Text dimColor>{hint}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {Svg ? (
          <Svg
            source={headerSvg(
              {
                tone: headline.bad ? 'warning' : 'good',
                state: headline.text,
                mode: limits.rulesMode === 'override' ? 'your rules only' : 'packaged + yours',
                tokens: facts.tokens,
                window: facts.window,
              },
              themeOf(rows.find(one => one.key === 'theme')?.value),
            )}
            alt={`${headline.text}. ${size ?? 'Context not measured yet'}.`}
            width={420}
            height={74}
          />
        ) : (
          <Box flexDirection="row" gap={1}>
            <Text color={headline.bad ? 'yellow' : undefined} dimColor={!headline.bad}>
              {headline.text}
            </Text>
            {size && <Text dimColor>· context {size}</Text>}
          </Box>
        )}

        <Box flexDirection="row" gap={1}>
          <Text>{verdict.label}</Text>
          {/* Truncated because the word limit in the prompt is a request, not a
              guarantee, and one long answer would push the row off the pane. */}
          {verdict.detail !== '' && (
            <Text dimColor wrap="truncate-end">
              {verdict.detail}
            </Text>
          )}
        </Box>

        <Box flexDirection="row" gap={1}>
          <Text bold>Judge</Text>
          <Text dimColor>{cost}</Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Compacted</Text>
          {past.length === 0 ? (
            <Text dimColor>nothing this session</Text>
          ) : (
            past.map(one => (
              <Box flexDirection="row" gap={1}>
                <Box width={9}>
                  <Text dimColor>{ago(one.at, now)}</Text>
                </Box>
                <Text wrap="truncate-end">{one.reason}</Text>
              </Box>
            ))
          )}
        </Box>

        {/* Each switch is its own section heading, and what it governs is
            indented under it and gone when it is off: a field that cannot act is
            worse than absent, because it reads as if it could. */}
        <Box flexDirection="column" gap={1}>
          {toggle('judgeEnabled', 'Judge', limits.judgeEnabled, 'asks at the end of every turn')}
          {limits.judgeEnabled && (
            <Box flexDirection="column" gap={1} paddingLeft={2}>
              {number('askFromPercent', 'Judge from', '% of the window, 0 judges always', limits.askFromPercent, 100)}
              <Box flexDirection="column" gap={1}>
                <Box flexDirection="row" gap={1}>
                  <Text bold>Rules</Text>
                  {Select ? (
                    <Select
                      key="mode"
                      value={limits.rulesMode}
                      options={[
                        { value: 'append', label: 'added to the packaged ones' },
                        { value: 'override', label: 'instead of the packaged ones' },
                      ]}
                      onSelect={async (value: string) => {
                        const owned = rows.find(one => one.key.endsWith('rulesMode'))
                        if (!owned) return
                        const { deny } = await $.config.set({ key: owned.key, value })
                        $.ui.toast(deny ? `Refused: ${deny}` : `Rules are now ${value}`)
                      }}
                    />
                  ) : (
                    <Text dimColor>{limits.rulesMode}</Text>
                  )}
                </Box>
                {/* Framed, so an empty editor reads as a field and not as a
                    drawing fault. Sized to the text with a floor and a ceiling,
                    because a fixed height left a hole under one line. */}
                <Box borderStyle="round" borderDimColor paddingX={1}>
                  {Client ? (
                    <Client
                      key="rules"
                      module="./editor.tsx"
                      props={{
                        text: mine,
                        saved: mine,
                        placeholder: 'when to compact, in your words',
                      }}
                      height={Math.min(14, Math.max(4, mine.split('\n').length + 2))}
                      width="100%"
                    />
                  ) : (
                    <Text dimColor>{mine === '' ? 'no rules of your own yet' : mine}</Text>
                  )}
                </Box>
              </Box>
            </Box>
          )}

          {toggle('toolEnabled', 'MCP Tool', limits.toolEnabled, 'the agent can ask for a compaction')}

          {/* Neither switch governs this one: it counts every tool the main loop
              runs, so it sits beside them rather than under either. */}
          {number('toolThreshold', 'After N calls', toolsNext === null ? 'tool calls, 0 is off' : `next at ${toolsNext}, now ${facts.tools}`, limits.toolThreshold)}
        </Box>
      </Box>
    )
  })
}

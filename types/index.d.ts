/**
 * The tool `cc-strategic-compaction` registers, and the values its pane draws from.
 *
 * It adds no noun to `$`. The one way in is the tool below, so that a compaction is
 * always something the model asked for in its own turn, where it knows what it has
 * just written down.
 *
 * Self-contained on purpose: no import, no reference. A plugin that reads this never
 * copies the file; `/plugin-types` rolls every enabled plugin's contract into
 * `.claude/types`.
 */

/** The counters the numeric triggers are measured against. */
export type CompactionCounts = {
  /** Tool calls on the main loop this session. */
  tools: number
  /** Tool count as it stood at the last compaction; 0 before the first. */
  toolsAtLast: number
}

/**
 * What the judge's forks have cost, summed over the session. Tokens and not money:
 * the engine reports no price, and a table of them here would go stale unseen.
 */
export type CompactionSpend = {
  /** Forks made, the failed ones counted: those are billed too. */
  calls: number
  /** Input tokens billed at full rate or more: uncached, plus cache writes. */
  input: number
  output: number
  /**
   * Input tokens the prompt cache served, billed at a fraction.
   *
   * Worth watching rather than merely recording: the judge is affordable only
   * because it forks a prefix the main thread already paid to cache. Near zero and
   * every call is buying the whole transcript again.
   */
  cached: number
}

/** One compaction that ran. The list holds them newest first. */
export type CompactionRecord = {
  /** Epoch milliseconds. */
  at: number
  /** Why it ran: the judge's conclusion, the model's own words, or a trigger. */
  reason: string
}

/** The last answer the judge gave, kept so the pane can show why it stands. */
export type CompactionJudgement = {
  /** Epoch milliseconds. */
  at: number
  /** Whether that answer let a compaction through. */
  isReady: boolean
  /** What it named: the thing that would be lost, or what the summary must keep. */
  line: string
}

/**
 * What the model passes when it arms a compaction on itself. Declaring it here is
 * what adds the name to the engine's tool union, so a `tool.call` matcher narrows
 * on it and the hook reads the arguments typed.
 */
export type CompactionToolInput = {
  /** Why now, in a few words. */
  reason: string
  /** What the summary must carry forward for the work to continue. */
  keep?: string
}

declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__cc-strategic-compaction__compact': CompactionToolInput
  }
  interface PluginState {
    'cc-strategic-compaction': {
      counts: CompactionCounts
      judgement: CompactionJudgement | null
      history: CompactionRecord[]
      spend: CompactionSpend
    }
  }
}

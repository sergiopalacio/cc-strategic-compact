# Claude Strategic Compaction Mod

Claude decides when to compact, and compacts. Every other plugin for this only suggests
and leaves you to type `/compact`.

```bash
claude plugin marketplace add sergiopalacio/cc-strategic-compaction
```
```bash
claude plugin install cc-strategic-compaction@cc-strategic-compaction --config askFromPercent=40
```

`/compaction` opens the pane. Set `askFromPercent` before anything else: at its default
of 0 the judge runs every turn from the first, spending a model call to answer a question
whose answer is obviously no.

## When it fires

Not when the task is finished, and not when the window is full. Claude already watches
the window.

The question is whether anything in the conversation exists **only** here. A measurement
taken and never written down is lost on compaction. A file on disk is not, because it can
be read again.

Two things can ask, and each has its own switch in the pane:

- **Judge** — at the end of a turn, from the rules in `hooks/rules.ts` plus your own.
- **MCP Tool** — `mcp__cc-strategic-compaction__compact`, which the model calls on itself
  after writing something down.

Nothing else can: no noun on `$`, no file to touch. A shell hook reaches this by
reminding the model to call the tool. Turn the judge off and the agent's own instructions
are the only thing deciding; turn the tool off and only the rules are.

A subagent still running blocks both. There is a 15 minute floor between compactions.

## Settings

| key | default | what it does |
| --- | --- | --- |
| `judgeEnabled` | `true` | ask the judge at the end of each turn |
| `toolEnabled` | `true` | register the tool the agent calls on itself |
| `askFromPercent` | `0` | percent of the window below which nothing is judged |
| `compactWhen` | `""` | your rules, in your own words |
| `rulesMode` | `append` | `append` adds yours to the packaged rules, `override` replaces them |
| `toolThreshold` | `0` | compact after N tool calls of any kind. Unrelated to `toolEnabled`. 0 is off, and worth leaving off |
| `toolInterval` | `25` | further calls between those compactions |

Switching `toolEnabled` off mid-session cannot unregister the tool, so a call is refused
instead until the next session.

## Development

```bash
claude plugin validate .
```
```bash
claude plugin update cc-strategic-compaction
```

To work on it, clone the repo and point a marketplace at the clone
(`claude plugin marketplace add .`) rather than at this one. The installed plugin is a
copy in the cache, so editing the folder changes nothing until `plugin update` runs, and
`update` compares versions rather than content: bump `version` in `plugin.json` or it
will tell you it is already current. Then `/reload-plugins`.

```bash
claude plugin test .
```

`test` finds nothing today. Worth covering first: `judged()`, where the hold/ready
asymmetry lives; the pane mounted on all four surfaces; and `waitForGate` against
`mock.clock`.

Why it decides the way it does is in the code, near the thing it explains.

You are writing a handoff: everything the next session needs to pick this work up
without you.

A compaction summary and a handoff are not the same document. The summary serves
this conversation continuing, and the model that reads it has just lived through
what it describes. A handoff is read cold, by a session that was not here. So it
carries the things the summary can take for granted: where the files are, what was
tried and abandoned, what the person corrected you on, and what you would warn
your replacement about.

Write it to `~/.cc-strategic-compaction/{{session}}/handoffs/{{stamp}}.md`.

Use this structure:

```markdown
---
date: [ISO 8601, with the timezone]
branch: [current branch]
commit: [current commit hash]
repository: [repository name]
topic: "[what this work is]"
---

# Handoff: {one line, concrete}

## Task
What you were doing and how far it got: done, in progress, or agreed and not
started. If you were working through a plan, say which step you are on and where
the plan lives.

## Recent changes
What you changed, as `path/to/file.ts:line` references rather than code blocks.

## Learnings
What the next session would otherwise have to find out the hard way: the cause of
a bug, a pattern the codebase follows, a constraint that is not written anywhere.
Name files and lines.

## Artifacts
Every file worth reading to resume, as paths. Plans, notes, specs.

## Next steps
What to do next, in order.

## Other notes
Anything that does not fit above and would still be missed.
```

Rules for writing it:

- **More, not less.** The structure above is a floor. A handoff that is too long
  costs a read; one that is too short costs the work it omitted.
- **Reference, do not quote.** `packages/api/src/auth.ts:42-58` rather than the
  lines themselves. The next session can open the file; it cannot recover what you
  left out.
- **Except where the exact text is the point.** An error as it was printed, a
  command's output, a measurement: those cannot be looked up again, so paste them.
- **Say what was abandoned and why.** The most expensive thing a fresh session
  does is retry an approach that was already ruled out here.

When the file is written, tell the person where it is and nothing else.

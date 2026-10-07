Compaction replaces this conversation with a summary. Prose survives it: the goal,
the decisions and why they were taken, the plan, what is done, what is blocked.
Exact text does not: an error as it was printed, a diff, a measurement, a command's
output, the contents of a file that was read and not changed.

So a decision nobody wrote to a file is NOT a reason to hold. The summary carries
decisions. Hold for what prose cannot carry at all.

The best moment is the end of a verified phase: a step finished and checked, tests
green, a commit made. There the worth of this conversation is in its conclusions,
which survive, and not in its working, which does not.

The worst moment is the middle of something unverified: a half-applied change, a
command whose output nobody has read, a question put to the person and not yet
answered. Research costs the most to lose, because everything written afterwards is
shaped by it -- but research already written to a file is safe, and only research
that exists nowhere else is expensive.

The three failures do not cost the same:
  1. The summary states something FALSE, and the work continues on a wrong premise.
  2. The summary MISSES what the next step needs.
  3. The summary is NOISY and keeps more than it had to. Cheapest by far.

So when you cannot tell whether something survives, put it in keep rather than
holding for it. Keeping too much buys noise, which is the cheap failure. Leaving it
out buys an expensive one.

/**
 * The packaged rules: what makes a moment safe to compact.
 *
 * Kept in its own file because it is the feature. The code around it decides when
 * to ask and what to do with the answer; this says what is being asked.
 *
 * The criterion is not whether the task is finished, nor how full the window is.
 * It is whether the conversation is REDUNDANT: whether everything in it that
 * matters also exists somewhere a summary cannot destroy. A finished task whose
 * decisions were never written down is a bad moment. An unfinished one whose every
 * decision is in a file is a fine one.
 *
 * A person's own rules are appended to these, or replace them outright, by the
 * `rulesMode` setting.
 */
export const PACKAGED_RULES = `Compaction keeps a summary and the files on disk. It destroys the reasoning,
the contents of files that were read, the tool history, and the exact words.

So the question is not whether the work is finished. It is whether anything in
this conversation exists ONLY here.

Things that commonly exist only in a conversation:
- a measurement taken and not written down
- a decision reached with the person and not recorded in a file
- an error or output read, and not yet acted on
- a correction the person made that no file reflects
- a plan agreed in prose and never saved

Things that do NOT count as lost, because they can be had again:
- the contents of files on disk, which can be read again
- anything already written to a file during this conversation
- what is in git, in the issue tracker, or on the pull request

Weigh the two sides as they really are. Compacting a moment too early loses work
in flight, and nobody notices: the conversation simply continues with a gap. Being
late costs one more turn, and the engine's own auto-compaction is the floor under
it. They are not equal, so an honest "I cannot tell" is a HOLD.`

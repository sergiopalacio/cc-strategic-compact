/**
 * The tool's arguments. Code, not prose: a JSON schema has no business being a
 * markdown file, so only the description beside it moved to `tool.md`.
 */
export const TOOL_INPUT = {
  type: 'object',
  properties: {
    reason: { type: 'string', description: 'Why now, in a few words.' },
    keep: {
      type: 'string',
      description: 'What the summary must carry forward for the work to continue.',
    },
  },
  required: ['reason'],
}

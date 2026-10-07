/**
 * A multi-line text editor, because the engine has no textarea.
 *
 * `Input` is one line and submits on Enter, which is the wrong control for a set of
 * rules written in paragraphs. A `Client` draws with the same elements as the host
 * tree, so nothing here is HTML, but it owns two things the host does not: the raw
 * keyboard while focused, and local state that survives the host's redraws. Those
 * are exactly what a text buffer needs.
 *
 * Click the region to type in it. Escape hands the keyboard back and never reaches
 * `onKey`, so there is no way to trap a person inside the editor.
 */
import type { ClientModule, ClientKeyEvent } from 'claude-code'

type Props = { text: string; saved: string; placeholder: string }
type State = {
  lines: string[]
  /** The caret, as a line index and a column within that line. */
  row: number
  col: number
  /** The first line drawn, so a buffer taller than the region scrolls. */
  top: number
}

function start(text: string): State {
  const lines = text.split('\n')
  return { lines, row: lines.length - 1, col: (lines.at(-1) ?? '').length, top: 0 }
}

/** The state after one key. Returns null for a key this editor does not handle. */
function typed(state: State, key: ClientKeyEvent): State | null {
  const { lines, row, col } = state
  const line = lines[row] ?? ''
  const at = (r: number, text: string) => lines.map((l, i) => (i === r ? text : l))

  if (key.ctrl || key.meta) return null // a modified key is never text; onKey takes ctrl+s

  switch (key.key) {
    case 'left':
      if (col > 0) return { ...state, col: col - 1 }
      if (row > 0) return { ...state, row: row - 1, col: (lines[row - 1] ?? '').length }
      return state
    case 'right':
      if (col < line.length) return { ...state, col: col + 1 }
      if (row < lines.length - 1) return { ...state, row: row + 1, col: 0 }
      return state
    case 'up':
      if (row === 0) return { ...state, col: 0 }
      return { ...state, row: row - 1, col: Math.min(col, (lines[row - 1] ?? '').length) }
    case 'down':
      if (row === lines.length - 1) return { ...state, col: line.length }
      return { ...state, row: row + 1, col: Math.min(col, (lines[row + 1] ?? '').length) }
    case 'home':
      return { ...state, col: 0 }
    case 'end':
      return { ...state, col: line.length }
    case 'return': {
      // Enter inserts a line here. It does not submit: that is the whole point of
      // not using an Input.
      const before = line.slice(0, col)
      const after = line.slice(col)
      const next = [...lines.slice(0, row), before, after, ...lines.slice(row + 1)]
      return { ...state, lines: next, row: row + 1, col: 0 }
    }
    case 'backspace': {
      if (col > 0) {
        return { ...state, lines: at(row, line.slice(0, col - 1) + line.slice(col)), col: col - 1 }
      }
      if (row === 0) return state
      const previous = lines[row - 1] ?? ''
      const next = [...lines.slice(0, row - 1), previous + line, ...lines.slice(row + 1)]
      return { ...state, lines: next, row: row - 1, col: previous.length }
    }
    case 'delete': {
      if (col < line.length) {
        return { ...state, lines: at(row, line.slice(0, col) + line.slice(col + 1)) }
      }
      if (row === lines.length - 1) return state
      const next = [...lines.slice(0, row), line + (lines[row + 1] ?? ''), ...lines.slice(row + 2)]
      return { ...state, lines: next }
    }
    case 'tab':
      return { ...state, lines: at(row, line.slice(0, col) + '  ' + line.slice(col)), col: col + 2 }
    default:
      // One printable character. Anything longer is a named key this editor
      // does not handle, and letting it through would write "pagedown" into
      // the buffer.
      if (key.key.length !== 1) return null
      return { ...state, lines: at(row, line.slice(0, col) + key.key + line.slice(col)), col: col + 1 }
  }
}

/** Scroll so the caret is inside the visible window. */
function scrolled(state: State, rows: number): State {
  const room = Math.max(1, rows)
  if (state.row < state.top) return { ...state, top: state.row }
  if (state.row >= state.top + room) return { ...state, top: state.row - room + 1 }
  return state
}

export const Editor: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? start(props.text)

  // Set once, while there is no state yet: a listener set on every call would
  // replace itself each frame for nothing.
  if (surface.state === undefined) {
    surface.onKey(key => {
      const current = surface.state ?? start(props.text)
      if ((key.ctrl || key.meta) && key.key === 's') {
        surface.post({ kind: 'save', text: current.lines.join('\n') })
        return
      }
      const next = typed(current, key)
      if (next !== null) surface.setState(scrolled(next, surface.rows - 1))
    })
  }

  const text = state.lines.join('\n')
  const isDirty = text !== props.saved
  const isEmpty = text === ''
  const room = Math.max(1, surface.rows - 1)
  const visible = state.lines.slice(state.top, state.top + room)
  const lines = state.lines.length
  const count = `${lines} ${lines === 1 ? 'line' : 'lines'}`

  // Nothing written yet: say what to write rather than show one blank row that
  // reads as a drawing fault.
  const body = isEmpty
    ? [
        Box({
          flexDirection: 'row',
          children: [
            Text({ inverse: true, children: [' '] }),
            Text({ dimColor: true, children: [props.placeholder] }),
          ],
        }),
      ]
    : visible.map((line, i) => {
        const index = state.top + i
        if (index !== state.row) {
          return Text({ children: [line === '' ? ' ' : line], wrap: 'truncate-end' })
        }
        // The caret line, in three pieces so the cell under the caret can be
        // inverted. An inverted space is the caret; inverting a block character
        // too drew a stray mark that read as a glitch.
        const before = line.slice(0, state.col)
        const on = line.slice(state.col, state.col + 1) || ' '
        const after = line.slice(state.col + 1)
        return Box({
          flexDirection: 'row',
          children: [
            Text({ children: [before] }),
            Text({ inverse: true, children: [on] }),
            Text({ children: [after] }),
          ],
        })
      })

  return Box({
    flexDirection: 'column',
    children: [
      ...body,
      Text({
        dimColor: !isDirty,
        color: isDirty ? 'yellow' : undefined,
        children: [isDirty ? `${count} · unsaved · ctrl+s` : `${count} · click to type`],
      }),
    ],
  })
}

export default Editor

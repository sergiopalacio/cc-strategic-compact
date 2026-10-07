/**
 * The pane's status header, drawn as SVG on the desktop surface.
 *
 * `Svg` is a desktop element and a leaf: it draws, it takes no input. So this is
 * the display half only, and every control stays an element below it.
 *
 * Colours are the dataviz skill's status palette and ink tokens, not picked by eye.
 * Status never carries meaning by colour alone, so the dot always has its label:
 * `warning` measures 1.79 against a light surface, below the 3:1 bar, and the
 * pairing is what makes that legal.
 */

/** Ink that differs by theme. The muted step is the one token identical in both. */
const INK = {
  dark: { primary: '#ffffff', secondary: '#c3c2b7', track: '#2c2c2a' },
  light: { primary: '#0b0b0b', secondary: '#52514e', track: '#e1e0d9' },
  /** Neither known: the mode-invariant step for everything, hierarchy by size. */
  unknown: { primary: '#898781', secondary: '#898781', track: '#898781' },
} as const

const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' } as const
const MUTED = '#898781'

export type HeaderTone = 'good' | 'warning' | 'critical'
export type HeaderTheme = keyof typeof INK

export type Header = {
  tone: HeaderTone
  /** The state in words. Always drawn: a colour never carries this alone. */
  state: string
  /** Which rules are in force, as a chip on the right. */
  mode: string
  /** Context in use and the window, in tokens; null when not measured yet. */
  tokens: number | null
  window: number | null
}

const esc = (text: string): string =>
  text.replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))

const k = (n: number): string => `${Math.round(n / 1000)}K`

const WIDTH = 420
const HEIGHT = 74
const PAD = 2

/**
 * The header as one SVG document.
 * @param header what to say and how full the window is
 * @param theme which ink to use; `unknown` degrades to the mode-invariant step
 */
export function headerSvg(header: Header, theme: HeaderTheme): string {
  const ink = INK[theme]
  const dot = STATUS[header.tone]
  const share =
    header.tokens !== null && header.window ? Math.min(1, header.tokens / header.window) : null
  const trackWidth = WIDTH - PAD * 2
  // 4px rounded ends anchored to the track, and never narrower than the cap, so a
  // one-percent fill is still a mark rather than a sliver.
  const fill = share === null ? 0 : Math.max(8, Math.round(trackWidth * share))
  const size =
    header.tokens !== null && header.window
      ? `${k(header.tokens)} of ${k(header.window)} · ${Math.round((share ?? 0) * 100)}%`
      : 'context not measured yet'

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" font-family="system-ui,-apple-system,Segoe UI,sans-serif">
  <circle cx="${PAD + 5}" cy="14" r="5" fill="${dot}"/>
  <text x="${PAD + 18}" y="19" font-size="14" font-weight="600" fill="${ink.primary}">${esc(header.state)}</text>
  <text x="${WIDTH - PAD}" y="18" font-size="11" text-anchor="end" fill="${MUTED}">${esc(header.mode)}</text>

  <rect x="${PAD}" y="40" width="${trackWidth}" height="4" rx="2" fill="${ink.track}"/>
  ${share === null ? '' : `<rect x="${PAD}" y="40" width="${fill}" height="4" rx="2" fill="${ink.secondary}"/>`}

  <text x="${PAD}" y="64" font-size="11" fill="${MUTED}">${esc(size)}</text>
</svg>`
}

/** Which ink to use, from the `theme` row of the settings menu. */
export function themeOf(value: unknown): HeaderTheme {
  const name = typeof value === 'string' ? value : ''
  if (name.includes('light')) return 'light'
  if (name.includes('dark')) return 'dark'
  // `auto` and a custom theme say nothing this module can read.
  return 'unknown'
}

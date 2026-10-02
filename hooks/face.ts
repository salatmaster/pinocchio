// The portrait drawn above the prompt: rows of [text, color] segments.
// The nose is one cell longer per lie, and the smile goes with it.

export type Segment = [text: string, color?: 'yellow' | 'red' | 'dim']

const caption = (lies: number) => `${lies} ${lies === 1 ? 'lie' : 'lies'} this session`

export function portrait(lies: number, columns: number): Segment[][] {
  const nose = '━'.repeat(6 + Math.max(1, Math.min(lies, columns - 16)))
  const mouth = lies < 3 ? '╰────╯' : lies < 6 ? '──────' : '╭────╮'
  return [
    [['   ▄▄████▄▄  ', 'yellow'], ['/', 'red']],
    [['▄▄██████████▄▄', 'yellow']],
    [[' ╭──────────╮']],
    [[' │  ●    ●  │']],
    [[' │    ╰'], [nose, 'yellow'], ['●', 'red']],
    [[` │  ${mouth}  │`], [`   ${caption(lies)}`, 'dim']],
    [[' ╰──────────╯'], ['   /pinocchio lists them', 'dim']],
  ]
}

// One row, for a terminal too short for the portrait.
export function compact(lies: number, columns: number): Segment[][] {
  const tail = `  ${caption(lies)} · /pinocchio`
  const nose = '='.repeat(Math.max(1, Math.min(lies, columns - 7 - tail.length))) + '>'
  return [[['( o_o)'], [nose, 'red'], [tail, 'dim']]]
}

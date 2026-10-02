// The whole mod through the engine, with the model stubbed: tool calls and a
// Stop go in, the nose and the /pinocchio list come out.

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'pinocchio',
  surface: 'terminal',
  component: 'AbovePrompt',
  viewport: { columns: 100, rows: 30 },
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const SKIPPED = { kind: 'cheat', what: 'skipped the failing test', where: '/work/math.test.js', quote: "it.skip('adds'", missing: 'a fix for add()' }
const CLAIMED = { kind: 'claim', what: 'tests pass', where: 'final message', quote: 'All tests pass.', missing: 'a test run after the edit' }

// What Claude Code would answer beneath the mod. `lies` is what the model
// finds each time it is asked; left out, the model does not answer. A shell
// command with "fail" in it fails, and so does an edit to a file named
// "missing". Returns the questions the model was asked.
function engine(on: On, lies?: object[]) {
  const asks: string[] = []
  on('model.complete', ($, e) => {
    asks.push(JSON.stringify(e))
    return {
      value:
        lies === undefined
          ? { isAnswered: false as const, reason: 'empty-reply' as const, usage: USAGE }
          : { isAnswered: true as const, text: JSON.stringify({ lies }), usage: USAGE },
    }
  })
  mock.store(on)
  on('session.id', () => ({ value: 'session-1' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.read', () => ({ value: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('classic.Stop', () => ({}))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['nothing'] }))
  on('tool.call', ($, e) => {
    const isFailing = (e.tool === 'Bash' && e.command.includes('fail')) || (e.tool === 'Edit' && e.file_path.includes('missing'))
    return isFailing ? { result: 'failed', isError: true } : { result: 'ok' }
  })
  return asks
}

const ask = ($: Engine, text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
const skipTheTest = ($: Engine) =>
  $.tool.call({ tool: 'Edit', file_path: '/work/math.test.js', old_string: "it('adds'", new_string: "it.skip('adds'" })
const stop = ($: Engine, message: string) => $.classic.Stop({ stop_hook_active: false, last_assistant_message: message })
const pinocchio = async ($: Engine, args = '') =>
  (
    await $.command.run({
      command: 'pinocchio',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    })
  ).text

test('the lies the model finds grow the nose', async ($, on) => {
  const asks = engine(on, [SKIPPED, CLAIMED])
  await ask($, 'the adds test is failing, fix it')
  await skipTheTest($)
  expect(await pinocchio($)).toBe('Nose length: 0. Nothing caught in this session.\nThis turn is judged when it ends.')
  await stop($, 'Done. All tests pass.')

  expect(await pinocchio($)).toBe(
    [
      'Nose length: 2',
      "1. skipped the failing test (it.skip('adds')",
      '   where: math.test.js',
      '   missing: a fix for add()',
      '2. said "All tests pass."',
      '   where: final message',
      '   missing: a test run after the edit',
    ].join('\n'),
  )
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: '╰━━━━━━━━●' })).toBeDefined() // 6 cells to the edge of the face, 2 lies
  expect(await ui.find({ type: 'Text', text: '2 lies this session' })).toBeDefined()
  await ui.unmount()

  // a terminal too short for the portrait gets one row
  const short = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 3 } })
  expect(await short.find({ type: 'Text', text: '==>' })).toBeDefined()

  // what the model was shown
  expect(asks.length).toBe(1)
  expect(asks[0]).toContain('the adds test is failing, fix it')
  expect(asks[0]).toContain("+ it.skip('adds'")
  expect(asks[0]).toContain('Done. All tests pass.')
})

test('an honest turn keeps the nose at zero and the band empty', async ($, on) => {
  const asks = engine(on, [])
  await $.tool.call({ tool: 'Edit', file_path: '/work/math.js', old_string: 'a - b', new_string: 'a + b' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await stop($, 'Fixed the bug, all tests pass.')

  expect(asks.length).toBe(1)
  expect(asks[0]).toContain('run [ok] npm test')
  expect(await pinocchio($)).toBe('Nose length: 0. Nothing caught in this session.')
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'nothing' })).toBeDefined()
})

test('the log carries over to the next turn, the changes do not', async ($, on) => {
  const asks = engine(on, [])
  await $.tool.call({ tool: 'Bash', command: 'npm test # will fail' })
  await skipTheTest($)
  await stop($, 'The test is skipped for now.')
  await $.tool.call({ tool: 'Bash', command: 'npm run lint' })
  await stop($, 'Lint is clean.')

  expect(asks.length).toBe(2)
  expect(asks[1]).toContain('run [failed] npm test # will fail')
  expect(asks[1]).toContain('edit /work/math.test.js')
  expect(asks[1]).toContain('-- end of turn --')
  expect(asks[1]).toContain('run [ok] npm run lint')
  expect(asks[1]).not.toContain("+ it.skip('adds'")
})

test('a quote the model made up is not counted', async ($, on) => {
  engine(on, [{ ...CLAIMED, quote: 'The build is green.' }, { ...SKIPPED, quote: '// @ts-ignore' }])
  await skipTheTest($)
  await stop($, 'I skipped the test.')

  expect(await pinocchio($)).toBe('Nose length: 0. Nothing caught in this session.')
})

test('a model that does not answer counts nothing', async ($, on) => {
  const asks = engine(on)
  await skipTheTest($)
  await stop($, 'All tests pass.')

  expect(asks.length).toBe(1)
  expect(await pinocchio($)).toBe('Nose length: 0. Nothing caught in this session.')
})

test('a turn of talk does not call the model', async ($, on) => {
  const asks = engine(on, [CLAIMED])
  await ask($, 'do the tests pass?')
  await stop($, 'Yes. All tests pass.')

  expect(asks.length).toBe(0)
  expect(await pinocchio($)).toBe('Nose length: 0. Nothing caught in this session.')
})

test('an edit that failed is not logged', async ($, on) => {
  const asks = engine(on, [])
  await $.tool.call({ tool: 'Edit', file_path: '/work/missing.test.js', old_string: "it('adds'", new_string: "it.skip('adds'" })
  await stop($, 'Could not edit the file.')

  expect(asks.length).toBe(0)
})

test('/pinocchio off stops the judging and the drawing; on brings them back', async ($, on) => {
  const asks = engine(on, [SKIPPED, CLAIMED])
  expect(await pinocchio($, 'off')).toBe('pinocchio is off: nothing is counted or drawn until /pinocchio on.')
  await skipTheTest($)
  await stop($, 'All tests pass.')

  expect(asks.length).toBe(0)
  expect(await pinocchio($)).toBe('Nose length: 0. Nothing caught in this session.\npinocchio is off. Turn it back on with /pinocchio on.')

  expect(await pinocchio($, 'on')).toBe('pinocchio is on.')
  await skipTheTest($)
  await stop($, 'All tests pass.')

  expect(asks.length).toBe(1)
  expect(asks[0]).toContain('-- end of turn --') // the turn made while off is still in the log
  expect(await pinocchio($)).toContain('Nose length: 2')
})

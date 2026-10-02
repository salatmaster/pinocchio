// pinocchio: the nose grows when the agent lies.
// Keeps a log of what the agent changed and ran, has a model judge each turn
// when it ends (./judge.ts), blocks nothing, and draws a portrait above the
// prompt (./face.ts).

import type { EngineInterface, Register } from 'claude-code'

import { compact, portrait } from './face'
import type { Segment } from './face'
import { END_OF_TURN, MODEL, SYSTEM, change, entry, question, verdict } from './judge'
import type { Lie } from './judge'

const KEEP = 50 // sessions kept in $.store
const LOG = 120 // log lines kept per session

// One journal per session, kept in $.store under the session id so a resumed
// session keeps its nose and its log.
type Journal = {
  id: string
  at?: number
  log: string[] // edits and commands of the session; see entry() in ./judge.ts
  lies: Lie[]
  // This turn only, in memory:
  changes: string[] // the turn's edits in full
  prompts: string[] // the user's last few prompts
  busy: number // logged tool calls of this turn
}
const journals = new Map<string, Promise<Journal>>()

function journal($: EngineInterface): Promise<Journal> {
  return $.session.id().then(id => {
    const open =
      journals.get(id) ??
      $.store
        .get(id)
        .catch(() => undefined)
        .then(found => ({ log: [], lies: [], ...(found as Partial<Journal> | undefined), id, changes: [], prompts: [], busy: 0 }))
    journals.set(id, open)
    return open
  })
}

async function save($: EngineInterface, j: Journal) {
  j.at = Date.now()
  j.log = j.log.slice(-LOG)
  await $.store.set(j.id, { id: j.id, at: j.at, log: j.log, lies: j.lies }) // changes and prompts never reach the disk
  $.ui.invalidate('ui.render')
}

// `/pinocchio off` is kept in $.store under this key, for every session on the
// machine. While off, edits and commands are still logged as proof, but
// nothing is judged, counted or drawn.
// ponytail: read once per session; a session already running does not see
// another session's switch until it restarts.
const OFF = 'off'
let off: Promise<boolean> | undefined
const isOff = ($: EngineInterface) => (off ??= $.store.get(OFF).then(Boolean, () => false))

// ponytail: reads every stored session to find the oldest; only runs past
// 2 * KEEP sessions. Give each record a dated key if this ever gets slow.
async function prune($: EngineInterface) {
  const keys = (await $.store.keys()).filter(key => key !== OFF)
  if (keys.length <= KEEP * 2) return
  const aged = await Promise.all(
    keys.map(async (key): Promise<[string, number]> => [key, ((await $.store.get(key)) as Journal | undefined)?.at ?? 0]),
  )
  for (const [key] of aged.sort((a, b) => b[1] - a[1]).slice(KEEP)) await $.store.delete(key)
}

// The lies of one turn, or none when the model does not answer.
async function judge($: EngineInterface, j: Journal, message: string) {
  const turn = { prompts: j.prompts, log: j.log, changes: j.changes, message }
  const reply = await $.model
    .complete({ model: MODEL, system: SYSTEM, prompt: question(turn), maxTokens: 1500, effort: 'low', timeoutMs: 60_000 })
    .catch(() => undefined)
  return (reply?.isAnswered ? verdict(reply.text, turn) : undefined) ?? []
}

const report = (lies: Lie[]) =>
  [
    lies.length === 0 ? 'Nose length: 0. Nothing caught in this session.' : `Nose length: ${lies.length}`,
    ...lies.map((lie, i) => `${i + 1}. ${lie.what}\n   where: ${lie.where}\n   missing: ${lie.missing}`),
  ].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await prune($).catch(() => {})
    await $.command.register({
      name: 'pinocchio',
      description: 'List what the agent cheated on or claimed without proof in this session',
      argumentHint: '[off|on]',
      immediate: true,
    })
    return next(e)
  })

  // Kept so a shortcut the user asked for ("skip that test for now") is not a lie.
  on('prompt.submit', async ($, e, next) => {
    const j = await journal($)
    j.prompts = [...j.prompts, String(e.text ?? '').slice(0, 4000)].slice(-3)
    return next(e)
  })

  // Everything that changes files or runs something goes in the log. A regex,
  // not a list: PowerShell is only in the tool table of Windows builds.
  on('tool.call', { tool: /^(Edit|Write|NotebookEdit|Bash|PowerShell|mcp__.+)$/ }, async ($, e, next) => {
    const before = e.tool === 'Write' ? await $.fs.read(e.file_path).catch(() => '') : ''
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const j = await journal($)
    const isOk = ran.isError !== true
    if (e.tool === 'Edit' || e.tool === 'Write') {
      if (!isOk) return ran
      j.log.push(`edit ${e.file_path}`)
      j.changes.push(e.tool === 'Edit' ? change(e.file_path, e.old_string, e.new_string) : change(e.file_path, before, e.content))
    } else if ('command' in e && typeof e.command === 'string') {
      j.log.push(entry('run', e.command, isOk, ran.text))
    } else {
      const { tool, tool_use_id, ...input } = e
      j.log.push(entry('tool', `${tool} ${JSON.stringify(input)}`, isOk, ran.text))
    }
    j.busy += 1
    await save($, j)
    return ran
  })

  // The turn is judged when it ends. A turn of talk is not judged at all.
  on('classic.Stop', async ($, e, next) => {
    const j = await journal($)
    if (j.busy > 0) {
      if (!(await isOff($))) j.lies.push(...(await judge($, j, e.last_assistant_message ?? '')))
      j.log.push(END_OF_TURN)
      j.changes = []
      j.busy = 0
      await save($, j)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { lies } = await journal($)
    if (lies.length === 0 || e.props.hasSurvey || (await isOff($))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const rows = (e.props.maxRows < 7 ? compact : portrait)(lies.length, e.props.bodyColumns)
    const paint = ([text, color]: Segment) =>
      color === undefined ? text : Text(color === 'dim' ? { dimColor: true, children: [text] } : { color, children: [text] })
    return Box({
      flexDirection: 'column',
      children: [
        ...rows.map(row => Text({ wrap: 'truncate', children: row.map(paint) })),
        await next(e), // what the mods after this one draw in the band
      ].filter(Boolean),
    })
  })

  on('command.run', { command: 'pinocchio' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      off = Promise.resolve(arg === 'off')
      await (arg === 'off' ? $.store.set(OFF, true) : $.store.delete(OFF))
      $.ui.invalidate('ui.render')
      return { text: arg === 'off' ? 'pinocchio is off: nothing is counted or drawn until /pinocchio on.' : 'pinocchio is on.' }
    }
    const j = await journal($)
    const list = report(j.lies).replaceAll((await $.session.cwd()) + '/', '')
    return {
      text: [
        list,
        ...(j.busy > 0 ? ['This turn is judged when it ends.'] : []),
        ...((await isOff($)) ? ['pinocchio is off. Turn it back on with /pinocchio on.'] : []),
      ].join('\n'),
    }
  })
}

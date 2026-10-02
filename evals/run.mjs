// Runs the cases in ./cases.mjs through the real model and prints which ones
// the judge got wrong. Needs Node 23.6 or later (it imports the TypeScript
// source as is) and a signed-in `claude`:
//
//   node evals/run.mjs            every case
//   node evals/run.mjs skip       cases whose name contains "skip"
//
// Each case costs one model request.

import { spawn } from 'node:child_process'

import { END_OF_TURN, MODEL, SYSTEM, change, entry, question, verdict } from '../hooks/judge.ts'
import { CASES } from './cases.mjs'

// A case's steps as the turn the hooks would have built.
function turnOf({ prompts = [], steps, message }) {
  const turn = { prompts, log: [], changes: [], message }
  for (const step of steps) {
    if (step === 'end') {
      turn.log.push(END_OF_TURN)
      turn.changes = []
    } else if (step.edit) {
      const [file, before, after] = step.edit
      turn.log.push(`edit ${file}`)
      turn.changes.push(change(file, before, after))
    } else {
      const [command, isOk, output] = step.run
      turn.log.push(entry('run', command, isOk, output))
    }
  }
  return turn
}

const ask = prompt =>
  new Promise((resolve, reject) => {
    const args = ['-p', '--safe-mode', '--model', MODEL, '--effort', 'low', '--system-prompt', SYSTEM, '--tools', '', '--no-session-persistence']
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', chunk => (out += chunk))
    child.on('error', reject)
    child.on('close', () => resolve(out))
    child.stdin.end(prompt)
  })

async function run(one) {
  const turn = turnOf(one)
  const started = Date.now()
  const lies = verdict(await ask(question(turn)), turn)
  const got = { cheat: 0, claim: 0 }
  for (const lie of lies ?? []) got[lie.where === 'final message' ? 'claim' : 'cheat'] += 1
  const want = { cheat: 0, claim: 0, ...one.lies }
  const isRight = lies !== undefined && got.cheat === want.cheat && got.claim === want.claim
  console.log(`${isRight ? 'ok  ' : 'FAIL'} ${one.name} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  if (!isRight) console.log(`     wanted ${JSON.stringify(want)}, got ${lies ? JSON.stringify(lies) : 'no verdict'}`)
  return isRight
}

const picked = CASES.filter(one => one.name.includes(process.argv[2] ?? ''))
const results = []
for (let i = 0; i < picked.length; i += 6) results.push(...(await Promise.all(picked.slice(i, i + 6).map(run))))
const right = results.filter(Boolean).length
console.log(`\n${right} of ${results.length} right`)
process.exit(right === results.length ? 0 : 1)

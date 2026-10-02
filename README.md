<div align="center">

# pinocchio

### The nose grows when the agent lies.

A Claude Code plugin that catches your agent cheating on the tests<br>
and telling you things it never checked.

![Claude Code 2.1.287+](https://img.shields.io/badge/Claude_Code-2.1.287%2B-d97757)
![any language](https://img.shields.io/badge/works_in-any_language-3b82f6)
![zero dependencies](https://img.shields.io/badge/dependencies-zero-22c55e)
![blocks nothing](https://img.shields.io/badge/blocks-nothing-8b5cf6)
![MIT](https://img.shields.io/badge/license-MIT-lightgrey)

</div>

```text
⏺ Update(math.test.js)
      6 -it('adds', () => {
      6 +it.skip('adds', () => {

⏺ Done. All tests pass.

   ▄▄████▄▄  /
▄▄██████████▄▄
 ╭──────────╮
 │  ●    ●  │
 │    ╰━━━━━━━━●
 │  ╰────╯  │   2 lies this session
 ╰──────────╯   /pinocchio lists them
```

The test was failing. The agent switched it off, ran nothing, and reported
success. You were reading something else. pinocchio was not.

## Caught in the act

pinocchio sits in your session and says nothing until the agent does one of
two things:

**It cheats in the code.** It skips the failing test, rewrites the assertion to
expect the bug, adds `@ts-ignore`, swallows the exception, leaves a stub where
you asked for code, or commits with `--no-verify`.

**It says things that did not happen.** "All tests pass" with no test run. "It
compiles" after a failed build. "Committed and pushed" with no `git push`.

Each one makes the nose one cell longer. The smile does not last either:

```text
   ▄▄████▄▄  /
▄▄██████████▄▄
 ╭──────────╮
 │  ●    ●  │
 │    ╰━━━━━━━━━━━━━●
 │  ╭────╮  │   7 lies this session
 ╰──────────╯   /pinocchio lists them
```

## The receipts

A long nose is an accusation, so every cell comes with evidence. `/pinocchio`
shows what was done or said, where, and what would have made it honest:

```text
❯ /pinocchio
  ⎿  pinocchio: Nose length: 2
     1. skipped a test (it.skip('adds')
        where: math.test.js
        missing: fix the code so the test passes without skipping it
     2. said "Done. All tests pass."
        where: final message
        missing: a successful test run after the last edit
```

It reads the change, not a list of keywords. Here the agent "fixed" a failing
test by making it expect the wrong answer, then ran it, and it passed:

```text
     1. changed test expectation to match bug (assert.equal(add(2, 2), 0))
        where: math.test.js
        missing: Fix add in math.js to use + instead of editing the test
```

## It does not cry wolf

A lie detector that accuses honest agents gets uninstalled in a day. So:

- **It blocks nothing.** No interrupted turns, no extra prompts, no demands.
  One face above the prompt, and only once there is something to show.
- **It knows when you asked.** "Skip the flaky login test for now" makes that
  skip your decision, and it is not counted. "Do not skip it" is not asking.
- **It knows a guess from a claim.** "Tests should pass", "run the tests to
  verify", and "I haven't run them" are not lies.
- **It needs a quote.** Every lie has to point at the line the agent added,
  the command it ran, or the sentence it wrote. An accusation with nothing to
  point at is thrown away.
- **It speaks your language.** Yours, the agent's, and the code's: prompts,
  messages and edits are read as they are, in any language.
- **It would rather miss a lie than invent one.** When in doubt, the nose stays
  where it is.

## Install

One command, in a Claude Code session:

```text
/plugin install pinocchio --marketplace salatmaster/pinocchio
```

Had enough honesty for today? `/pinocchio off` stops the counting and hides
the face, and `/pinocchio on` brings them back.

That is the whole setup. pinocchio is a
[mod](https://code.claude.com/docs/en/plugins/mods/overview): it runs inside
Claude Code itself, so there is no Node, Python, or `jq` to install. It needs
Claude Code 2.1.287 or later.

## See it lie

The `demo/` folder holds a three-file project with a failing test and a
`DEMO.md` that tells the agent to cheat. With pinocchio installed:

```bash
git clone https://github.com/salatmaster/pinocchio
cd pinocchio/demo
claude
```

To try it without installing, start the last step as `claude --plugin-dir ..`.

Type `Follow DEMO.md`, approve the edit, and watch the face appear. Then type
`/pinocchio` for the receipts. Restore the test afterwards with
`git checkout demo/math.test.js`.

The demo is staged on purpose: the instruction to skip the test lives in a
file. If you typed "skip that test" yourself, it would be your decision, and
pinocchio would not count it.

## What makes the nose grow

| The agent | For example |
| :- | :- |
| Disables or deletes a test | `it.skip`, `@Disabled`, `t.Skip()`, `rm tests/test_api.py` |
| Weakens a test until it cannot fail | the expected value changed to match the bug, `toBeDefined()` in place of `toBe(4)` |
| Silences a check | `@ts-ignore`, `# type: ignore`, `//nolint`, `#[allow(…)]`, `as any` |
| Swallows an error | `catch (e) {}`, `except: pass`, `_ = err` |
| Leaves a stub where you asked for code | `TODO: implement`, `NotImplementedError`, `todo!()` |
| Goes around the checks | `git commit --no-verify` |
| Says the tests pass, it builds, or lint is clean | with no successful run since the last change to code |
| Says it ran, committed, or pushed something | with no such command in the session |
| Says it did what its own edit contradicts | "implemented" over a stub |

None of these counts when you asked for it, or when it is the honest way to do
the job: a platform-specific skip, an abstract method, a refactor that keeps
the same checks.

## How it decides

There are no keyword lists. When a turn ends, pinocchio hands a model
(Sonnet) four things: your last few prompts, the turn's edits, the session's
commands with their results, and the agent's final message. The model names
the lies; pinocchio keeps only those that quote something really there.

One request per turn, and only for turns that changed files or ran commands.
It goes through Claude Code's own client, counts against your usage like any
other request, and takes a few seconds after the agent has already answered.

<details>
<summary><b>What is sent, what is kept, and what it costs</b></summary>

<br>

- **Sent to the model**: your last three prompts; this turn's edits as removed
  and added lines (up to about 30,000 characters); the session's log of edits,
  shell commands and MCP tool calls, each with the end of its output (the last
  80 entries); the final message (up to about 8,000 characters).
- **Asked**: which changes are cheats you did not ask for, and which sentences
  claim something the log does not show. The full instructions are in
  `hooks/judge.ts`.
- **Checked afterwards**: a cheat must quote a line or command of this turn,
  and a claim must quote the final message. Anything else is dropped. If the
  model does not answer, nothing is counted for that turn.
- **Kept on disk**: per session, the log (file paths, commands, the end of each
  output, last 120 entries) and the lies, in Claude Code's plugin store under
  `~/.claude/plugins/store/`. Your prompts and the edits themselves are not
  stored. A resumed session keeps its nose; `/clear` starts a new one.
- **Cost**: one Sonnet request per working turn. Its size follows the size of
  the turn's edits.

`/pinocchio off` stops the requests along with everything else.
`claude plugin validate` lists everything the plugin hooks and calls, if you
want to check before installing.

</details>

## What it does not catch

pinocchio is one model reading one turn. It is not a code reviewer, and it will
miss things:

- A turn of talk. "Yes, all tests pass" in a turn with no edits and no commands
  is not judged.
- Anything it cannot quote, and anything outside what the log shows: it cannot
  tell whether the agent really read a file.
- Lies in the middle of a turn, and in subagents' own messages. Only the final
  message is read.

And it can be wrong the other way: if the tests ran where it cannot see (you
ran them yourself, CI did), a true "tests pass" is counted.

<details>
<summary><b>The full list of limits</b></summary>

<br>

- The model can misjudge, in both directions. The cases it is checked against
  are in `evals/`.
- Proof it cannot see. It knows the edits, shell commands and MCP tool calls
  the agent made in this session, and nothing else.
- A request it did not see. Only your last three prompts are sent. A request
  that reached the agent another way (a `CLAUDE.md`, a ticket, an earlier
  prompt) is not seen, and the change is counted.
- Edits made through the shell (`sed -i`) are seen as commands, not as changed
  lines.
- A very long turn is cut to fit, and the log keeps only its latest entries.
- Cheats show up when the turn ends, not at the edit.
- In the VS Code panel and `claude -p` no face is drawn, but the count is kept
  and `/pinocchio` works. A terminal too short for the face gets a one-row
  version, `( o_o)==>`.

pinocchio has been run in real sessions on a JavaScript project, in English and
in Russian. Everything else rests on the evals.

</details>

## Check the judge

The judge is a prompt, so it is tested the way prompts are: against cases.
`evals/cases.mjs` holds turns that must be caught and turns that must not, and
this runs them through the real model:

```bash
node evals/run.mjs
```

Found a lie it missed, or an honest turn it accused? Add the case, adjust the
instructions in `hooks/judge.ts`, and send both.

<details>
<summary><b>Working on the code</b></summary>

<br>

```bash
claude plugin validate .claude-plugin/plugin.json
claude plugin test
```

The tests cover everything around the model, with the model stubbed: what it
is shown, how its reply is checked, and the hooks. The evals need Node 23.6 or
later and a signed-in `claude`, and each case is one model request.

The code is TypeScript, and Claude Code runs it as is: there is no build step.
To type-check, load the plugin once with `claude --plugin-dir .` so Claude Code
writes its type declarations into the folder, then run `npx tsc -p .`. The
drawing is in `hooks/face.ts`.

</details>

## Related projects

- [reverify](https://github.com/2akouwu/reverify) verifies claims by running
  checks through a CLI and an MCP server.
- [taskmaster](https://github.com/blader/taskmaster) and
  [oh-my-agent](https://github.com/first-fluke/oh-my-agent) stop the agent from
  finishing until the work is done.

pinocchio runs no checks of its own and blocks nothing. It reads what the agent
did and said, and shows one face.

## License

MIT

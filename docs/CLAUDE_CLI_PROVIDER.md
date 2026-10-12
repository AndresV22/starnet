# Claude Code provider (`claude-cli`)

StarNet can use the **Claude Code CLI already installed on this computer** (`claude`) as an agent's brain,
with whatever Claude account or API key that CLI is signed in with. No key is stored in StarNet.
Implementation: `sidecar/providers/claude-cli.js` (adapter), a `claude-cli` profile in
`sidecar/providers/registry.js`, one adapter case in `sidecar/providers/factory.js`; the Connect-a-brain tile and
Settings card are labelled **CLAUDE CODE** and are keyless: the CLI's own sign-in is the credential.

## Requirements

- Claude Code installed (a Claude Pro, Max, Team or Enterprise plan — the free claude.ai plan has no Claude Code).
  When it is missing, the tile shows the one-line install command for the OS plus the install guide, and re-checks
  itself every 5 s so installing flips it without a restart.
- Signed in — see **Sign in** below (or an `ANTHROPIC_API_KEY` the CLI can see).
- The sidecar finds `claude` on `PATH`, then `%USERPROFILE%\.local\bin\claude.exe` on Windows. An npm
  `claude.cmd` shim is run as `node <…>/@anthropic-ai/claude-code/cli.js`. Override with `STARNET_CLAUDE_BIN`.

## Sign in (SIGN IN WITH CLAUDE)

StarNet never holds the Claude credential. `sidecar/providers/claude-cli-login.js` runs the user's own
`claude auth login --claudeai` (it works with no terminal attached): the CLI opens the browser, finishes OAuth and
stores the token in its own credential store. Routes: `GET /api/auth/claude-cli/status`,
`POST /api/auth/claude-cli/{start,poll,code,cancel}`.

- The brain-screen tile (app.js) and the Settings → PROVIDERS card (stationui.js, via `ClaudeCliSignIn` in
  codexsignin.js) show: not installed · signed out (⏼ SIGN IN) · signing in (↗ OPEN SIGN-IN PAGE, a paste box for the
  code the fallback page shows — relayed to the CLI's stdin, never logged — and CANCEL, which kills the child) ·
  signed in, **only** once `claude auth status` proves it.
- One login child at a time; killed on cancel, on a 10-minute TTL, on graceful shutdown, and when the credential
  lands while it lingers on its paste prompt. It also dies with the sidecar.
- WAKE on a signed-out pick points at the button instead of running a doomed wire test.

## How a turn runs

Every child, persistent or one-shot, starts with the same isolation flags:

```text
claude -p --output-format stream-json --verbose --include-partial-messages
       --tools "" --strict-mcp-config --mcp-config {"mcpServers":{}}
       --disable-slash-commands --setting-sources "" --no-session-persistence
       [--input-format stream-json]
       --model <model> [--effort <level>] --system-prompt-file <tmp file>
# env: the station-free child env (child-env.js) + CLAUDE_CODE_DISABLE_AUTO_MEMORY=1
```

### One persistent child per run (default)

An agent-loop turn (a request that carries tools) rides **one** `claude` child per run, started with
`--input-format stream-json`. The child keeps the conversation itself, and each later turn sends **only what StarNet
added since** (the tool results, system notes, steering) as one stream-json user message. Two reasons:

- **Speed.** A one-shot child pays the CLI's start-up and session setup on every model turn. Gauntlet n=1:
  StarNet took 8.8–12.2 s per turn, Claude Code 3.9–6.2 s, on the same Opus model.
- **Cost.** One growing transcript block never matches the previous turn's prompt cache, so every step re-writes
  the whole transcript at the cache-write rate. Real messages hit it.

What the installed CLI (2.1.284) was proven to do:

- One child answers successive user lines. Each turn ends at its own `result` line and the child waits for the
  next one. It exits when stdin closes.
- `result.usage` is per turn. `total_cost_usd` is the child's **running total**, so each turn books only its own
  share.
- A model normally ends its reply right after `</function_calls>` (`end_turn`, ~30–70 ms after the last delta),
  and the child then holds exactly the text that streamed.
- A stream-json `interrupt` keeps the streamed text and also adds a `[Request interrupted by user]` turn to the
  CLI's history. StarNet never uses it.

**In sync or start fresh.** The child is reused only while what it holds is provably StarNet's history:

- the same system prompt (persona, rules, brief), model, effort, run and Stop signal;
- the same tools or more. A `tool_search` reveal is announced at the end of that turn's message, so a reveal does
  not restart the child. A withdrawn or changed tool does.
- every earlier message unchanged (one fingerprint per message);
- the reply the child wrote recorded by the loop unedited (same text, same calls, same arguments);
- nothing after that reply except new user, tool or system messages.

Anything else closes the child, and the turn starts a fresh one from StarNet's whole history, exactly like a one-shot
turn. That covers compaction, an aged-out screenshot, a dropped or repaired call, a retry after a failed turn, a model
switch, the CLI compacting its own history, and a reply that keeps writing after its call block (a guess at results
the child would otherwise keep). When the child is closed at the end of a call turn, a replacement with the same flags
starts at once, while the loop runs the tools. An idle child answered its first line in 1.1 s, against 3.7 s cold.

**Lifecycle.** The child ends:

- at the run's end (`loop.js` `end()` calls the adapter's `release(runId)`);
- on **Stop**: the run signal kills it, even between turns;
- on any turn that did not end cleanly (an error result, a crash, the idle watchdog);
- after `STARNET_CLAUDE_CLI_PERSIST_IDLE_MS` (default 5 min) parked;
- when the sidecar exits.

Every kill takes the whole process tree (`taskkill /T /F` on Windows; a live CLI was seen with a `cmd.exe` and a
`conhost.exe` under it). On Windows, Node's job object also ends the tree if the sidecar dies hard.

**Switches.**

- `STARNET_CLAUDE_CLI_PERSIST=0` runs every turn one-shot, as before.
- `STARNET_CLAUDE_CLI_PERSIST_LOG=1` prints one line per decision (reuse, fresh + why, closed + why).

Live, through the hermetic sidecar fixture, on the same 4-turn `tool_search` task (n=1 each, a loaded machine):

| Run | Per-turn wall time | Cache reads per turn |
| --- | --- | --- |
| Haiku, persistent | 17.7 · 1.6 · 2.0 · 2.9 s (one child) | 13,288 · 14,485 · 14,950 · 20,335 |
| Haiku, `PERSIST=0` | 14.6 · 11.3 · 10.1 · 20.0 s | 13,288 · 0 · 0 · 0 |
| Opus, persistent | 16.9 · 3.6 · 2.5 · 3.4 s (one child) | 0 · 19,890 · 20,502 · 27,642 |

### One-shot child

Any other call is one child for one turn, with the whole transcript on stdin. That covers a toolless request (a
summary, a vision call, a wire test), a second request while the persistent child is mid-turn, and every turn under
`STARNET_CLAUDE_CLI_PERSIST=0`.

### Both kinds

- The leading system messages go to a temporary system-prompt file, deleted when the child ends. `text_delta`
  stream events become `text` events.
- **Every CLI tool is off**: built-ins, MCP connectors, skills, settings and the session file. The CLI never acts
  on the machine by itself.
- StarNet's own tools are described in the system prompt. The model asks for them with a
  `<function_calls><invoke name="…"><parameter name="…">…</parameter></invoke></function_calls>` block (the older
  `<tool_call>{json}</tool_call>` is still read). The adapter turns each call into `tool_start` / `tool_args` /
  `tool_done`, so `loop.js` runs it through the normal capability gate and consent broker.
- Results return on the next turn as `<tool_result>` blocks. The turn ends at the end of the call block, and
  anything the model writes after it is never shown or run.
- Exactly one `done` is emitted, only once the turn has really ended. A CLI error result, or an exit without a
  result, is thrown as an error (with the CLI's message or stderr tail), never delivered as an empty answer.
- A turn with **no** tools (chat) says so in the prompt; otherwise the model improvises its own tool-call markup as
  text. The user's ~/.claude/CLAUDE.md and auto-memory never reach a turn (verified against a control run).
- A lost sign-in (the CLI's `authentication_failed`) is thrown as a 401, so it fails fast as `auth` instead of
  riding the ~105 s retry ladder.
- Images in user messages ride stream-json input as real image blocks (newest 20 per turn). An image the API
  cannot take leaves an explicit note.

## Stop, timeouts, budget

- **Stop** aborts the run signal. The adapter kills the child's process tree (`taskkill /T /F` on Windows,
  `SIGTERM` elsewhere) and ends the turn as cancelled. A persistent child parked between turns dies with the
  signal too.
- The shared provider **idle watchdog** (`SKYNET_PROVIDER_IDLE_MS`, default 300 s) kills a child that stays
  silent and reports a `timeout`.
- Per-run budgets and caps apply unchanged: each turn reports its cost (below) to the loop.

## Cost

The CLI's `init` line says how it is authenticated and its `result` line carries real usage:

| CLI sign-in | Booked per turn |
| --- | --- |
| Claude subscription (`apiKeySource: "none"`) | `$0` — nothing is billed per call; real token counts are kept |
| API key | the CLI's own `total_cost_usd` (a persistent child's running total minus what earlier turns booked) |

The profile is therefore **not** `unmetered`: an API-key sign-in is real spend and stays inside the budgets.

## Models and readiness

`listModels()` runs `claude auth status` (a local check, no model call). Signed in → the CLI's aliases
`sonnet`, `opus`, `haiku` (always the newest model of each family the account can use). Not installed or not
signed in → no models and an error naming the fix, so the tile and Settings row read "not detected / not
signed in" instead of claiming a working brain.

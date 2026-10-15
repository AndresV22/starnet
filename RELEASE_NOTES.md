# StarNet v0.13.5

**Before you update:** if you might ever go back to 0.13.3 or older, save a station backup first (SETTINGS › APP & BACKUP › STATION BACKUP). Older versions don't know SEND TO or SPLIT THE JOB and delete those settings the next time they save your station. If agents are working when you install, choose WAIT FOR AGENTS.

The big one. 0.13.3 was security only; this is the feature update that was promised with it, polished end to end. Your agents can bring crew into a chat and hand work to each other, conveyor lines can hand finished jobs to other lines, building is drag-and-drop, the station draws smoothly even when StarNet isn't focused, and Claude Code runs are faster and cheaper. Plus a long list of fixes from walking the whole app as one product.

## Agents & chat

- **Bring crew into a conversation by asking.** Say "add FORGE to this chat" and your lead adds them. They join the moment its reply ends, or the chat says why they couldn't. ADD AGENTS shows each agent's portrait.
- **Delegated work has its own home.** Work your lead hands off gets its own threads, folded under the conversation that asked, and one live card in that conversation: who is doing what, Stop while it runs, Approve or Deny when a worker asks, and See work to unfold each worker's answer and what it did.
- **Workers build on each other.** When workers run one after another, the next one starts from what the earlier ones returned and the files they saved, and can open those files.
- **NEEDS YOU at the top of SESSIONS** gathers what's waiting on you in one list: approvals and questions from your conversations, group chats that need you, delegated work that failed and routine runs that failed, each with its action right there.
- **Asking your lead to hand work to a named crew member now does it.**
- **Group chats:** the lead can build and change lines from the group, each agent keeps its own room's gear (a researcher can search the web there), replies show their tool calls like one-on-one chats, and the bottom strips share one tray.
- **Question and approval cards read at a glance.** The question comes first, long ones fold behind "Show the whole question", answers are full-width keys with the agent's ★ suggestion lit, and the reasoning folds last. A one-time grant reads "Approve once" everywhere.
- **SEND NOW.** A message you type while an agent works still waits its turn. Each waiting message now has a send now key that hands it to the running task, so the agent reads it before its next step.
- **STOP gives your words back.** Messages waiting behind a stopped run go back into the message box instead of disappearing, and open approval cards say "the run ended before an answer — nothing was approved".
- **Typing an answer answers.** A reply typed in COMMS while the lead is asking you something answers that question instead of starting the job over.
- **A worker running in the background keeps its approval open** after the lead's turn ends, instead of being denied a second later where you couldn't see it.
- **Telegram, Discord and other chat apps:** in a direct chat, a plain follow-up joins the running task instead of cancelling it. "stop" or /stop still stops it.
- **Long chats keep your earlier instructions.** Messages that no longer fit the model's window are carried forward in your own words, instructions first, instead of silently disappearing.
- **Memory tells the truth.** Remembered notes carry the date they were saved and the newer one wins when two disagree. An agent that says it saved something without saving it is told to, and the "remembered" receipt lists only this run's saves. Forgotten memories stay forgotten when you restore a backup. "Never mind" and other passing remarks no longer become standing orders; "remember that…" still does.
- **Approvals carry into the next design.** Approving work, including ★ KEEP THIS STYLE, records what was actually made (files, colours, fonts, image prompt) and the whole crew draws on it. Image generation can use an approved image as a reference on OpenRouter, the ChatGPT plan and the OpenAI Images API, and says so where a connection can't.
- **Skill changes wait for you.** A skill an agent creates or changes becomes a proposal in CONNECT › ABILITIES › AGENT SKILLS. It needs a passing evaluation and your approval before it's used; the current version keeps working meanwhile.
- **Spoken turns can use their own model.** Pick it under Voice chat model in SETTINGS › AI & MODELS. It answers COMMS with the speaker on and Telegram voice notes, without changing your typed-chat model.
- **API jobs run hands-off.** After an agent reads a response from a web API, it can keep calling that same API with the keys it already used there, without an approval card for every call. Reading anything else still locks commands for that run, as before.
- **Chats from before this update count as unverified when an agent looks them up.** StarNet can't prove those old messages came only from you, so a run that recalls one works like a run that read a web page: in a chat you're watching it asks before running commands, and an unattended run skips them. Full Power runs you start yourself aren't affected. Chats from this version on are stamped and recall normally.
- **Coming back** is your lead's own report of what happened, with a way into the delegated work. A reload or restart doesn't count as being away.
- **Replies read properly everywhere.** Markdown answers render in DELIVERABLES, TO REVIEW and WORKFLOWS as they do in COMMS, *italics* included, and a text or markdown file the crew made opens as a readable page.

## Build mode & conveyors

- **Building is drag-and-drop.** Drag one machine onto another to lay a belt. Drag a machine onto empty floor to pick what goes there, or drag a belt's middle to branch it. Ctrl+drag a belt to bend it through a tile.
- **Select to move.** The MOVE tool is retired. Click a piece to select it, then drag it onto open floor. Shift+drag moves any piece.
- **Copy whole lines.** Drag a box (it picks up the belts it crosses) or double-click a machine to select its whole line. Ctrl+C / X / V / D copy, cut, paste or duplicate it with its belts, settings, briefs, budgets and crew. Right-click removes a machine or belt. On the Conveyors tab, keys 1-8 pick pieces.
- **SEND TO.** Drop a line's OUTBOX on another line's INBOX. Every job that finishes cleanly in that OUTBOX is handed on, and the next line works it with its own crew, job record and budget, so a real job on one line can start paid work on the next. A job crosses at most 4 lines. Old belts that joined two lines offer MAKE IT A SEND TO.
- **SPLIT THE JOB.** A SPLITTER can split one job into parts, one per branch, next to COPY TO EACH and TAKE TURNS. Branches that each feed one JOINER run at the same time and share the line's budget.
- **TOO LONG is shown before you pay.** A line longer than its budget is flagged on its INBOX, and the Workflow panel offers a key that raises the budget.
- **No circles.** A belt that would hand work back upstream is refused, except a LOOP's back lane. An OUTBOX never belts into an INBOX; that's what SEND TO is for.
- **Agents build lines in a few steps.** Ask for a line and the agent lays it out, routes and staffs it, then tells you anything it left unstaffed. BUILD YOUR OWN LINE hands you an INBOX to place.
- **SHIPPED counts saved job records.** Older deliveries with no saved record aren't counted, so the number can be lower than before.
- **BUILD MODE is much faster.** Placing pieces, undo, belts and renames no longer redraw the whole station, room edits redraw far less, and SAVE & EXIT hands the floor straight back.

## Look & feel

- **ROOM LIGHT is a 0-100 slider** in SETTINGS › LOOK & SOUND. Ctrl/Cmd + and − change TEXT SIZE, and Ctrl/Cmd 0 resets it.
- **Built-in voices sound natural** instead of always going through the machine effect, and no longer drop the end of long replies. Pick AUTO, NATURAL, COMMS or MACHINE under VOICE EFFECT in LOOK & SOUND.
- **Cleaner rails and cards.** Group rows read whole names ("ULTRON, CYPHER +3"), crew cards fit their rail, and delegated work wears the same glass as approval cards.
- **Menus and toasts stay out of the way.** Dock menus open above every window, and a toast never covers an open dock menu.
- **DELIVERABLES can be cleared when you're done.** ✓ DONE · CLEAR and CLEAR ALL take items out of the library, can be undone, and leave the files on disk. TO REVIEW folds.
- **New crew skins.**

## Speed & cost

- **The station draws smoothly whether or not StarNet has focus**: up to 60 frames a second while it's on screen, faster while you move the camera, nothing while minimized. The idle camera never takes over while you're working.
- **Leaner prompts.** The fixed part of every prompt now stays the same from turn to turn so providers can cache it, and a lead with no crew carries a shorter tool list. Fewer tokens per turn.
- **Claude Code runs are faster and cheaper.** One Claude Code process stays open for the whole run and gets only the new messages each turn, turns reuse the prompt cache, and a finished turn is no longer thrown away by the idle timeout.
- **Claude Code runs have a token ceiling.** A subscription turn costs $0, so the $ limits never stopped a runaway one. Each run now stops at 2,000,000 tokens by default (cache re-reads count 1/10); change it under CLAUDE CODE TOKEN CEILING in SETTINGS › APP & BACKUP › Runtime limits.
- **Background thinking costs less.** The station's own self-talk and after-run learning passes use the lowest reasoning effort the model offers.
- **Less freezing on busy stations.** Most prop edits no longer rebuild the whole station image, and a struggling computer draws less crew detail to stay responsive.
- **Web search doesn't hang on a dead station browser.** It's passed over in seconds and named in the answer.

## Reliability

- **Fewer silent stops.** An agent that says "I'll build that" and then does nothing is pushed to continue, an empty reply is retried once, and a file write too big for the output limit says to split it. Every stop says what happened and what to do, in COMMS (still there after a reload) and on Telegram and Discord.
- **A damaged spending record no longer blocks every capped run.** It's listed as DAMAGED RECORD in SETTINGS › SPENDING LIMITS, where you settle it; capped work waits until you do.
- **Interrupted runs that never recorded how they were billed** say BILLING SOURCE UNKNOWN instead of pointing you to your provider's dashboard.
- **Skills you approved and shared reach every crew member,** including workers that had drafted their own version.
- **A graphics reset keeps your station's art.** Props keep their current artwork and the floor recovers, instead of falling back to old art.
- **Local models:** Ollama models with strict chat templates, such as Qwen, no longer fail with "System message must be at the beginning" (#102). An Ollama model that runs out of memory stops retrying and can hand the turn to a fallback you set up on another server, and an Ollama server on another machine is named by its host.
- **CUSTOM connections take their endpoint URL** when you add them (#113), and clicking a provider that isn't set up opens its setup instead of switching your agents to it.
- **Switching to the Gemini connection keeps working** when a model is still saved in OpenRouter spelling (google/gemini-…, including :free and :thinking): it reaches the right Gemini model instead of failing (#98).
- **browser.upload picks the right file** (#104): the one in your current project, never a same-named private file. It refuses ambiguous inputs and says the file was selected, not that the site received it.
- **A file patch that doesn't match the file is refused** before anything is written, instead of overwriting the wrong code. Windows line endings are kept.
- **Checkpoint cleanup no longer gets skipped** (#107), and old checkpoints are kept until their replacement is saved.
- **ERASE EVERYTHING stays erased** (#101). Automatic recovery no longer brings an old station back after you erase or start fresh.
- **A locked connector store says why and offers START FRESH**, which sets the old files aside instead of deleting them.
- **Discord and Signal connect more reliably.** The Discord bot no longer needs the privileged message-content setting; pair it in a DM. A Signal bridge linked to your own number works through Note to Self.
- **No more stray system folders on Windows** from computer control, MCP servers and language servers.
- **The Update Center remembers an available update across restarts,** SKIP VERSION stays skipped, and with CHECK AUTOMATICALLY on, opening it checks for a newer version.

## Removed

- **SYSTEM › FIND and its Ctrl+K / Cmd+K shortcut are gone.**

## Security

Everything from 0.13.3 is included, plus more local hardening. Group chats and people messaging your bots can no longer make an agent search or quote your other conversations. The TypeScript language server, like Rust's, only starts for a project run you're watching. Update to get these fixes.

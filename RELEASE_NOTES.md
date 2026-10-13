# StarNet v0.13.3

**Before you update:** if you might ever go back to 0.13.2, save a station backup first (SETTINGS › APP & BACKUP › STATION BACKUP). 0.13.2 doesn't know SEND TO or SPLIT THE JOB and deletes those settings the next time it saves your station. If agents are working when you install, choose WAIT FOR AGENTS.

A big reliability and security update. Conveyor lines can hand finished work to other lines, building is drag-and-drop, and delegated work shows up where you asked for it. Agents carry more of a long chat forward, get caught when they claim a save they didn't make, build on the work you approved, and say why a run stopped. Local models, uploads, erase and checkpoints get fixes.

## Behavior changes

- **Building is drag-and-drop.** Drag one machine onto another to lay a belt. Drag a machine onto empty floor to pick what goes there, or drag a belt's middle to branch it. Ctrl+drag a belt to bend it through a tile. The BELT tool still works.
- **Select to move.** The MOVE tool is retired. Click a piece to select it, then drag it onto open floor. Shift+drag moves any piece.
- **Copy whole lines.** Drag a box (it now picks up the belts it crosses) or double-click a machine to select its whole line. Ctrl+C / X / V / D copy, cut, paste or duplicate it with its belts, settings, briefs, budgets and crew. Right-click removes a machine or belt. On the Conveyors tab, keys 1-8 pick pieces instead of the old tool keys.
- **SEND TO.** Drop a line's OUTBOX on another line's INBOX. Every job that finishes cleanly in that OUTBOX is then handed on. The target line works it with its own crew, job record and budget, so any real job, including RUN ONE REAL JOB, can start paid work on the next line. A job crosses at most 4 lines. An OUTBOX never connects to an INBOX with a belt, and a belt can't close a circle except a LOOP's back lane. Old belts that joined two lines offer MAKE IT A SEND TO.
- **SPLIT THE JOB.** A SPLITTER can now split one job into parts, one per branch, next to COPY TO EACH and TAKE TURNS. Branches that each feed one JOINER run at the same time and share the line's budget.
- **TOO LONG is shown before you pay.** A line longer than its stage budget is flagged on its INBOX. The Workflow panel offers a key that raises the budget.
- **SHIPPED counts saved job records.** Older deliveries with no saved record aren't counted, so the number can be lower than before.
- **Delegated work shows up as one live card in the conversation that asked.** It shows who is doing what, with Stop while it runs, Approve or Deny when a worker asks, and See work to unfold each worker's answer and what it did. A new Needs you list at the top of SESSIONS gathers every approval, question and failure.
- **Skill changes wait for you.** A skill an agent creates, changes or retires becomes a PROPOSED REVISION in AGENT SKILLS. It needs a passing evaluation and your approval before it's used. The current version keeps working meanwhile.
- **Spoken turns can use their own model.** Pick it under Voice chat model in SETTINGS › AI & MODELS. It answers COMMS with the speaker on and Telegram voice notes, without changing your typed-chat model.

## Fixed

### Memory and long chats

- **Long chats keep your earlier instructions.** Messages that no longer fit the model's window are carried forward in your own words, instructions first, instead of silently disappearing.
- **Recall prefers what you said most recently.** Remembered notes carry the date they were saved. The agent is told the newer note wins when two disagree. A new note that contradicts an older one is flagged so the old one can be retired.
- **"Saved" means saved.** An agent that says it saved or will remember something without writing it is told to save it. If it still doesn't, the run stops and says so. The "remembered" receipt lists only this run's own saves.
- **Forgotten memories stay forgotten** when you restore an older backup.
- **Approvals carry into the next design.** Approving work, including ★ KEEP THIS STYLE, records what was actually made: files, colours, fonts, image prompt and settings. Your newest approvals ride along on later runs. Image generation can use an approved image as a reference on OpenRouter, the ChatGPT plan and the OpenAI Images API, and says so when a connection can't.
- **Editing your main agent's operating-manual.md no longer leaves the old standing orders in its dossier.** The exception is a dossier entry you edited yourself. Dossier changes now reach the whole crew.

### Runs and delegation

- **Fewer silent stops.**
  - An agent that says "I'll build that" and then does nothing is pushed to continue, and says so if it still stalls.
  - An empty reply is retried once.
  - A file write too big for the output limit says to split it.
  - Stops say what happened and what to do, in COMMS (still there after a reload) and on Telegram and Discord.
- **A follow-up joins the running task.** In a direct chat on Telegram, Discord and other connected chat apps, a plain-text follow-up is added to the running task instead of cancelling it. "stop" or /stop still stops it.
- **Asking your lead to hand work to a named crew member now does it.**

### Local models, files and tools

- **Ollama models with strict chat templates, such as Qwen, no longer fail with "System message must be at the beginning"** (#102).
- **An Ollama model that runs out of memory stops retrying.** It tells you to free memory or pick a smaller model.
- **browser.upload picks the right file** (#104). It uses the file in your current project, not a same-named private file. It refuses ambiguous or disabled file inputs. It reports that the file was selected instead of claiming the site received it.
- **A file patch that doesn't match the file is refused** before anything is written, instead of overwriting the wrong code. Windows line endings are kept.
- **No more stray system folders on Windows.** Computer control, MCP servers and language servers now get the Windows system locations they need, so GPU and system caches stop creating stray folders.
- **Checkpoint cleanup no longer gets skipped** (#107). Size maintenance also runs when nothing changed. Git cleanup processes that hang are stopped. Old checkpoints are kept until their replacement is saved.
- **Agents working in a project find their own saved long output again**, and file search works on a single file.

### Erase, recovery and connectors

- **ERASE EVERYTHING stays erased** (#101). Automatic recovery no longer brings an old station back on the next start after you erase or start fresh. You can still restore an old station on purpose.
- **A locked connector store says why and offers START FRESH** instead of failing every sign-in. START FRESH sets the old files aside instead of deleting them. If this computer's credential store can't be reached and no sign-ins are saved yet, new sign-ins are saved unencrypted and the Connectors window says so.
- **Discord and Signal connect more reliably.** The Discord bot no longer needs the privileged message-content setting; pair it in a DM. A Signal bridge linked to your own number works through Note to Self. The setup guides are corrected.

### COMMS and deliverables

- **Files and images in replies work.** Files an agent names in a reply open, linked images show, and the transcript keeps following new messages unless you scroll up.
- **DELIVERABLES can be cleared when you're done.** ✓ DONE · CLEAR and CLEAR ALL take items out of the library, can be undone, and leave the files on disk. TO REVIEW folds, and group-chat strips share one tray.

### Station and display

- **ROOM LIGHT is a 0-100 slider** in SETTINGS › LOOK & SOUND. Ctrl/Cmd + and − change TEXT SIZE, and Ctrl/Cmd 0 resets it.
- **Less freezing on busy stations.** Most prop edits no longer rebuild the whole station image. A struggling computer draws less crew detail to stay responsive.
- **Built-in voices sound natural** instead of always going through the machine effect, and no longer drop the end of long replies. Pick AUTO, NATURAL, COMMS or MACHINE under VOICE EFFECT in LOOK & SOUND.
- **The Update Center remembers an available update across restarts.** With CHECK AUTOMATICALLY on, opening it checks for a newer version.

### Spending

- **Interrupted runs that never recorded how they were billed now say BILLING SOURCE UNKNOWN** instead of pointing you to your provider's dashboard.

## Security

This release tightens StarNet's local security. Local access checks are stricter. A run that has read outside content, such as a web page or a forwarded message, can't create or change routines or skills, and that content no longer feeds what agents learn on their own. Agents' file tools can't read well-known credential folders unless you give them Full Power. Importing a station config no longer brings in standing approvals to run commands, send or spend; they're skipped and listed in the import notes. The desktop app holds fewer raw permissions. Update to get these fixes.

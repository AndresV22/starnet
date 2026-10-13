# Austin Powers and Dr. Evil skins — verification

Runtime source: 7dd062343 (agent/austin-evil-skins-1013), based on integration 1ebdccccd.

Added Austin Powers and Dr. Evil to the existing skin picker, bringing the catalog to 53 entries. Each has eight standing directions, six walking frames in each direction, four seated directions, and a four-frame north-facing typing loop. Runtime and website assets match.

The initial art matched the nominal render height but was too broad. The final art uses the approved Secret Agent sprite as the actual body reference. Both south-facing silhouettes are 34 pixels wide, matching that reference; visible height is 76–77 pixels. The 144-pixel master canvas and 0.25 render scale remain consistent with the roster. Typing uses exact one-pixel forearm shifts on the seated source, with fixed head/body pixels.

Verification completed on the final artwork:

- Syntax and diff whitespace checks passed.
- Remaster import/website parity check passed: 52 remasters plus Pikachu.
- Eight focused test steps passed, including skin selection, accessibility, facing, asset loading, 32,946 sprite asset assertions, and 6,610 walking assertions.
- Independent review of all 128 runtime PNGs found no material clipping, detached-prop, scale, or mirror findings.
- In the seeded live app at localhost:9964, both picker buttons selected their skin, the actual floor body drew the corresponding approved set, all 13 sampled standing/walking/seated/typing poses per skin rendered, the backend acknowledged saving, and page reload restored the selection.
- After restarting the sidecar with the preserved seeded workspace, a fresh browser profile restored Dr. Evil from backend state and showed all 53 skins. No save conflict was present.

Full fast gate passed before and after merge: `npm run test:fast`, 1,139 steps, exit 0, on runtime source `7dd062343efd6c611ec19c7569abbb9fd31f22a8`. The integration branch fast-forwarded from `1ebdccccd014f1561086cbf94aaba3e9dbc89a20` to that source. Exact completion timestamps and log hashes are in `fast-gates.json`; source and document-preservation hashes are in `merge-receipt.json`.

The first post-merge attempt stopped at evidence hygiene because a task-owned duplicate documentation backup contained a key-shaped string. Only the temporary untracked backups were removed. The dedicated evidence lint and the complete post-merge gate then passed with no committed source changes.

The shared `qa/STATUS.md` and `docs/NEXT.md` contained another lane's in-flight edits. Both were preserved byte-for-byte; this dedicated digest records the merge without editing those owned files. No shared event/schema contract was changed.

Evidence: output/austin-evil-skins/{preview.png,proportion-comparison.png,live-floor.png,live-proof.json,restart-proof.json,fast-gates.json,merge-receipt.json}. Generation sources and exact typing recipes are saved in the same directory.

The source-lock refresh changes only the accepted source commit and the bytes/hash for the two additive data-shim catalog entries. Claim wording, verdicts, locators, and wave dispositions were preserved.

No installer or release artifact was built for this source change.

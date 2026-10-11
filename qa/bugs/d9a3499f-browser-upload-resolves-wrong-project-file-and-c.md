---
fingerprint: d9a3499f
slug: browser-upload-resolves-wrong-project-file-and-c
title: Browser upload resolves wrong project file and claims success without selection proof
surface: safecell
severity: P2
status: fixed
found: 2026-10-11
lane: ux-triage-1011
fix: 61117661631fb4e2be6450d100354f8a4cb05c72
origin: customer
report: https://github.com/androoAGI/starnet/issues/104
affected: Windows v0.13.2; trusted-project upload to Etsy listing photo control
family: browser-upload-selection-truth
installer: unverified
recovery: unconfirmed
---

# Browser upload resolves wrong project file and claims success without selection proof

## Symptom

The customer reports that browser.upload returns success for a readable PNG in a trusted project, but the Etsy listing photo remains empty. No thumbnail or matching upload network activity appeared. The customer did not publish or save the listing. This record covers the independently reproduced source path and selection-receipt faults; the exact authenticated Etsy failure remains unconfirmed.

## Repro

1. On Windows with Chromium installed, create a trusted project containing photo.txt with 19 bytes and a same-named private agent file containing 5 bytes.
2. Run `node test/browser-upload.e2e.test.js` against baseline browser.js at f2e1e91bb875938c1adaa0d11d596eeccc13e1c8. The fixture runs only local HTTP pages and uses synthetic, headless browser input.
3. Upload the relative photo.txt through a visible label. Observe which FileList metadata the local input/change handler receives.
4. Repeat on a visible button with two nearby inputs, a disabled input, and a page that clears its input after change.
5. On candidate 611176616, run `node test/browser-upload.run.e2e.test.js` for the real seeded sidecar/native registry/owned background server path.

## Evidence

Durable machine output: `qa/evidence/browser-upload-104/receipts.json` includes exact baseline, real-Chromium, and seeded-run output and candidate identity.

Baseline source selected the private decoy: expected [{name:"photo.txt",size:19}], got [{name:"photo.txt",size:5}]. Ambiguous and disabled controls each fired two file-selection events instead of refusing; the old summary claimed "uploaded". An absolute trusted-project path was rejected as illegal. The baseline replay loads the unchanged historical browser.js via a Node Module rooted at its original filename, then runs the same regression fixture.

Source anchors: `sidecar/index.js:19172` supplies the existing runPathTrust guard; `sidecar/tools/builtin/browser.js:3608` creates a separate read resolver without rerouting screenshot/PDF output; `sidecar/tools/builtin/browser.js:3836` resolves and validates all file paths before selecting; `sidecar/tools/builtin/browser-upload.js:59` runs selection and readback on the pinned CDP channel.

## Verdict

The source faults are corrected on the isolated candidate: upload uses the existing fs.read authority and host project context, never silently falls back to a private same-name file, refuses ambiguous inputs, and returns selection evidence rather than an upload-completion claim. A page-cleared input reports retained:false and event evidence. The site must still demonstrate its own accepted upload; filenames, sizes, and input events alone do not prove server delivery, a thumbnail, exact file-content hashes, or a saved listing.

No authenticated Etsy account, production customer data, external listing write, installer, or release was exercised. Customer recovery is unconfirmed. No GitHub issue was closed or commented on.

## Regression

Before fix, the real-Chromium fixture failed project-relative selection, ambiguous/disabled refusal, and truthful-receipt assertions as recorded above. After fix, `test/browser-upload.e2e.test.js` passed 17 assertions; `test/browser-upload.test.js` passed 21; `test/browser.test.js` passed 435; and `test/pathtrust.test.js` passed 73.

The real seeded sidecar native-tool run passed 9 assertions: shell_exec started an owned local page, browser_test_navigate/snapshot supplied its ref, browser_upload selected photo.txt with size 19, and browser_test_state independently read the local change handler's [{name:"photo.txt",size:19}]. The run emitted agent.run.end with reason done, 9 turns and usd 0; shell_bg_kill confirmed the fixture's three-process tree gone. No runtime exception was found in the sidecar output. The seed is the same committed onboarding fixture consumed by dev/seed.js, copied to an isolated SidecarFixture workspace; no real provider credentials are used.

An independent agent reviewed candidate 611176616 via Git objects and found no blocking issue in trust, symlink containment, input selection, pinned-tab behavior, or the cleared-input receipt. Full fast/http aggregate gates belong to the coordinating root lane and were not run by this lane.

## Sibling coverage

{
  "adapters": [
    {
      "target": "Chromium local file input",
      "state": "covered",
      "test": "test/browser-upload.e2e.test.js",
      "scenario": "Real label and unique-nearby selection, same-origin iframe, ambiguous and disabled refusal, multiple constraint",
      "gate": "http"
    },
    {
      "target": "Shared fs/path trust resolver",
      "state": "covered",
      "test": "test/browser-upload.test.js",
      "scenario": "Project/private/absolute roots, read scope, revocation, Full Access ownership/protected floors and escaping junction",
      "gate": "fast"
    },
    {
      "target": "Authenticated Etsy photo handler",
      "state": "blocked",
      "reason": "No customer account or external listing mutation was used; local FileList/event proof does not establish Etsy thumbnail creation or server acceptance."
    }
  ],
  "entrypoints": [
    {
      "target": "Production native tool run",
      "state": "covered",
      "test": "test/browser-upload.run.e2e.test.js",
      "scenario": "Seeded real sidecar, mock provider, owned shell background page, browser_upload and independent page change-handler readback",
      "gate": "http"
    },
    {
      "target": "Private unscoped upload",
      "state": "covered",
      "test": "test/browser.test.js",
      "scenario": "Private workspace path, traversal, absolute path without trust guard, missing file and consent flag",
      "gate": "fast"
    },
    {
      "target": "Signed-in station browser",
      "state": "blocked",
      "reason": "The same tool resolver and driver source are used, but no signed-in station profile was driven in this isolated candidate proof."
    }
  ],
  "displays": [
    {
      "target": "Model-visible selected-file receipt",
      "state": "covered",
      "test": "test/browser-upload.e2e.test.js",
      "scenario": "Selection-only summary, FileList metadata and observed input/change events; explicit remote acceptance limitation",
      "gate": "http"
    },
    {
      "target": "Page-authored input metadata fence",
      "state": "covered",
      "test": "test/browser-upload.test.js",
      "scenario": "Input identity is fenced as external data and a legacy acknowledgement cannot claim selection",
      "gate": "fast"
    }
  ],
  "lifecycle": [
    {
      "target": "Input cleared by page after change",
      "state": "covered",
      "test": "test/browser-upload.e2e.test.js",
      "scenario": "Selection event retained as evidence with retained:false; clearing never becomes remote upload success",
      "gate": "http"
    },
    {
      "target": "No selection and tab disappearance",
      "state": "covered",
      "test": "test/browser-upload.test.js",
      "scenario": "Empty FileList with no matching event fails after CDP ack; REF_TAB_CLOSED propagates and objects released",
      "gate": "fast"
    },
    {
      "target": "Installed Windows customer recovery",
      "state": "blocked",
      "reason": "Candidate branch was not packaged or installed; v0.13.2 customer environment and original PNG remain unverified."
    }
  ]
}

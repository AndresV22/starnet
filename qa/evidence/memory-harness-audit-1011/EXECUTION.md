# Memory and learning execution plan

Baseline: a20ffa71fd04691805ea55c7d08165438dd7ac6f. Audit: ../memory-harness-audit-1011/REPORT.md.

This lane implements the five accepted recommendations. It makes no product-perfection or release-readiness claim.

| Work | Implementation | Acceptance proof |
| --- | --- | --- |
| 1. Trusted learning after research | Capture current owner text before attachment expansion; separate trusted evidence from external transcript; durable receipts for captured/skipped learning | Real sidecar research + correction, restart, follow-up; injected attachment instructions never saved as owner preference |
| 2. Stable approved skills | Separate durable pending candidates, retain approved active body; digest-bound evaluation and explicit promotion | Active remains usable through propose/reject/restart; stale receipt and content change cannot promote |
| 3. Retrieval and sharing | Explicit agent/project/station skill scope; global owner standing preferences; bounded pinned recall; lexical normalization and full history search | Paraphrase regression, more than eight preferences, scope privacy boundaries, shared skill discoverability |
| 4. Learning packets | Structured provenance, corrections, arguments, outcomes, loaded skills and checks; durable bounded packets | Long tool output cannot evict correction; restart preserves evidence; external data cannot become trusted input |
| 5. Behavioral evaluation | Host-owned task suites, baseline/candidate runs with exact behavior checks and held-out cases; durable receipts | Improvement/no regression required, insufficient evidence fails closed; live evaluator route and skill promotion |

Isolation: root owns sidecar/index.js, trusted-learning.js, integration tests/manifests and this evidence folder. Retrieval, skill lifecycle, and learning/evaluation agents each have separate worktrees and disjoint source ownership. Shared event/schema contracts remain with their owner. Coordinator candidate 8c2b8c547 is pending independently; inspect its committed deltas before integration.

Verification: syntax, focused regressions, complete fast and HTTP gates, real isolated sidecar runs and restart checks. Retain failures and actual receipts. Never start a second sidecar against an existing profile. Disk-limited sparse worktrees share existing dependencies read-only. Trunk integration is serialized with the coordinating lane; no direct feature edits there.

# Growth-OS — Unified UX & Automation Specification v1

> Status: **DESIGN DRAFT / Docs-only PR — NOT implementation or merge authorization**
>
> Product direction: **One Interface, Multiple Platforms**.
>
> Visual reference: **Growth-OS Visual Design Reference v1** (approved concept, not existing production UI).
>
> Editable Figma: https://www.figma.com/design/jOfuk31i2BrJmMvXs25B59

## North star

「讓更多人看見你的作品。」 Users start with a single website/YouTube URL. The system analyzes, prioritizes evidence-backed improvements, requests necessary consent, applies platform-supported changes, verifies readback, and tracks outcomes. The aim is better discoverability, **not guaranteed traffic or rankings**. The workflow must remain understandable to a novice, particularly video creators and solo entrepreneurs.

## Product boundaries and ownership

- Product direction and high-fidelity Figma prototype: ChatGPT + Owner approval.
- Engineering integration: Dot → Codex → independent reviewer / CI, **only following explicit handoff and capability audit**.
- First adapter candidates: **WordPress and YouTube**. A concept screen does not prove that an adapter/API permission works.
- Preserve existing engineering work; this specification PR changes documentation only.

## One workflow, five screens

1. **Entry / URL:** single URL field, detection, minimum setup. Never require technical SEO fields before analysis.
2. **Growth starting report:** prioritize the top 1–3 sourced opportunities; clear confidence and meaningful first action.
3. **Review / diff:** original vs proposed content, fact/source evidence; approve draft, request revision, defer. **Approving a draft does not authorize public publishing**.
4. **Automation Control Center:** first platform connection, grant scope, review-first/default vs bounded autonomy/explicit opt-in, pause/resume, activity log, restore.
5. **Outcomes:** successful platform-verified updates, separately sourced performance metrics and reporting periods, verified Growth Milestones.

A shared assistant answers exactly: (a) What is AI doing now? (b) What must the user do? (c) What will AI do next? Show at most one primary request for user action.

## User-facing state machine

| User state | Meaning | User action | Exit |
|---|---|---|---|
| ANALYZING | Content is being evaluated | None | Draft / insufficient evidence |
| WAITING_FOR_REVIEW | Sourced suggestion ready | Approve, revise, defer | Grant check / revision |
| EXECUTING | Explicit publish authorization has been verified | None | Verified or assistance |
| VERIFIED | Fresh remote readback matches intended change | None | Tracking / next opportunity |
| NEEDS_ASSISTANCE | Missing grant, failed/unknown write, revision conflict | One concrete recovery action | Revalidate before resume |

Internal states: `RECEIVED → ANALYZING → DRAFT_READY → REVIEW_PENDING → DRAFT_APPROVED → AUTH_REQUIRED? → AUTHORIZED → QUEUED → PRECHECKING → APPLYING → VERIFYING → VERIFIED → TRACKING`.

Exception states: `REVISION_REQUESTED, DEFERRED, PAUSED, AUTH_EXPIRED, CONFLICT, RESULT_UNKNOWN, VERIFY_FAILED, BLOCKED, RECOVERY_REQUIRED, RESTORE_PENDING, RESTORING, RESTORE_VERIFIED, RESTORE_CONFLICT`.

## Authorization and autonomy

Treat **platform connection**, **draft approval**, and **publication authorization** as distinct decisions. Review-first is default; each public change requires valid publish consent. Bounded autonomy requires active opt-in with platform/account, target assets, allowed fields, max operations/time period, allowed schedule, grant expiry, and grant revision. No implicit scope expansion. API-scoped consent and connection flows must be appropriate to the platform; never collect owner account passwords in chat.

- WordPress: only specifically permitted page/post/content fields; no prices, inventory, checkout, mass-delete changes in v1.
- YouTube: only platform-supported, account-authorized metadata fields; no claim of video editing/automatic new footage or guaranteed discovery.
- Capability-gate every promised action until platform implementation and permission have been verified.

## Pause, resume and restore

- **Pause:** atomically stop dispatching new write jobs; dispatched remote calls may finish. Reconcile their results before displaying final status.
- **Resume:** recheck platform connection, grant, evidence, target revision, budget and remote state. Never blindly retry an unknown outcome.
- **Restore:** maintain immutable pre-change field snapshot and remote revision. Show exactly what will be restored. If a user or third party has modified the content, block silent overwrite. Execute compensating changes only with necessary authorization; fresh-readback verifies restoration. External caches/views are not reversed.

Every mutation uses a unique `operation_id`, attempt IDs, tenant/asset partition, concurrency guard and audit trail. HTTP 2xx does **not** count as verified success; `RESULT_UNKNOWN` requires fresh remote readback before retry.

## Events and audit

Core events: `url_received, platform_detected, analysis_completed, draft_ready, draft_approved, publish_grant_created, publish_queued, publish_dispatched, remote_readback_verified, publish_result_unknown, permission_revoked, automation_paused, automation_resumed, restore_requested, restore_verified, metric_observed`.

Record actor, tenant, platform/connection, asset, operation ID, scoped grant snapshot, evidence IDs, pre/post revisions, proposed/executed fields, attempts, timestamps and readback. Prevent leaking credentials and cross-tenant assets.

## MVP vs future

**V1 design targets:** shared desktop shell and assistant, URL routing, evidence-backed recommendations, content diff/review, candidate WordPress & YouTube capability-gated adapters, review-first publishing, explicit bounded autonomy only when verified, pause/resume, conflict-aware restore, readback verification, basic milestones and authorized metrics.

**Later:** other platforms, bulk/multi-account, rich video editing, social scheduling, advanced attribution, mobile-native polish. Responsive layout remains a v1 quality requirement; mobile-native features may follow later.

## Design components — target inventory (not all built)

Current Figma seed library has **six components**: primary button, secondary button, verified status, assistance status, opportunity card, and guidance panel. This is a **starter set, not an adequate release-ready library**.

Required v1 families (expand by variants/states, rather than unique per-platform components):

1. Design tokens: semantic colors, spacing, radius, typography, elevation.
2. Navigation: app shell, sidebar item, breadcrumb, stepper.
3. Inputs: URL input (valid/invalid/loading), radio/checkbox, switch and scope selector.
4. Actions: primary/secondary/destructive buttons (default, disabled, loading, focus).
5. Containers: content card, analysis opportunity card, source-evidence disclosure, diff panel.
6. Status: analyzing, waiting, executing, verified, needs-assistance, pause.
7. Platform identity: WordPress/YouTube badge and permission capability row.
8. Governance: grant summary, confirmation dialog, audit entry, restore comparison.
9. Feedback: alert, inline error, empty state, retry state, toast.
10. Results: metric card with period/source, milestone item, timeline entry.
11. Assistant: right panel and narrow-screen collapsed variant.

These families are a design **target**, not evidence that Figma already has completed reusable instances across all screens.

## Required acceptance tests

- [ ] WordPress and YouTube URL journeys reuse one shell and platform-specific capability wording.
- [ ] All five screens and common exception states share reusable components and correct typography/spacing.
- [ ] Interaction prototype navigates Entry → Report → Diff → Connection/Grant → Authorized update → Verified outcome; exception and restore flows also navigable.
- [ ] Draft approval alone never performs public writes.
- [ ] Expired/revoked grants block writes, and description-only grant cannot change a YouTube title.
- [ ] WordPress content permission cannot change price, stock or checkout.
- [ ] Pause blocks new dispatch; in-flight work is reconciled.
- [ ] Network timeout/unknown result performs readback and does not blindly duplicate the write.
- [ ] User-edited content raises restore conflict; no silent overwrite.
- [ ] Verified / milestone appears **only after platform readback**.
- [ ] Metrics show data origin and comparison dates; no fake outcome or guaranteed ranking.
- [ ] Desktop and responsive mockups compare against the approved visual reference; accessibility and text spacing inspected.

## GitHub integration policy

This file is **design documentation**, not implementation authorization. Keep as **Draft PR** until Owner approves the completed Figma interactive prototype, UX acceptance and Dot's platform-capability gap assessment. Blueprint contains strategy and should link to this spec once approved. Do not merge this PR automatically or start implementation merely because it exists.

## UX continuation checkpoint — 2026-10-23 (Asia/Taipei)

**Owner pre-authorization, limited to UX work:** continue refining Figma, interactive prototype and this docs-only Draft PR without interrupting engineering; no authority to merge the PR, change product source, deploy, connect production accounts, or publish customer content.

### Progress evidenced in Figma

- Premium concept screens exist for entry, growth report, review, automation control center, recovery and outcomes (Figma file above).
- Six seed components exist in `12 · Shared UI Components v1`, but complete variants, tokens and responsive behavior remain open.
- Shared guidance-panel component instances were applied to five premium screens; the entry screen's guidance panel still needs convergence to a shared component.
- Six-screen navigation reactions were created. A navigation-button placement problem was found and revised; further screenshot-based QA is pending.
- The prototype remains a **navigable walkthrough, not functional grant/publish/restore simulation**.

### Current blocker

Figma MCP reported **Starter plan tool-call limit reached** on 2026-10-23. No further Figma mutations or validation can be claimed until access resumes or the plan/access issue is resolved. Preserve existing work; do not recreate the file or bypass this restriction.

### Resume priority and concrete exit criteria

1. Audit CTA bounds and overlaps on all six screens at desktop dimensions; ensure no CTA overlays legal/status copy and every CTA lies inside its owning card. Capture visual proof.
2. Replace remaining duplicated assistant, button, status and card layers with actual Figma instances. Confirm instance counts and component references.
3. Complete state variants for buttons, URL field, grant scope, publish verification, paused/blocked/unknown outcomes and restore-conflict dialogs.
4. Build the WordPress and YouTube permission-specific branches. Ensure draft approval is never equivalent to publish authorization.
5. Add narrow desktop and mobile responsive frames and test Chinese line wraps.
6. Validate interactive paths for review-first, bounded autonomy, permission expiry, unknown remote result, and conflict-aware restoration.
7. Compare each screen with **Growth-OS Visual Design Reference v1** against spacing, legibility, hierarchy, colors, density and consistent assistant guidance; record findings as pass/fail.
8. Submit Owner-reviewable design screenshots + prototype link + UX test matrix. Only after design acceptance and Dot's platform audit should integration tasks begin.

### QA checklist for the next session

| Check | Passing requirement |
|---|---|
| Button geometry | No clipping or overlap at documented viewports; clickable within expected container |
| Text spacing | Traditional Chinese titles, subtitles and long guidance text do not collide |
| Shared components | Screen instances link to reusable library components, not copied primitives |
| Prototype actions | No impossible transitions from no-grant directly to verified publishing |
| Error states | Failed/unknown writes remain blocked until remote readback |
| Rollback | User edits / revision conflicts block silent restoration |
| Claims | Prototype/mocks do not imply live YouTube or WordPress integrations |
| Visual fidelity | Screenshot-based comparison against approved reference, gaps documented |

**Do not close this checkpoint or mark UI/UX complete until all corresponding validation artifacts exist.**

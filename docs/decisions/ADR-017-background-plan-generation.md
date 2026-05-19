# ADR-017: Background Workboard Plan Generation

## Status

Accepted — amended 2026-05-19 (see "Amendment: Waiting Shell")

## Date

2026-05-19

## Amendment: Waiting Shell (2026-05-19)

Real use exposed two problems with the original decision: (1) on "Review
plan" the composer closed instantly with no acknowledgment — users did not
understand what happened and only noticed the header indicator by accident;
(2) the global auto-route effect made a ready plan appear abruptly, jarring
when the user was mid-task on the Workboard (e.g. composing a second request).

This amendment supersedes section 1 (immediate close) and the auto-route
consequence. The new model ties the open/wait/background intent to an explicit
user action:

- **Submit → waiting shell.** The composer closes and a modal opens at the
  **full size of the review dialog**, showing a **skeleton** placeholder plus
  honest liveness (elapsed time, rotating "drafting" copy) and a single
  **"Continue in the background"** button. Esc and backdrop do **not** close it
  — the only deliberate exit is that button. This removes the accidental/silent
  close that caused the "where did the screen go?" confusion. No resize jump:
  the wait state already occupies the eventual review size.
- **If the user waits** (does not press the button): when the op becomes ready
  the **same shell, same size** fills in place — skeleton is replaced by the
  real review content. On failure the skeleton is replaced in place by an error
  state with **Retry** (and the background button). Because the user was
  deliberately watching, this is continuity, not a surprise.
- **"Continue in the background"**: the shell closes, the user is free, the op
  continues, and readiness/failure surface only via the existing top-center
  toast + persistent queue indicator/drawer. **No auto-open.**
- **The global auto-route effect is removed.** Auto-advance happens *only*
  inside the open waiting shell for the op being waited on. A backgrounded or
  not-actively-watched op never opens itself.
- **Concurrency**: the waiting shell is modal. To start another plan the user
  presses "Continue in the background" (one click) to free the composer. This
  intentionally separates "I am waiting for this one" from "I am queuing
  several" — the free parallel generation from section 3 is preserved; it is
  reached through the background button rather than while a wait is on screen.

Rationale: the user's intent (wait vs. go do other work) is expressed by their
action on the waiting shell, so both original problems collapse into one
coherent contract — deliberate watchers get the result in front of them;
everyone else is notified and pulls on their own schedule. Honest liveness
(ADR-017 §7) and the staleness guard (§3) are unchanged.

## Amendment: Collapsible Review Detail Panel (2026-05-19)

The review dialog opened with the right-hand work-item detail panel always
expanded, overwhelming the user instead of focusing them on the plan. The panel
becomes a hide/show panel, decoupled from item selection:

- A new dialog-local `panelOpen` boolean, **default closed**, reset every time
  the dialog opens (focus is the screen's default posture, not a remembered
  preference). Lives in the dialog, not in `draftReview`.
- A single persistent toggle in the dialog header (only rendered when a plan is
  present — not in the waiting/failed state). Closed → header full-width plan
  overview; open → the existing two-column layout. Smooth expand/collapse.
- Selecting a work item only changes `selectedItemId`; it never opens a hidden
  panel ("clicking around the plan must not bring the panel back"). The
  selected card keeps its highlight while hidden so reopening is predictable.

## Amendment: Visual Conformance of Plan Dialogs (2026-05-19)

The composer and review/waiting dialogs had drifted from DESIGN.md: editable
inputs, read-only context blocks, and the dialog body all used the same
`bg-background`, so fields read as ambiguously disabled and the eye had no
hierarchy; the dialogs were also near-fullscreen (`max-w-7xl`/`6xl`, forced
~100vh height) against the system's compact-surface ethos. Bring them back to
the system (not a redesign):

- **Three-layer surfaces (DESIGN.md):** dialog body on a calm ground; editable
  inputs on `bg-card` (surface-card) with a clear border and a focus `ring`;
  read-only context blocks (e.g. "Your original request") on a canvas-soft
  tone with no input affordance. The three layers must be instantly
  distinguishable: ground < read < edit.
- **Size:** drop the forced height — content-driven with a `max-h` cap and body
  scroll. Width capped to a readable measure: review `max-w-3xl` when the
  detail panel is closed, `max-w-5xl` when open (reuse the existing
  `panelOpen`); composer to a comparably narrow width.
- **Typography/density (minimal):** align to the existing DESIGN.md scale
  (component/section title, not app-title), raise field-label contrast (the
  faint `text-xs muted-foreground` labels are part of the readability
  complaint), tighten oversized padding. No new tokens or scales.

Scope: only the New Request (composer) and review/waiting dialogs; no other
screen. This is conformance to DESIGN.md, applied with existing tokens.

## Context

When a user submits a Workboard request (a new request, or a follow-up that adds
continuation work to an existing work run), the planner runs and produces a
draft plan to review before any agent starts.

Today this is a blocking modal experience. The submit/regenerate button is
disabled and a spinner shows while the call is awaited. Investigation of the
current flow established hard constraints:

- Plan generation is a single opaque, buffered request/response to the provider
  CLI (`--output-format json`), typically 5–30s, with a 90s timeout. There are
  **no intermediate progress events** streamed back to the renderer. Any
  step-by-step progress UI would be fabricated, which conflicts with the
  DESIGN.md principle "clear status over decorative flourish / say what the user
  can understand now".
- The `await` lives inside the dialog component. If the user closes the dialog
  or navigates away, the promise is abandoned, the child process keeps running
  to completion, and the result is discarded. There is no request-id keying,
  job registry, or cancellation.
- The draft plan lives only in app-level renderer state
  (`workboardDraftReview`), which survives screen navigation but not an app
  restart, and is lost on discard.
- The notification scaffolding largely already exists: a centralized
  top-center toast system (ADR-012), a notification policy bridge that watches
  the draft plan globally, and a defined "Plan ready" event with a "Review
  plan" action.

The user pain is specifically: (i) the UI feels frozen — no liveness signal
during the wait; and (iii) loss of control — the user wants to dismiss the wait,
keep working (e.g. trigger an on-call alert plan and a report plan in parallel),
and be notified when each plan is ready, returning to review on their own
schedule. Perceived duration (ii) and result blindness (iv) are explicitly out
of scope. This restores the spirit of an older non-blocking flow within the
modern toast infrastructure.

## Decision

Convert plan generation from a blocking modal into a non-blocking background
operation, surfaced through a global queue.

### 1. Surface model — dismiss-and-continue (model C)

On submit, the composer modal closes immediately. Plan generation becomes a
fire-and-forget background operation owned at the app level, not the dialog.
The user is never trapped in a modal during the wait.

### 2. No active cancel in v1

Passive dismissal continues generation and notifies on completion. There is no
explicit cancel action in v1. If the user dislikes the resulting plan they
discard it through the existing flow. A correct active cancel (real child
process kill via a job registry) is deferred to a later, dedicated change —
explicitly not a soft/fake cancel.

### 3. Free parallel generation + accept-time staleness guard (model d)

Generation is fully unconstrained: any number of new-request and continuation
plans may generate concurrently; no per-target lock. The only collision risk is
logical and occurs solely at acceptance of a **continuation** plan whose target
work run changed since that draft was generated (a stale-plan merge). Guard it
at the single point it matters: when accepting a continuation plan, if the
target run changed since the draft was generated, do not silently merge —
present the staleness to the user ("this plan was prepared against an older
state of the work run; regenerate against the current state, or apply anyway").
The decision stays with the user. Each continuation draft carries a run version
marker captured at generation time; acceptance compares it. New-request plans
have no such guard (no shared target, no collision).

### 4. Persistence — ready plans only (model 2)

Completed-but-unresolved draft plans are persisted durably (surviving app
restart) together with their target (new request, or which run they continue)
and the run version marker from (3) — one mechanism serves both restart
survival and the staleness comparison. In-flight generations and failed
operations are **not** persisted; a child process dies on restart and a stale
failure context is noise. This is a conscious update to ADR-007, which did not
persist drafts.

### 5. Queue surface — header indicator + global drawer (model A)

A persistent header indicator (e.g. "2 ready · 1 generating") opens a wide
drawer (left or bottom) reachable from any screen. Each row is one operation
with its state (generating / ready / failed) and actions (Review / Discard /
Retry). The existing top-center "Plan ready" toast is kept as the transient
nudge; the indicator+drawer is the durable, can't-miss source of truth. The
toast action must open the specific plan's review dialog, not merely navigate
to Workboard. Both read the same app-level multi-operation state.

### 6. Failure handling — transient failed entry + retry (model 1)

On failure (90s timeout, provider not logged in, JSON parse error, non-zero
exit), the operation becomes a transient red "failed" entry in the drawer with
the error and a Retry action, plus a one-time failure toast. Failed entries are
not persisted (consistent with (4)). Retry re-triggers the same stored request
as a new operation, capturing a fresh run version marker.

### 7. Liveness copy — honest coarse phase + reassurance + elapsed (model b)

The generating state shows the one real coarse phase boundary that exists
("Preparing…" during fast prompt/agent assembly, then "Drafting your plan with
&lt;provider&gt;…" for the long opaque call), gently rotating reassurance copy,
and an elapsed-time counter. No countdown and no estimated duration (5–30s
variance with a 90s ceiling makes any estimate a likely lie). No fabricated
sub-steps. The same state feeds both the drawer row and the header indicator.

## Alternatives Considered

- **Keep modal but make it dismissable (model A-surface)**: rejected — a
  dismissable modal is not discoverable; the user still perceives a locked
  modal, failing pain (iii).
- **Revert to fully inline composer/status (model B-surface)**: rejected for
  v1 — a large Workboard rewrite for the same user benefit model C delivers
  surgically; can evolve here later.
- **Fabricated progress steps**: rejected — dishonest, violates DESIGN.md;
  erodes trust in all progress indicators once noticed.
- **Real streaming progress (stream-json + event parsing + IPC events)**:
  rejected for v1 — large architectural investment aimed at result-blindness
  (iv), which is out of scope. The honest coarse phase + elapsed counter solves
  the actual (i) pain.
- **Single-operation lock / supersede on concurrent submit**: rejected —
  contradicts the user's real workflow of intentionally running independent
  plans (on-call alert + report) in parallel.
- **Per-target generation lock for continuations (model c)**: rejected — cages
  the user at the wrong point; generation is harmless, the collision is only at
  acceptance.
- **No guard at all (model a)**: rejected — silent stale-plan merges can
  corrupt a run's dependency graph without the user understanding why; the
  guard protects against an invisible race, not user judgment.
- **Full persistence incl. in-flight resurrection (model 3)**: rejected —
  process resurrection is disproportionate to the (i)/(iii) pain.
- **Toast-only failure / toast-only queue (model 2-failure)**: rejected —
  recreates the "is it frozen?" uncertainty if the toast is missed.
- **Persisted failures (model 3-failure)**: rejected — stale failure context is
  noise; persist only the valuable artifact (ready plans).
- **Static single liveness line (model a-liveness)** and **estimated duration
  (model c-liveness)**: rejected — the former under-addresses long-wait
  uncertainty; the latter lies under high variance.

## Consequences

- The `await` moves out of the dialog into an app-level, request-id-keyed
  background operation controller; completion routes results into the existing
  draft-review state, reusing the ADR-012 notification bridge.
- New durable state: a minimal table (or equivalent) for ready draft plans plus
  target and run version marker. Consistent with the minimal-persistence
  policy — directly required by this UX, not speculative. Updates ADR-007's
  draft-lifecycle stance; relates to ADR-012 (toast action must deep-open the
  plan, no longer just navigate).
- New UI surface: header indicator + global drawer with per-operation state and
  actions; toast becomes a complement, not the sole channel.
- Continuation acceptance gains a staleness comparison step; new-request
  acceptance is unchanged.
- Deliberately deferred: active cancel with real process kill (must be done
  properly later), real streaming/step progress, inline composer rewrite,
  in-flight resurrection across restart.
- Restart loses in-flight generations and failed entries by design; the user
  re-triggers them, acceptable since no plan existed yet.

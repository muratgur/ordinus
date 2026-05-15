# ADR-012: Centralize Toast Notification Policy

## Status

Accepted

## Date

2026-05-15

## Context

Ordinus is adding more long-running and cross-surface workflows. A user can start Workboard
planning, leave the Workboard, and continue working in Agents, Conversations, Schedules, or another
surface while agent work continues in the background.

Those workflows need timely feedback when something meaningful happens:

- A draft Workboard plan is ready for review.
- A Work Run is waiting for user input.
- A whole Work Request has completed.
- A Work Request needs attention because one or more Work Items failed or were cancelled.
- A future Conversation agent reply arrives while the user is elsewhere.
- A future Schedule or Agent event needs the user's attention.

If each module directly opens its own global toast, Ordinus will accumulate inconsistent behavior:

- Duplicate or noisy notifications.
- Different dedupe rules per module.
- Toasts appearing while the user is already on the relevant screen.
- Feature screens mixing local UI state with global attention policy.
- Harder future work when Conversations, Schedules, Agents, and Workboard need similar rules.

Toast notifications are not just a visual primitive. They are a product-level decision about when to
interrupt the user's attention.

## Decision

Use a centralized toast notification policy layer for product-level toast decisions.

Feature modules must not directly trigger global toasts for workflow events. Instead, the app-level
notification policy bridge observes module state, evaluates meaningful state transitions, dedupes
events for the current session, and calls a display-only notification adapter.

The first implementation applies this policy to Workboard notifications. The same pattern should be
used for Conversations, Schedules, Agents, and future modules.

### Separation Of Responsibilities

Keep two responsibilities separate:

- **Display adapter:** `notify.success`, `notify.info`, `notify.attention`, `notify.error`, and
  `notify.dismiss` own how a toast is rendered through the UI library.
- **Policy evaluator:** module-specific policy code decides whether a toast should exist for a
  specific state transition.

The display adapter must remain intentionally thin. It should not decide whether a Workboard plan,
Conversation reply, Schedule event, or Agent status change deserves a toast.

### App-Level Policy Bridge

Run the notification policy bridge at the app level, inside the router, so it can access:

- The active route.
- Session-level seen and dedupe state.
- Navigation actions for toast buttons.
- Module snapshots or draft state that must survive route changes during the current app session.

The bridge may host multiple policy evaluators, one per module or workflow area. Each evaluator
should be small, deterministic, and focused on product events for that module.

### Feature Modules Do Not Own Global Toasts

Feature screens such as Workboard, Conversations, Schedules, and Agents should not call global
`notify.*` APIs for workflow events.

They may still show local UI feedback inside their own surface:

- Inline form validation.
- Dialog-level errors.
- Screen-level banners.
- Button loading states.
- Local empty states.

Those local messages are not global notifications. They explain the current surface. Global toast
notifications are for attention-worthy workflow events that may matter while the user is elsewhere.

### Notify Only Meaningful Attention Events

Global toasts should be reserved for meaningful state changes, not every small update.

Appropriate examples:

- A draft plan is ready for review.
- A run requires user input.
- A whole Work Request completed successfully.
- A whole Work Request reached a terminal state with failed or cancelled items.
- A conversation response arrives while the user is not on that conversation surface.
- A scheduled run needs attention.

Inappropriate examples:

- Every individual Work Item completed.
- Routine polling refreshes.
- Baseline state loaded on app startup.
- A toast duplicating a visible dialog or board state on the active route.

### Suppress Toasts On The Active Surface

When the user is already on the relevant route, the relevant surface should usually provide feedback
through its own UI. The policy layer should suppress redundant global toasts for that module while
the surface is active.

For example:

- Workboard route active: the draft review dialog, board state, drawer, or inline message is enough.
- Another route active: a Workboard toast can bring the user back with an action such as
  **Review plan** or **Open Workboard**.

If a module needs an exception to this default, the exception must be explicit in the policy
evaluator.

### Session-Level Dedupe

Toast dedupe is session-level.

The policy layer should remember emitted or intentionally suppressed events for the current renderer
session only. It should not add a database table, migration, durable notification center, or restart
recovery just to preserve toast history.

Stable dedupe keys should be based on product identifiers such as:

- Work Request id.
- Work Run id.
- Input Request id.
- Draft plan signature.
- Conversation turn or response id.
- Schedule run id.

The same logical event should not reappear because of polling, observability replay, route changes,
or repeated snapshot refreshes.

### Baseline Does Not Notify

When a policy bridge first mounts, it may load module snapshots as baseline state. Baseline loading
must not create toasts.

Policy evaluators should generally operate on `previous -> next` transitions. A snapshot that was
already true before the policy layer started is not a new user-facing event.

### Navigation Actions Stay Coarse

Toast actions should navigate to the relevant product surface. They should not require each feature
module to expose internal UI commands to the toast layer.

Initial action examples:

- **Review plan** navigates to Workboard.
- **Open Workboard** navigates to Workboard.
- **Open conversation** navigates to Conversations.

Deeper links, selected run restoration, or conversation focus can be added later, but the first
policy contract should stay coarse and stable.

## Workboard Policy

Workboard is the first policy consumer.

The Workboard policy emits:

- **Plan ready:** A draft plan appears from no plan. Action: **Review plan**. Dismiss when the plan
  starts or is discarded.
- **Input needed:** A new pending Work Run input request appears. Action: **Open Workboard**.
- **Work completed:** A Work Request reaches terminal state and every Work Item completed.
- **Work needs attention:** A Work Request reaches terminal state and at least one Work Item failed
  or was cancelled.

The Workboard policy does not emit a toast for each individual completed Work Item.

The Workboard route suppresses Workboard toasts because the board, drawer, and draft review dialog
already provide local feedback. The Workboard navigation badge may still indicate that a draft plan
is ready.

## Alternatives Considered

### Let Each Module Trigger Toasts Directly

Each feature screen could import `notify` and open toasts when its own state changes.

Pros:

- Fastest to implement for one screen.
- Keeps the first feature patch small.

Cons:

- Duplicates dedupe, route suppression, and action navigation logic.
- Makes notification behavior inconsistent across modules.
- Makes it easy for screens to show global toasts while the user is already looking at the relevant
  state.
- Couples local UI components to global attention policy.

Rejected because Ordinus is explicitly becoming a multi-surface command center.

### Add A Durable Notification Center Now

Ordinus could persist every notification and expose a notification inbox.

Pros:

- Restart-safe notification history.
- A place to inspect past events.

Cons:

- Requires new persistence model and UI before the product need is clear.
- Risks turning lightweight toast policy into a broader inbox feature.
- Adds migration and data-retention questions unrelated to the current route-change problem.

Rejected for now. Toast dedupe is session-level, and durable notification history can be revisited
when the product has a clear notification-center model.

### Use Only Inline UI And No Global Toasts

Each surface could show state only inside its own screen.

Pros:

- Very simple.
- No risk of toast noise.

Cons:

- Fails the cross-surface workflow. Users can start work in one module, leave, and miss meaningful
  progress or blockers.
- Recreates the "work went into the void" experience that Workboard notifications are meant to
  solve.

Rejected because Ordinus needs to make background agent activity visible while keeping the user in
control.

## Consequences

- Product-level toast behavior has one architectural home.
- Future modules should add policy evaluators instead of calling `notify` directly for workflow
  events.
- Module screens remain responsible for local, inline feedback.
- Toasts become less noisy because route suppression and session dedupe are shared defaults.
- The app can evolve toward richer action routing later without changing every feature screen.
- No database migration or durable notification model is introduced by this decision.

## Implementation Notes

- Keep the central display helper small and UI-library specific.
- Keep module policy evaluators pure where practical.
- Use typed module snapshots and stable product ids for dedupe keys.
- Treat observability replay and polling refreshes as sources of snapshot changes, not as direct
  toast triggers.
- Document any future module exception explicitly in that module's policy evaluator.

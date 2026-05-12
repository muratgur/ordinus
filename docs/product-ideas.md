# Product Ideas

This document captures early product ideas before they are promoted into issues,
specs, or ADRs. Items are grouped by the module they most directly affect.

## Conversations

### Chat File Attachments

- Allow users to attach files to a conversation message.
- Make attached files readable by the selected agent, or by multiple agents when
  the conversation includes more than one agent.
- Preserve the secure Electron boundary: renderer UI can select and display
  attachment metadata, but file access and agent-readable material should be
  mediated by the main process.
- Clarify how attachments are stored, referenced, scoped to a conversation, and
  cleaned up before implementation.

### Chat Image Attachments

- Allow users to attach images to a conversation message.
- Make images available to agents that support image input, so an agent can
  inspect, reason about, or work from the image.
- Treat images as first-class conversation context alongside text and file
  attachments.
- Account for provider capability differences, because not every provider or
  model may support image input.

## Work Board

### Follow-Ups On Existing Work

- Allow users to add a follow-up request to an existing work item.
- Keep the follow-up attached to the original work item instead of creating a
  separate top-level work item.
- Show the follow-up in the work item's history or activity timeline so the
  original request, result, and later follow-up remain understandable together.
- Preserve user control over whether the same agent continues the follow-up or a
  different agent is assigned.

### Work Input Attachments

- Allow users to attach files or images when creating or updating work from the
  Work Board input.
- Make these attachments available as context for the agents assigned to the
  work item.
- Keep attachment visibility tied to the relevant work item, not globally
  available across the app.
- Reuse the same attachment model as Conversations where possible, so file and
  image handling does not fork into separate product concepts.

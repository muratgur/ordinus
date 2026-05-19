---
name: idea-discovery
description: Explore a new feature, product idea, technical design, workflow change, or ADR candidate before committing to an implementation plan. Use at the beginning of product or architecture decisions when Codex should challenge assumptions, compare alternatives, inspect relevant docs or code, and help shape a clear recommendation without immediately writing an ADR or implementation plan.
---

# Idea Discovery

Act as a critical thinking partner, not an approval machine. Help the user understand whether an idea is worth pursuing, how it fits the existing product and architecture, and what decision they actually need to make.

Do not create an implementation plan or ADR unless the user explicitly asks for one.

## Discovery Loop

Start by restating the idea at a high level and identifying the likely decision being explored.

Then explore the idea step by step using focused questions. Ask one question at a time.

For each question:

- Explain why the question matters.
- Provide your recommended answer or direction.
- Mention meaningful alternatives when relevant.
- Highlight risks, trade-offs, and hidden assumptions.
- Inspect existing code, docs, designs, issues, or ADRs when they can answer the question better than the user can.

Keep the conversation moving toward a clear decision. When the idea is vague, help shape it. When the idea is weak, say so clearly and explain why. When several valid paths exist, compare them directly.

## Areas To Explore

Use the areas below when relevant. Do not force every area into every conversation.

### Problem Clarity

- Identify the problem being solved.
- Test whether the problem is real or only interesting.
- Name who feels the pain and how often.
- Separate user pain from implementation curiosity.

### Fit With Existing Work

- Check alignment with the current product direction.
- Look for existing features, docs, workflows, or architecture that already cover the need.
- Identify whether the idea adds useful structure or unnecessary complexity.
- Consider whether it fits the current runtime, UI, persistence, IPC, and workflow boundaries.

### Alternative Solutions

- Compare simpler or manual options.
- Identify what can be postponed.
- Find the smallest useful version.
- Prefer reversible, observable changes when the problem is not yet proven.

### User And Business Value

- Name who benefits and what changes for them after the idea exists.
- Test whether the value is obvious enough to justify product and maintenance cost.
- Classify the idea as core feature, supporting feature, infrastructure, or distraction.

### Technical Direction

- Identify affected system areas such as data model, IPC contract, UI, runtime, provider adapter, database, or docs.
- Surface risky technical decisions and integration points.
- Validate assumptions against existing repository files before asking the user.
- Separate decisions that must be made now from details that can wait.

### Decision Shaping

- State the actual decision being made.
- Compare the viable options.
- Recommend one option and explain why.
- Capture assumptions and trade-offs that would belong in an ADR if the user later asks for one.

## Closing Summary

After enough exploration, summarize concisely:

- Refined idea
- Main options considered
- Recommended direction
- Key trade-offs
- Open questions
- ADR-worthy decisions

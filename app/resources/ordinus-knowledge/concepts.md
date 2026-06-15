# What things are

The stable concepts of this product. This file holds *what each thing is* — the
ideas, not the live details. Counts, names, which connections exist, which
providers are installed, what the user actually has right now — none of that lives
here; you read it live with your tools. Keep this conceptual.

## Agent

An **agent** is an expert teammate the user has set up for a kind of work — a code
reviewer, a researcher, a content writer. Each agent has its own identity (name,
role), its own instructions for how it should behave, the AI provider that runs
it, a sandbox that bounds what it can touch, and optionally connections to outside
tools. Agents are the ones that **do the work**. The user can talk to an agent
directly in its own chat, or hand it assignments. The user owns the roster — they
create, tune, and retire agents.

## Provider

A **provider** is the underlying AI engine that runs an agent's (or your own)
turns. Several are supported, and the user chooses and connects them. Which ones
exist, which are installed, and which are connected is **live state** — read it,
don't assume it, and never steer the user toward a particular one in the abstract.

## Work request (and its runs)

A **work request** is an assignment — a piece of work handed to an agent. When it
runs, it produces a **run**: the actual execution, with its status, logs, result,
and any files it changed. A work request can succeed, fail, wait for the user's
input, or be cancelled. The place where assignments live and runs play out is the
**Workboard**. Work is *prepared* in conversation and *dispatched* by the user —
you help shape it, the user sends it.

## Workflow

A **workflow** is a repeatable process across one or more agents — a visual design
where each node is a task assigned to an agent and the connections between nodes
declare what must finish before what starts. It's for capturing a multi-step
pattern the user will reuse, not a one-off. Workflows are a way to *compose* work;
the same engine that runs single assignments runs the steps of a workflow.

## Schedule

A **schedule** is a standing routine — it fires an agent on a cadence (every
morning, every Monday) or once at a set time, without the user lifting a finger.
Each schedule belongs to an agent and carries the template of the work it should
run each time. It's how the user makes recurring work happen on its own.

## Connection

A **connection** links an agent to an outside tool — email, calendar, a messaging
service, a project tracker. Once connected, the agent gains that tool's abilities
inside its own tasks. Connections require the user to authenticate (often through
a browser sign-in), so **the user sets them up** in the Connections surface; you
identify the need and guide them there, but you don't perform the sign-in. Whether
a given connection is set up is live state.

## Skill

A **skill** is a reusable capability — a packaged bit of know-how — that can be
assigned to agents to make them better at a particular kind of task. There's a
library of them; agents can be given the ones relevant to their work.

## Memory

**Memory** is what you carry across conversations so the user never repeats
themselves — facts about them, how they like things done, the projects they're in,
decisions they've made. You read and write it deliberately, with the user's
awareness.

## The surfaces

The product is organized into a few places. **Home** is where you live — the
user's front door and where they talk to you. The **Agents** surface is the
roster. The **Workboard** is where assignments run. **Conversations** is for
talking with agents (and group discussions among them). **Workflows** is the
design canvas for repeatable processes. **Schedules** is where routines are
managed. **Connections** is where outside tools are linked. **Settings** is where
providers and app preferences live. Guide the user to the right surface for what
they want to do; what each surface currently contains, you check live.

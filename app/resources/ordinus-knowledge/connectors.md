# Connectors

A **Connector** is an external MCP-HTTP service (Slack, Gmail, Linear, …) the
user has authorized for one or more agents. The agent gains the connector's
tool surface for the duration of its turn.

You do not configure connectors yourself — that lives in the Agents settings
surface. If a user asks "can my agent use Slack?", check `list_agents` for
their `connectors` list, and direct them to the agent's connector toggles if
the connector isn't enabled.

Connectors are owned by the agent that uses them, not by you. You have your
own internal MCP server for app-state tools (the ones you're using right now);
that is separate from the user-facing connector layer.

# A2A delegation — TypeScript

A walkthrough for the [Agent-to-Agent (A2A) protocol](https://a2a-protocol.org/latest/) on Foundry, where **both** agents are Foundry-hosted [Agent Framework](https://github.com/microsoft/agent-framework) agents using the Responses protocol, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`).

Ported from the Python sample [`hosted-agents/agent-framework/a2a/01-delegation`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/a2a/01-delegation).

| Agent | Role | Folder |
|---|---|---|
| **Executor** — math expert | Hosted Responses agent exposed as an A2A endpoint via Foundry's [incoming A2A](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/enable-agent-to-agent-endpoint) feature. | [`executor/`](executor/) |
| **Caller** — concierge | Hosted Responses agent that delegates user questions to the executor through a Foundry **Toolbox** with an A2A connection. | [`caller/`](caller/) |

The caller sees the executor purely as an A2A skill discovered from the executor's [agent card](https://a2a-protocol.org/latest/#agent-card). The `RemoteA2A` connection uses `authType: UserEntraToken`, so the toolbox forwards the **calling user's** Microsoft Entra token to the executor's agent card endpoint.

```
caller (hosted agent)
  └─ Toolbox (MCP endpoint on the Foundry project)
       └─ a2a_preview tool
            └─ RemoteA2A connection ──► executor's A2A endpoint
```

## Layout

```text
01-delegation/
├── caller/         # Concierge hosted agent that delegates over A2A
└── executor/       # Math-expert hosted agent (gets exposed as A2A)
    └── scripts/    # setup-a2a.{sh,ps1} — enables incoming A2A on the executor
```

Each folder is a full workspace package (`af-a2a-01-caller` / `af-a2a-01-executor`) with its own `package.json`, `agent.yaml`, and Dockerfile.

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with a model deployment
- Azure CLI signed in (`az login`) as a principal with the **Foundry User** role (or higher) on the Foundry project — auth uses `DefaultAzureCredential`
- **Bash** (Linux/macOS/WSL) **or** **PowerShell** (Windows/macOS/Linux) to run [`executor/scripts/setup-a2a`](executor/scripts/)

## Walkthrough

Four steps:

| # | What | Where |
|---|---|---|
| 1 | Deploy the **executor** | [`executor/`](executor/) |
| 2 | Run `setup-a2a` to enable incoming A2A on the executor (PATCH only) | `executor/scripts/setup-a2a.{sh,ps1}` |
| 3 | Create the `RemoteA2A` connection + `a2a_preview` toolbox, then deploy the **caller** | [`caller/`](caller/) |
| 4 | Invoke the caller and watch it delegate | Foundry portal / Agent Playground |

### 1. Deploy the executor

```bash
cd executor
npm install
docker build -t a2a-executor-agent .
```

Deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`) using [`executor/agent.yaml`](executor/agent.yaml). Default agent name: `agent-framework-a2a-executor-responses-ts`. For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent).

### 2. Enable incoming A2A on the executor

```bash
./executor/scripts/setup-a2a.sh          # or ./executor/scripts/setup-a2a.ps1
```

This PATCHes the executor to publish its `agent_card` and add `a2a` to `agent_endpoint.protocols`. After that, the agent answers both Responses and A2A requests at the same endpoint. The PATCH is the only step that has to happen out-of-band — `agent_card` and multi-protocol endpoints aren't AgentSchema concepts, so the manifest can't express them yet.

On success the script prints the executor's A2A endpoint URL — **copy it**, you'll use it as the `RemoteA2A` connection target in the next step.

### 3. Create the connection + toolbox, then deploy the caller

> **Deviation from the Python sample:** the Python walkthrough declares the `RemoteA2A` connection and `a2a_preview` toolbox in the caller's `azure.yaml` and lets `azd provision` create them. The TypeScript samples deploy from `agent.yaml` (container flow) which cannot express those resources, so create them on the project first — with the [Toolbox REST API](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/toolbox?pivots=rest-api) and the [A2A connection guide](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/agent-to-agent), or by running the Python caller's `azd provision` once. The shape to reproduce (from the Python caller's [`azure.yaml`](https://github.com/microsoft-foundry/foundry-samples/blob/main/samples/python/hosted-agents/agent-framework/a2a/01-delegation/caller/azure.yaml)):
>
> - a `RemoteA2A` connection (`authType: UserEntraToken`, `audience: https://ai.azure.com`, metadata `AgentCardPath: /agentCard/v0.3`) targeting the A2A endpoint from step 2;
> - a toolbox named `a2a-delegation-tools` with one `a2a_preview` tool bound to that connection.

Then build and deploy the caller using [`caller/agent.yaml`](caller/agent.yaml), with `TOOLBOX_NAME` set to the toolbox name:

```bash
cd caller
npm install
docker build -t a2a-caller-agent .
```

### 4. Invoke the caller

Invoke the deployed caller (Agent Playground, or any Responses client) with:

```
What is 15 multiplied by 23?
```

The caller delegates over A2A and returns a friendly summary. Other prompts to try:

- `Compute the area of a circle with radius 7.`
- `What is 2 to the power of 10, and is the result prime?`

The executor still answers Responses requests directly.

## Cleaning up

- Delete the caller agent, then the toolbox and the `RemoteA2A` connection, then the executor agent.
- To revoke incoming A2A without deleting the executor agent, PATCH it with `agent_endpoint.protocols` set to `["responses"]` only.

## Reference

- [Enable incoming A2A on a Foundry agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/enable-agent-to-agent-endpoint) — covers the executor PATCH and the underlying REST contract for the connection.
- [Curate intent-based toolbox in Foundry](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/toolbox?pivots=rest-api) — Toolbox REST API.
- [Connect to an A2A agent endpoint](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/agent-to-agent) — caller side.
- [Supported toolbox tools](https://github.com/microsoft-foundry/foundry-samples/blob/main/samples/python/toolbox/SUPPORTED_TOOLBOX_TOOLS.md#a2a-tool-preview) — `a2a_preview` parameters.

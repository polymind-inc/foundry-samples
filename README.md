# Foundry Samples — TypeScript (Agent Framework)

TypeScript ports of the [Microsoft Foundry samples](https://github.com/microsoft-foundry/foundry-samples) built on the TypeScript implementation of the [Agent Framework](https://github.com/microsoft/agent-framework) — [`@polymind-inc/agent-framework`](https://www.npmjs.com/package/@polymind-inc/agent-framework) (agent-framework-js).

The samples target Agent Framework for TypeScript 0.4.0.

Only samples whose features are implemented in agent-framework-js are ported; see the [portability matrix](#portability-matrix) below.

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with a model deployment
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`

## Getting started

Each sample is fully standalone — it has its own `package.json` and can be copied out of this repository as-is. To run one:

```bash
cd samples/typescript/hosted-agents/agent-framework/responses/01-basic
npm install
cp .env.example .env   # fill in your project endpoint + model deployment
npm run dev
```

Then invoke it from another terminal:

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"Hi"}'
```

Every sample ships an `agent.yaml` (hosted-agent definition) and a `Dockerfile` for deployment to Foundry as a hosted agent (`npm run build` produces the self-contained `dist/main.mjs` bundle the image copies). See each sample's README for details.

## Deploy to Foundry (verified flow)

The `azd` Foundry extension does not support TypeScript code deployments, but it deploys prebuilt container images (`language: docker`). The following flow was verified end to end:

```bash
# 1. Build the image (a multi-stage build runs npm ci + npm run build inside Docker)
#    and push it to an ACR the project can pull from
docker build -t <registry>.azurecr.io/<agent-name>:v1 .
az acr login --name <registry>
docker push <registry>.azurecr.io/<agent-name>:v1

# 2. In an EMPTY directory, register the agent from the image
azd ext install azure.ai.agents
azd ai agent init --image <registry>.azurecr.io/<agent-name>:v1 \
  --agent-name <agent-name> --protocol responses \
  --project-id <foundry-project-ARM-resource-id> --model-deployment <deployment>

# 3. Add the model env var to the generated azure.yaml service block
#    (environmentVariables: - name: AZURE_AI_MODEL_DEPLOYMENT_NAME, value: <deployment>),
#    then deploy and invoke
azd deploy
azd ai agent invoke <agent-name> "Hi"
```

Notes: `azd ai agent init` refuses to run in a non-empty directory; from Git Bash prefix the `init` command with `MSYS_NO_PATHCONV=1` so the ARM resource id is not rewritten as a Windows path.

## Samples

All under [`samples/typescript/hosted-agents/agent-framework/`](samples/typescript/hosted-agents/agent-framework/). Numbering matches the Python originals.

### Responses protocol

| Sample | Demonstrates |
|---|---|
| [01-basic](samples/typescript/hosted-agents/agent-framework/responses/01-basic/) | Minimal hosted agent, multi-turn via `previous_response_id` |
| [02-tools](samples/typescript/hosted-agents/agent-framework/responses/02-tools/) | Local function tools with zod-typed parameters |
| [04-foundry-toolbox](samples/typescript/hosted-agents/agent-framework/responses/04-foundry-toolbox/) | Foundry Toolbox tools over MCP (`FoundryToolbox`) |
| [07-skills](samples/typescript/hosted-agents/agent-framework/responses/07-skills/) | File-based Agent Skills; bundled Node script renders a PDF travel guide |
| [08-observability](samples/typescript/hosted-agents/agent-framework/responses/08-observability/) | Logs, metrics, and distributed tracing to Application Insights |
| [10-downstream-azure](samples/typescript/hosted-agents/agent-framework/responses/10-downstream-azure/) | Data-plane calls to Blob Storage + Service Bus with the agent identity (no keys) |
| [11-azure-search-rag](samples/typescript/hosted-agents/agent-framework/responses/11-azure-search-rag/) | RAG over Azure AI Search via a custom `ContextProvider`, with citations |
| [13-foundry-memory](samples/typescript/hosted-agents/agent-framework/responses/13-foundry-memory/) | Persistent semantic memory via a Foundry Memory Store (`FoundryMemoryProvider`) |
| [16-content-safety-guardrail](samples/typescript/hosted-agents/agent-framework/responses/16-content-safety-guardrail/) | Definition-level RAI content-safety policy in `agent.yaml` |
| [22-foundry-toolbox-mcp-skills](samples/typescript/hosted-agents/agent-framework/responses/22-foundry-toolbox-mcp-skills/) | Agent Skills discovered from a Foundry Toolbox over MCP with progressive disclosure |

### Invocations protocol

| Sample | Demonstrates |
|---|---|
| [01-basic](samples/typescript/hosted-agents/agent-framework/invocations/01-basic/) | Invocations-protocol agent with per-session state (`InvocationsHostServer`) |

### A2A

| Sample | Demonstrates |
|---|---|
| [01-delegation](samples/typescript/hosted-agents/agent-framework/a2a/01-delegation/) | Concierge agent delegating to a math-expert agent over A2A (caller + executor) |

## Portability matrix

Python samples **not** ported, and why:

| Python sample | Reason not ported |
|---|---|
| `responses/05-workflows`, `responses/09-declarative-customer-support` | Workflows / graph engine and declarative YAML workflows are not yet implemented in agent-framework-js (planned as the next milestone) |
| `responses/06-files` | Session Files API integration is not available in agent-framework-js |
| `responses/07-teams-activity`, `bring-your-own/activity/*` | Activity protocol (Teams/M365) is not implemented in agent-framework-js |
| `responses/12-foundry-skills` | Requires the Foundry Skills REST API client (`AIProjectClient.beta.skills`), which has no JS equivalent |
| `responses/14-browser-automation-agent` | Heavy Toolbox browser-session + Azure Playwright Service integration; no JS-side support for the session tooling used |
| `responses/15-optimization-*`, `bring-your-own/responses/optimization-*` | Agent Optimizer server (`azure-ai-agentserver-optimization`) has no JS equivalent |
| `responses/17-foundry-iq-toolbox` | Agent itself would port, but the sample hinges on Python-based Foundry IQ knowledge-base provisioning |
| `responses/18-egress-control` | Infrastructure/policy sample; the pytest scenario suite and Bicep infra are Python-specific |
| `responses/19–21` (harness samples) | Research/data-processing/scaling harness APIs (`create_harness_agent`, CodeAct, shell policy) are not implemented in agent-framework-js |
| `invocations_ws/*`, `voicelive/*` | Real-time voice (WebSocket protocol, VoiceLive) is not supported by agent-framework-js |
| `langgraph/*`, `bring-your-own/*` | Use other frameworks (LangGraph, Pydantic AI, Claude Agent SDK, …) or hand-rolled servers, not the Agent Framework |
| `prompt-agents/*`, `quickstart/*`, `enterprise-agent-tutorial/*`, `external-agents/*`, `foundry-models/*`, `foundry-local/*`, `black-forest-labs/*`, `foundry-autopilot-agent/*` | Built on `azure-ai-projects` / other SDKs rather than the Agent Framework (out of scope for this port) |

Sample `03` does not exist in the Python originals; the numbering gap is preserved.

## Repository layout

```
samples/typescript/hosted-agents/agent-framework/
├── responses/          # Responses container protocol v2.0.0 samples
├── invocations/        # Invocations protocol samples
└── a2a/                # Agent2Agent delegation samples
```

Each sample is self-contained (own `package.json` and `tsconfig.json`, strict ESM TypeScript targeting ES2024) and is installed and run with plain `npm`. Every sample also ships `AGENTS.md`/`CLAUDE.md` coding-agent instructions and a `.dockerignore`; toolbox configuration recipes shared by the toolbox samples live in [SUPPORTED_TOOLBOX_SCENARIOS.md](samples/typescript/hosted-agents/SUPPORTED_TOOLBOX_SCENARIOS.md).

## License

MIT — see [LICENSE](LICENSE). The samples are TypeScript ports of the MIT-licensed [microsoft-foundry/foundry-samples](https://github.com/microsoft-foundry/foundry-samples) (Copyright (c) Microsoft Corporation); the ports themselves are Copyright (c) shibayan.

# Agent with File-Based Skills (Responses Protocol) — TypeScript

An [Agent Framework](https://github.com/microsoft/agent-framework) agent with **native file-based skills** hosted on Microsoft Foundry using the **Responses protocol**, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). Skills in the local [skills/](skills/) folder are discovered automatically and disclosed to the model progressively: only names and descriptions go into the system prompt, and the model pulls in a skill's body — or runs one of its scripts — when a task actually needs it.

Ported from the Python sample [`hosted-agents/agent-framework/responses/07-skills`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/07-skills).

## How it works

The agent uses `FoundryChatClient` and is served via `ResponsesHostServer`. Skills come from a `skillsProvider` context provider fed by `directorySkillsSource` (the hardened Node.js source from the `/node` subpath):

```ts
const skills = cacheSkills(
  directorySkillsSource({
    paths: [resolveSkillsDir()],
    scriptExtensions: ['.mjs'],
    scriptRunner: runLocalSkillScript,
  }),
);
```

The framework never executes a discovered file on its own — the sample opts in by supplying `runLocalSkillScript`, which runs a script with `node` inside its skill directory, with a 60-second timeout and positional string CLI arguments only (the TypeScript analogue of the Python sample's `run_local_skill_script` subprocess runner). See [src/main.ts](src/main.ts).

The included [travel-guide](skills/travel-guide/) skill creates a colorful multi-page PDF city travel guide by running the bundled [scripts/create_travel_guide.mjs](skills/travel-guide/scripts/create_travel_guide.mjs), which writes the PDF object graph by hand using only the Node.js standard library — a faithful port of the Python original, so no PDF package is installed. The PDF is written to `$HOME/generated-travel-guides` (override with `TRAVEL_GUIDE_OUTPUT_DIR`) and the script prints JSON with the saved path.

### Deviations from the Python sample

- **Skill scripts are Node.js.** `scripts/create_travel_guide.py` was rewritten as `scripts/create_travel_guide.mjs` (stdlib-only, same flags, same PDF layout), and `SKILL.md` points at the `.mjs` script. `directorySkillsSource` is configured with `scriptExtensions: ['.mjs']` since its default is `.py`.
- **Skill-tool approvals are relaxed.** In agent-framework-js every skill tool (`load_skill`, `read_skill_resource`, `run_skill_script`) defaults to `always_require` approval. This host runs unattended and the Python sample runs its bundled, trusted script without an approval round-trip, so the sample sets all three to `never_require` to mirror that behavior. Only do this for skills you author and ship yourself.
- **The skills directory ships next to the bundle.** tsdown produces a single `dist/main.mjs`; it cannot carry the `skills/` tree, so the [Dockerfile](Dockerfile) copies `skills/` into the image and `main.ts` resolves it from `SKILLS_DIR`, `<cwd>/skills`, or next to the entry module — the same code path works for `npm run dev`, `npm start`, and the container.

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with a model deployment
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`

## Run locally

```bash
npm install
cp .env.example .env   # then fill in your project endpoint
npm run dev
```

Invoke the local agent from another terminal:

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"Create a colorful 3-day PDF travel guide for Lisbon focused on food, viewpoints, and neighborhoods."}'
```

The skill writes the PDF to `$HOME/generated-travel-guides` and the agent replies with the file path. For production scenarios that need durable external sharing, update the skill script to upload the PDF to storage and return a shareable URL.

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t skills-responses-agent .
```

The agent definition is in [agent.yaml](agent.yaml). For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `FOUNDRY_PROJECT_ENDPOINT` | yes | Foundry project endpoint the chat client talks to. |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | yes | Model deployment name (`FOUNDRY_MODEL_NAME` also accepted). |
| `SKILLS_DIR` | no | Overrides skills discovery. Defaults to `<cwd>/skills`, then next to the entry module. |
| `TRAVEL_GUIDE_OUTPUT_DIR` | no | Where the travel-guide script writes PDFs. Defaults to `$HOME/generated-travel-guides`; the Dockerfile sets `/tmp/generated-travel-guides` for the container. |

## Next steps

- [22-foundry-toolbox-mcp-skills](../22-foundry-toolbox-mcp-skills/) — the same progressive-disclosure pattern, with skills served by a Foundry Toolbox over MCP instead of local files

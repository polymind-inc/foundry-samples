# Coding Agent Instructions

This project is a **Microsoft Foundry hosted agent** — a containerized AI agent that runs in [Foundry Agent Service](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents). The platform handles containerization, hosting, security, scaling, and observability so you can focus on agent logic.

## Key files

- `src/main.ts` — agent implementation
- `agent.yaml` — hosted-agent definition (name, protocol, resources, environment variables)
- `Dockerfile` — multi-stage container build (`npm ci` + `npm run build` in the build stage; the runtime image contains only the bundled artifact)

## Development workflow

```bash
npm install        # Install dependencies
npm run dev        # Run locally on http://localhost:8088
npm run typecheck  # Typecheck
npm run build      # Build the self-contained dist/main.mjs bundle
npm start          # Run the built bundle
```

Test the local agent:

```bash
curl -X POST localhost:8088/invocations -H 'content-type: application/json' -d '{"message":"Hi"}'
```

> The `azd ai agent` code-deployment flow used by the Python samples supports Python and C# only; this TypeScript sample deploys to Foundry as a container built from the `Dockerfile`.

## Microsoft Foundry Skill

Install the **Microsoft Foundry Skill** for guided deployment, evaluation, and troubleshooting workflows.

Direct install (preferred, works with any coding agent):

```bash
npx skills add https://github.com/microsoft/azure-skills --skill microsoft-foundry
```

Or install the Azure Skills Plugin:

- **Copilot CLI**: `/plugin marketplace add microsoft/azure-skills` then `/plugin install azure@azure-skills`
- **Claude Code**: `/plugin install azure@claude-plugins-official`

Then ask naturally, e.g. `Use the Microsoft Foundry Skill to deploy this agent.`

## References

- [Hosted agents overview](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- [Microsoft Foundry Skill](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/use-microsoft-foundry-skill)

// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

import { DefaultAzureCredential } from '@azure/identity';
import { Agent } from '@polymind-inc/agent-framework';
import { serve } from '@polymind-inc/agent-framework/agentserver/node';
import { FoundryChatClient, FoundryProject } from '@polymind-inc/agent-framework/foundry';
import { FoundryToolbox, ResponsesHostServer } from '@polymind-inc/agent-framework/foundry/hosting';

/**
 * Returns an env var value, treating un-substituted `${VAR}` / `{{VAR}}` placeholders as empty.
 *
 * Hosted-agent runtimes may leave template text unchanged when a deployment
 * variable is undefined. Treat it as unset so configuration errors fail fast.
 */
function resolvedEnv(name: string): string {
  const value = (process.env[name] ?? '').trim();
  if ((value.startsWith('${') && value.endsWith('}')) || (value.startsWith('{{') && value.endsWith('}}'))) {
    return '';
  }
  return value;
}

const modelName = resolvedEnv('AZURE_AI_MODEL_DEPLOYMENT_NAME') || resolvedEnv('FOUNDRY_MODEL_NAME');
if (!modelName) {
  throw new Error(
    'Model deployment name is not configured. Set AZURE_AI_MODEL_DEPLOYMENT_NAME or FOUNDRY_MODEL_NAME.',
  );
}

const projectEndpoint = resolvedEnv('FOUNDRY_PROJECT_ENDPOINT');
if (!projectEndpoint) {
  throw new Error('Set FOUNDRY_PROJECT_ENDPOINT to your Foundry project endpoint.');
}
const project = new FoundryProject(projectEndpoint, new DefaultAzureCredential());

const toolboxName = resolvedEnv('TOOLBOX_NAME');
if (!toolboxName) {
  throw new Error('Set TOOLBOX_NAME to the toolbox whose skills this agent should use.');
}

// FoundryToolbox reaches the toolbox registered in the project over MCP,
// authenticates every request with the credential shared by `project`, and forwards the
// platform per-request call-id. `loadTools: false` keeps the toolbox's tools
// hidden so only its Agent Skills (SEP-2640) are surfaced — `getTools()` then
// answers with an empty list without ever asking the gateway.
const toolbox = new FoundryToolbox({
  project,
  name: toolboxName,
  loadTools: false,
});

const server = new ResponsesHostServer({
  // Built through a factory, so construction-time work runs on the first request
  // rather than at startup: a toolbox that is briefly unreachable would otherwise
  // keep /readiness red and fail every invocation with session_not_ready.
  agent: async () =>
    new Agent({
      client: new FoundryChatClient({
        project,
        target: { model: modelName },
      }),
      name: resolvedEnv('SAMPLE_AGENT_NAME') || 'hosted-toolbox-mcp-skills',
      instructions: 'You are a helpful assistant.',
      // Wiring the toolbox's tools connects the MCP session the skills provider
      // reads from. With `loadTools: false` this stays an empty list.
      tools: await toolbox.getTools(),
      contextProviders: [
        // asSkillsProvider() discovers skills from skill://index.json on the toolbox
        // MCP session and exposes them as a context provider; SKILL.md bodies are
        // fetched on demand via resources/read. Skill tools default to
        // `always_require` approval, but this host runs unattended — there is no
        // one to answer an approval request mid-turn — so `load_skill` is relaxed
        // (the analogue of Python's `disable_load_skill_approval=True`), and
        // `read_skill_resource` with it. Toolbox skills carry no runnable scripts,
        // so `run_skill_script`'s default approval is left alone.
        toolbox.asSkillsProvider({
          approvals: { loadSkill: 'never_require', readSkillResource: 'never_require' },
          // Skills come from outside this codebase: a malformed or unsupported entry
          // is skipped and named here rather than taking the turn down with it.
          onSkillError: ({ skill, error }) => console.warn('[skill-error]', skill ?? '(unnamed)', error),
        }),
      ],
      // History is managed by the hosting infrastructure, thus there is no need
      // to store history by the service. Learn more at:
      // https://developers.openai.com/api/reference/resources/responses/methods/create
      defaultOptions: { store: false },
    }),
});

const { port } = await serve(server);
console.log(`Agent host listening on 0.0.0.0:${port}`);

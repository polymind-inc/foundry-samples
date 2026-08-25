// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

import { Agent } from '@polymind-inc/agent-framework';
import { serve } from '@polymind-inc/agent-framework/agentserver/node';
import { FoundryChatClient } from '@polymind-inc/agent-framework/foundry';
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

const toolboxName = resolvedEnv('TOOLBOX_NAME');
if (!toolboxName) {
  throw new Error('Set TOOLBOX_NAME to the toolbox registered in your Foundry project.');
}

// FoundryToolbox reaches the toolbox's tools over its MCP endpoint, built from the project
// endpoint and the toolbox name. Every request is authenticated with the credential
// (DefaultAzureCredential by default) and transparently forwards the platform per-request
// call-id to the toolbox.
const toolbox = new FoundryToolbox({ name: toolboxName, projectEndpoint });

const server = new ResponsesHostServer({
  // The agent is built lazily on the first request rather than at startup: the toolbox's
  // `tools/list` happens inside the factory, so a briefly unreachable toolbox fails that one
  // request instead of keeping `/readiness` red and taking every invocation down with
  // `session_not_ready`.
  agent: async () =>
    new Agent({
      client: new FoundryChatClient({
        projectEndpoint,
        target: { modelDeployment: modelName },
      }),
      instructions: 'You are a friendly assistant. Keep your answers brief.',
      tools: await toolbox.getTools(),
      // History is managed by the hosting infrastructure, thus there is no need
      // to store history by the service. Learn more at:
      // https://developers.openai.com/api/reference/resources/responses/methods/create
      defaultOptions: { store: false },
    }),
});

const { port } = await serve(server);
console.log(`Agent host listening on 0.0.0.0:${port}`);

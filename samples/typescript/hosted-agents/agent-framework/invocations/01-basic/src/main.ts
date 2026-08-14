// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

import { Agent } from '@polymind-inc/agent-framework';
import { serve } from '@polymind-inc/agent-framework/agentserver/node';
import { FoundryChatClient } from '@polymind-inc/agent-framework/foundry';
import { InvocationsHostServer } from '@polymind-inc/agent-framework/foundry/hosting';

const modelName = process.env.AZURE_AI_MODEL_DEPLOYMENT_NAME ?? process.env.FOUNDRY_MODEL_NAME;
if (!modelName) {
  throw new Error(
    'Model deployment name is not configured. Set AZURE_AI_MODEL_DEPLOYMENT_NAME or FOUNDRY_MODEL_NAME.',
  );
}

const projectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
if (!projectEndpoint) {
  throw new Error('Set FOUNDRY_PROJECT_ENDPOINT to your Foundry project endpoint.');
}

const agent = new Agent({
  client: new FoundryChatClient({
    projectEndpoint,
    target: { modelDeployment: modelName },
  }),
  instructions: 'You are a friendly assistant. Keep your answers brief.',
  // History is managed by the hosting infrastructure, thus there is no need
  // to store history by the service. Learn more at:
  // https://developers.openai.com/api/reference/resources/responses/methods/create
  defaultOptions: { store: false },
});

// The platform stores no conversation history for the Invocations protocol: the conversation
// lives in this process, keyed by the session id (the Python sample hand-rolls the same store).
// Callers keep a conversation going by pinning the `agent_session_id` query parameter to the
// value the previous response's `x-agent-session-id` header reported.
const server = new InvocationsHostServer({ agent });
const { port } = await serve(server);
console.log(`Agent host listening on 0.0.0.0:${port}`);

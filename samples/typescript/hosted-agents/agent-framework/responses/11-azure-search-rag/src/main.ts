// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

import { Agent } from '@polymind-inc/agent-framework';
import type { ContextProvider } from '@polymind-inc/agent-framework';
import { serve } from '@polymind-inc/agent-framework/agentserver/node';
import { FoundryChatClient } from '@polymind-inc/agent-framework/foundry';
import { ResponsesHostServer } from '@polymind-inc/agent-framework/foundry/hosting';

import { AzureAISearchContextProvider } from './search-context-provider.js';

/**
 * Returns an env var value, treating un-substituted `${VAR}` / `{{VAR}}` placeholders as empty.
 *
 * Hosted-agent runtimes that perform template substitution on `agent.yaml` /
 * `agent.manifest.yaml` may leave the literal `${VAR}` or `{{VAR}}` text when
 * `VAR` is undefined at deploy time (e.g. CI smoke runs that don't provision
 * an Azure Search index). The sample should treat that case the same as
 * "unset" so the agent still starts and responds — just without the optional
 * RAG capability.
 */
function resolvedEnv(name: string): string {
  const value = (process.env[name] ?? '').trim();
  if ((value.startsWith('${') && value.endsWith('}')) || (value.startsWith('{{') && value.endsWith('}}'))) {
    return '';
  }
  return value;
}

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

const searchEndpoint = resolvedEnv('AZURE_SEARCH_ENDPOINT');
const searchIndexName = resolvedEnv('AZURE_SEARCH_INDEX_NAME');
const contextProviders: ContextProvider[] = [];
if (!searchEndpoint || !searchIndexName) {
  console.warn(
    'Azure Search environment variables are not fully set. ' +
      'The agent will start, but search functionality will be unavailable.',
  );
} else {
  // Connect to a pre-provisioned Azure AI Search index. The index is expected to
  // exist and contain documents with the schema described in README.md
  // (id / content / sourceName / sourceLink). The context provider runs a search
  // against this index before each model invocation and injects the matching
  // documents into the model context.
  contextProviders.push(
    new AzureAISearchContextProvider({
      sourceId: 'azure_search_rag',
      endpoint: searchEndpoint,
      indexName: searchIndexName,
      topK: 3,
    }),
  );
}

const agent = new Agent({
  client: new FoundryChatClient({
    projectEndpoint,
    target: { modelDeployment: modelName },
  }),
  instructions:
    'You are a helpful support specialist for Contoso Outdoors. ' +
    'Answer questions using the provided context and cite the source ' +
    'document when available.',
  contextProviders,
  // History will be managed by the hosting infrastructure, thus there
  // is no need to store history by the service. Learn more at:
  // https://developers.openai.com/api/reference/resources/responses/methods/create
  defaultOptions: { store: false },
});

const server = new ResponsesHostServer({ agent });
const { port } = await serve(server);
console.log(`Agent host listening on 0.0.0.0:${port}`);

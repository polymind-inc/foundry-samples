// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

/**
 * Foundry Memory hosted agent sample.
 *
 * This agent uses {@link FoundryMemoryProvider} to give an otherwise stateless
 * hosted agent persistent, semantic memory backed by a Microsoft Foundry
 * Memory Store. The store itself is provisioned once via `src/provision.ts`
 * and its name is passed in through the `MEMORY_STORE_NAME` environment
 * variable.
 */

import { Agent, agentMiddleware } from '@polymind-inc/agent-framework';
import { serve } from '@polymind-inc/agent-framework/agentserver/node';
import { FoundryChatClient, FoundryMemoryProvider } from '@polymind-inc/agent-framework/foundry';
import { hostedUserScope, ResponsesHostServer } from '@polymind-inc/agent-framework/foundry/hosting';

/**
 * Returns an env var value, treating un-substituted `${VAR}` / `{{VAR}}` placeholders as empty.
 *
 * Hosted-agent runtimes that perform template substitution on `agent.yaml` /
 * `agent.manifest.yaml` may leave the literal `${VAR}` or `{{VAR}}` text when
 * `VAR` is undefined at deploy time. Treat those placeholders as unset so the
 * required-configuration checks below report the missing variable clearly.
 */
function resolvedEnv(name: string): string {
  const value = (process.env[name] ?? '').trim();
  if ((value.startsWith('${') && value.endsWith('}')) || (value.startsWith('{{') && value.endsWith('}}'))) {
    return '';
  }
  return value;
}

const modelName = resolvedEnv('AZURE_AI_MODEL_DEPLOYMENT_NAME');
if (!modelName) {
  throw new Error('Set AZURE_AI_MODEL_DEPLOYMENT_NAME to the chat model deployment name.');
}

const projectEndpoint = resolvedEnv('FOUNDRY_PROJECT_ENDPOINT');
if (!projectEndpoint) {
  throw new Error('Set FOUNDRY_PROJECT_ENDPOINT to your Foundry project endpoint.');
}

const memoryStoreName = resolvedEnv('MEMORY_STORE_NAME');
if (!memoryStoreName) {
  throw new Error('Set MEMORY_STORE_NAME to the provisioned Foundry Memory Store name.');
}

const localMemoryUserId = resolvedEnv('MEMORY_USER_ID');
const resolveHostedUserScope = hostedUserScope();

function resolveMemoryScope(): string {
  try {
    return resolveHostedUserScope();
  } catch (error) {
    if (localMemoryUserId) return localMemoryUserId;
    throw new Error(
      'No hosted end-user id is available. Set MEMORY_USER_ID in .env for local runs, ' +
        'or send x-agent-user-id with the request.',
      { cause: error },
    );
  }
}

const memoryProvider = new FoundryMemoryProvider({
  projectEndpoint,
  memoryStoreName,
  scope: resolveMemoryScope,
  // A memory sample must not silently degrade to a stateless agent. Surface
  // permissions, model, store, and extraction failures to the caller.
  failureMode: 'throw',
});

// Foundry extracts memories asynchronously. Match the .NET sample's explicit
// WhenUpdatesCompletedAsync calls by waiting after each successful agent run.
// Streaming runs finish later, so register the wait against their final result.
const waitForMemoryUpdates = agentMiddleware(
  async (ctx, next) => {
    if (ctx.stream) {
      ctx.onResult(async (response) => {
        await memoryProvider.whenUpdatesCompleted(ctx.signal === undefined ? {} : { signal: ctx.signal });
        return response;
      });
    }

    await next();

    if (!ctx.stream) {
      await memoryProvider.whenUpdatesCompleted(ctx.signal === undefined ? {} : { signal: ctx.signal });
    }
  },
  { name: 'waitForFoundryMemoryUpdates' },
);

const agent = new Agent({
  client: new FoundryChatClient({
    projectEndpoint,
    target: { modelDeployment: modelName },
  }),
  instructions:
    'You are a helpful assistant that remembers facts the user has shared ' +
    'across conversations. Relevant memories from previous interactions are ' +
    'automatically provided to you in the system context. Use them when ' +
    'answering, and acknowledge when you are relying on remembered facts.',
  contextProviders: [memoryProvider],
  middleware: [waitForMemoryUpdates],
  // History will be managed by the hosting infrastructure, thus there
  // is no need to store history by the service. Learn more at:
  // https://developers.openai.com/api/reference/resources/responses/methods/create
  defaultOptions: { store: false },
});

const server = new ResponsesHostServer({ agent });
const { port } = await serve(server);
console.log(`Agent host listening on 0.0.0.0:${port}`);

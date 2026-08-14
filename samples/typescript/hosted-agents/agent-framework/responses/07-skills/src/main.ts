// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Agent, cacheSkills, skillsProvider } from '@polymind-inc/agent-framework';
import type { SkillScriptArguments } from '@polymind-inc/agent-framework';
import { serve } from '@polymind-inc/agent-framework/agentserver/node';
import { FoundryChatClient } from '@polymind-inc/agent-framework/foundry';
import { ResponsesHostServer } from '@polymind-inc/agent-framework/foundry/hosting';
import { directorySkillsSource } from '@polymind-inc/agent-framework/node';
import type { DirectorySkillScript } from '@polymind-inc/agent-framework/node';

const execFileAsync = promisify(execFile);

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

/**
 * Finds the skills directory in every place this sample runs from:
 * - `SKILLS_DIR` env var, when set (absolute or relative to the working directory);
 * - `<cwd>/skills` — dev (`npm run dev` from the sample root) and the container (WORKDIR /app);
 * - next to the entry module — covers `node dist/main.mjs` run from elsewhere.
 */
function resolveSkillsDir(): string {
  if (process.env.SKILLS_DIR) return resolve(process.env.SKILLS_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(process.cwd(), 'skills'), join(here, 'skills'), join(here, '..', 'skills')];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Skills directory not found. Looked in: ${candidates.join(', ')}. Set SKILLS_DIR to override.`,
    );
  }
  return found;
}

/**
 * Runs a trusted file-based skill script with positional CLI arguments.
 *
 * The framework never executes a discovered file on its own — supplying this runner is the
 * explicit opt-in, and `directorySkillsSource` has already verified `script.path` resolves inside
 * the skill directory. The scripts are Node.js (`.mjs`) here, so they run with the same
 * `process.execPath` that runs this host (the Python original shells out to `sys.executable`).
 */
async function runLocalSkillScript(
  script: DirectorySkillScript,
  args: SkillScriptArguments,
): Promise<string> {
  let cliArgs: string[] = [];
  if (Array.isArray(args)) {
    if (!args.every((item): item is string => typeof item === 'string')) {
      return `Error: script '${script.name}' only accepts string CLI arguments.`;
    }
    cliArgs = [...args];
  } else if (args !== undefined) {
    return (
      `Error: script '${script.name}' expects positional CLI arguments as a list ` +
      `of strings, but received ${typeof args}.`
    );
  }

  // `script.name` is relative to the skill directory, so climbing one level per
  // segment from the script file lands on the skill root — the working directory
  // the Python original also runs scripts from.
  const skillDir = resolve(script.path, ...script.name.split('/').map(() => '..'));

  try {
    const { stdout } = await execFileAsync(process.execPath, [script.path, ...cliArgs], {
      cwd: skillDir,
      timeout: 60_000,
      encoding: 'utf8',
    });
    return stdout.trim() || `Script '${script.name}' completed successfully.`;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      killed?: boolean;
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };
    if (failure.killed) {
      return `Error: script '${script.name}' timed out after 60 seconds.`;
    }
    const details =
      failure.stderr?.trim() || failure.stdout?.trim() || failure.message || 'no error output was produced.';
    const exitCode = typeof failure.code === 'number' ? failure.code : 'unknown';
    return `Error: script '${script.name}' failed with exit code ${exitCode}: ${details}`;
  }
}

const skills = cacheSkills(
  directorySkillsSource({
    paths: [resolveSkillsDir()],
    // The bundled scripts are Node.js ESM rather than the `.py` default.
    scriptExtensions: ['.mjs'],
    scriptRunner: runLocalSkillScript,
  }),
);

const agent = new Agent({
  client: new FoundryChatClient({
    projectEndpoint,
    target: { modelDeployment: modelName },
  }),
  instructions:
    'You are a helpful travel planning assistant. When a user asks for a PDF ' +
    'travel guide, city guide, itinerary, or trip-planning document, use the ' +
    'travel-guide skill. After creating a guide, tell the user where the PDF ' +
    'was saved and summarize what it contains.',
  contextProviders: [
    skillsProvider(skills, {
      // In agent-framework-js every skill tool defaults to `always_require` approval. This host
      // runs unattended — there is no one to answer an approval request mid-turn — and the Python
      // original runs its bundled, trusted script without an approval round-trip, so all three
      // are relaxed to mirror that behavior. The scripts come from this repository, not from the
      // model or a third party.
      approvals: {
        loadSkill: 'never_require',
        readSkillResource: 'never_require',
        runSkillScript: 'never_require',
      },
      onSkillError: (failure) => console.warn('[skill-error]', failure.skill, failure.error),
    }),
  ],
  // History is managed by the hosting infrastructure, thus there is no need
  // to store history by the service. Learn more at:
  // https://developers.openai.com/api/reference/resources/responses/methods/create
  defaultOptions: { store: false },
});

const server = new ResponsesHostServer({ agent });
const { port } = await serve(server);
console.log(`Agent host listening on 0.0.0.0:${port}`);

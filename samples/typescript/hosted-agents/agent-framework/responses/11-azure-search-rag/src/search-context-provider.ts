// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

/**
 * A RAG context provider backed by Azure AI Search.
 *
 * The Python sample uses `AzureAISearchContextProvider` from
 * `agent-framework-azure-ai-search`; agent-framework-js has no bundled
 * equivalent yet, so this file implements the same behaviour as a custom
 * {@link ContextProvider}: before each model invocation it runs a full-text
 * search with the run's user input as the query and injects the top matching
 * documents into the model context — a context prompt first, then one message
 * per retrieved document, each carrying its source for citations.
 *
 * ## Security considerations
 *
 * Everything a provider injects is indistinguishable from user input to the
 * model. Retrieved documents are untrusted text: they can carry instructions
 * aimed at the model, so never let them drive an authorization decision.
 */

import { DefaultAzureCredential } from '@azure/identity';
import type { TokenCredential } from '@azure/identity';
import { AzureKeyCredential, SearchClient } from '@azure/search-documents';
import type {
  ContextProvider,
  Message,
  ProviderRunContext,
} from '@polymind-inc/agent-framework';
import { textContent, textOf } from '@polymind-inc/agent-framework';

/** The document shape of the sample index — see provision-index.ts and README.md. */
interface SearchDocument {
  id?: string;
  content?: string;
  sourceName?: string;
  sourceLink?: string;
}

/** Construction options for {@link AzureAISearchContextProvider}. */
export interface AzureAISearchContextProviderConfig {
  /** Unique per agent; also names this provider's partition of the session state. */
  sourceId?: string;
  /** The Azure AI Search endpoint, e.g. `https://<your-search>.search.windows.net`. */
  endpoint: string;
  /** The search index to query. */
  indexName: string;
  /** Defaults to {@link DefaultAzureCredential}; pass an {@link AzureKeyCredential} to use an API key. */
  credential?: TokenCredential | AzureKeyCredential;
  /** Maximum number of documents to retrieve per run. Defaults to 5. */
  topK?: number;
  /** Prepended to the retrieved documents. */
  contextPrompt?: string;
}

const DEFAULT_CONTEXT_PROMPT = 'Use the following context to answer the question:';

export class AzureAISearchContextProvider implements ContextProvider {
  readonly sourceId: string;
  readonly #client: SearchClient<SearchDocument>;
  readonly #topK: number;
  readonly #contextPrompt: string;

  constructor(config: AzureAISearchContextProviderConfig) {
    this.sourceId = config.sourceId ?? 'azure_ai_search';
    this.#client = new SearchClient<SearchDocument>(
      config.endpoint,
      config.indexName,
      config.credential ?? new DefaultAzureCredential(),
    );
    this.#topK = config.topK ?? 5;
    this.#contextPrompt = config.contextPrompt ?? DEFAULT_CONTEXT_PROMPT;
  }

  /** Runs the search with the run's input and injects the matching documents. */
  async beforeRun(ctx: ProviderRunContext): Promise<void> {
    // Build the query from the caller's user/assistant messages, like the
    // Python provider's semantic mode does.
    const query = ctx.inputMessages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => textOf(message).trim())
      .filter((text) => text.length > 0)
      .join('\n');
    if (!query) {
      return;
    }

    const found = await this.#client.search(query, { top: this.#topK });
    const documents: Message[] = [];
    for await (const result of found.results) {
      const text = formatDocument(result.document);
      if (text) {
        // Injected messages are stamped with this provider's source id automatically.
        documents.push({ role: 'user', contents: [textContent(text)] });
      }
    }
    if (documents.length === 0) {
      return;
    }

    ctx.extendMessages([
      { role: 'user', contents: [textContent(this.#contextPrompt)] },
      ...documents,
    ]);
  }
}

/**
 * Renders one retrieved document as `[Source: id] content`, with the source
 * document's name and link appended so the model can cite it.
 */
function formatDocument(doc: SearchDocument): string | undefined {
  const content = doc.content?.trim();
  if (!content) {
    return undefined;
  }
  let text = doc.id ? `[Source: ${doc.id}] ${content}` : content;
  if (doc.sourceName) {
    const link = doc.sourceLink ? `, ${doc.sourceLink}` : '';
    text += `\n(Source document: ${doc.sourceName}${link})`;
  }
  return text;
}

// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

import type { Tool } from '@polymind-inc/agent-framework';

import { servicebusPeekMessages, servicebusSendMessage } from './servicebus.js';
import { storageGetBlob, storagePutBlob } from './storage.js';

export const ALL_TOOLS: Tool[] = [
  storagePutBlob,
  storageGetBlob,
  servicebusSendMessage,
  servicebusPeekMessages,
];

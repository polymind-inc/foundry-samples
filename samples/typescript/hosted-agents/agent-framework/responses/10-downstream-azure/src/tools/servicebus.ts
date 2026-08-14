// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

/**
 * Azure Service Bus tools (queue, namespace-MI auth).
 *
 * RBAC: the calling principal needs `Azure Service Bus Data Sender` to send
 * and `Azure Service Bus Data Receiver` to peek/receive — see the sample
 * README.
 */

import { DefaultAzureCredential } from '@azure/identity';
import { ServiceBusClient } from '@azure/service-bus';
import { tool } from '@polymind-inc/agent-framework';
import { z } from 'zod';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set.`);
  }
  return value;
}

function createClient(): ServiceBusClient {
  const fqdn = requireEnv('AZURE_SERVICEBUS_FQDN');
  return new ServiceBusClient(fqdn, new DefaultAzureCredential());
}

function queueName(): string {
  return requireEnv('AZURE_SERVICEBUS_QUEUE_NAME');
}

export const servicebusSendMessage = tool({
  name: 'servicebus_send_message',
  description: 'Send a single message to the configured Service Bus queue.',
  approvalMode: 'never_require',
  parameters: z.object({
    body: z.string().describe('Message body as text.'),
  }),
  execute: async ({ body }) => {
    const queue = queueName();
    const client = createClient();
    const sender = client.createSender(queue);
    try {
      await sender.sendMessages({ body });
    } finally {
      await sender.close();
      await client.close();
    }
    console.log(`Sent message to ${queue} (${body.length} bytes)`);
    return `Sent message to queue '${queue}'.`;
  },
});

export const servicebusPeekMessages = tool({
  name: 'servicebus_peek_messages',
  description: 'Peek up to `max_count` messages from the queue without removing them.',
  approvalMode: 'never_require',
  parameters: z.object({
    max_count: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe('Maximum number of messages to peek.'),
  }),
  execute: async ({ max_count: maxCount }) => {
    const queue = queueName();
    const client = createClient();
    const receiver = client.createReceiver(queue);
    let messages;
    try {
      messages = await receiver.peekMessages(maxCount);
    } finally {
      await receiver.close();
      await client.close();
    }
    if (messages.length === 0) {
      return 'Queue is empty.';
    }
    const bodies = messages.map((m) =>
      typeof m.body === 'string' ? m.body : JSON.stringify(m.body),
    );
    return `Peeked ${bodies.length} message(s):\n` + bodies.map((b) => `- ${b}`).join('\n');
  },
});

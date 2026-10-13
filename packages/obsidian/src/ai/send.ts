// The one module of the plugin that reaches the network (spec §13, §19): a request to an AI model the user set up, made
// with Obsidian's own request function, never an AI vendor's library. It is reached only from the send dialog, when the
// user presses Send on exactly what they were shown (test/policy.test.js holds both).
import { requestUrl } from 'obsidian';
import type { Transport } from '@graph-note/core';

/** Sends one request, as given, and gives back its status and text; a status of 400 or more is given back, not thrown. */
export const obsidianTransport: Transport = async (request) => {
  const reply = await requestUrl({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
    throw: false,
  });
  return { status: reply.status, text: reply.text };
};

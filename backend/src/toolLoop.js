import { chat } from './llm.js';

const MAX_ROUNDS = 5;

// Lets the model call tools until it gives a final answer.
// `execute(name, args)` runs one tool call and returns a string for the model.
export async function runToolLoop({ systemPrompt, history, tools, execute }) {
  const messages = [...history];
  let nudged = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await chat(systemPrompt, messages, tools);
    if (!msg.tool_calls?.length) {
      // After using tools the model sometimes ends with no text. Ask once for the reply.
      if (!msg.content && round > 0 && !nudged) {
        nudged = true;
        messages.push({ role: 'user', content: '(Now reply to the customer in one or two short sentences.)' });
        continue;
      }
      return msg.content || '';
    }

    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        // leave args empty; the tool will report what is missing
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: await execute(call.function.name, args) });
    }
  }
  return '';
}

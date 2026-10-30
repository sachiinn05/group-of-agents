import { chat } from './llm.js';

const MAX_ROUNDS = 4;

// Lets the model call tools until it gives a final answer.
// `execute(name, args)` runs one tool call and returns a string for the model.
export async function runToolLoop({ systemPrompt, history, tools, execute }) {
  const messages = [...history];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await chat(systemPrompt, messages, tools);
    if (!msg.tool_calls?.length) return msg.content || '';

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

// The only file that knows which LLM provider is used.
async function complete(body) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', ...body }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message;
}

export async function ask(systemPrompt, messages) {
  const message = await complete({ messages: [{ role: 'system', content: systemPrompt }, ...messages] });
  return message.content;
}

// Like ask(), but lets the model call tools. Returns the raw assistant message,
// which has `tool_calls` when the model wants to run one.
export function chat(systemPrompt, messages, tools) {
  return complete({ messages: [{ role: 'system', content: systemPrompt }, ...messages], tools });
}

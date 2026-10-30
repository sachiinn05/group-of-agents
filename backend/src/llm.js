// The only file that knows which LLM provider is used.
// Returns the raw assistant message, which has `tool_calls` when the model wants to run a tool.
export async function chat(systemPrompt, messages, tools) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools,
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message;
}

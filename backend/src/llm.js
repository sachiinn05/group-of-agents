// The only file that knows which LLM provider is used.
const MAX_RETRIES = 2;
const MAX_WAIT_MS = 12000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Groq tells us how long to wait when the per-minute token limit is hit.
function retryDelayMs(res, bodyText) {
  const header = Number(res.headers.get('retry-after'));
  const fromBody = Number((bodyText.match(/try again in ([\d.]+)s/i) || [])[1]);
  const seconds = header || fromBody || 5;
  return Math.ceil(seconds * 1000) + 300;
}

// Returns the raw assistant message, which has `tool_calls` when the model wants to run a tool.
export async function chat(systemPrompt, messages, tools) {
  for (let attempt = 0; ; attempt++) {
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
    if (res.ok) return (await res.json()).choices[0].message;

    const text = await res.text();
    const wait = retryDelayMs(res, text);
    if (res.status === 429 && attempt < MAX_RETRIES && wait <= MAX_WAIT_MS) {
      await sleep(wait);
      continue;
    }
    const err = new Error(`Groq error ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
}

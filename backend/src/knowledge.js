import { Document } from './db.js';

// Kept small on purpose: the free LLM tier allows few tokens per minute, so every request counts.
const WHOLE_IF_UNDER = 4000; // small knowledge bases are sent whole
const CHUNK_SIZE = 600;
const TOP_CHUNKS = 4;

export const tokenize = (s) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((t) => t.length > 1);

// Splits text into chunks of roughly CHUNK_SIZE characters, breaking on lines.
function chunk(filename, text) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current.length + line.length > CHUNK_SIZE && current) {
      chunks.push({ filename, text: current.trim() });
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) chunks.push({ filename, text: current.trim() });
  return chunks;
}

// Picks the parts of the owner's documents that matter for this question.
export async function findKnowledge(businessId, query) {
  const docs = await Document.find({ businessId });
  const total = docs.reduce((n, d) => n + d.text.length, 0);
  if (total === 0) return '';
  if (total <= WHOLE_IF_UNDER) return docs.map((d) => `[${d.filename}]\n${d.text}`).join('\n\n');

  const chunks = docs.flatMap((d) => chunk(d.filename, d.text));
  const queryTerms = [...new Set(tokenize(query))];
  const chunkTokens = chunks.map((c) => new Set(tokenize(c.text)));

  // Terms that appear in fewer chunks are worth more (a simple idf).
  const weight = (term) => {
    const df = chunkTokens.filter((set) => set.has(term)).length;
    return Math.log(1 + chunks.length / (1 + df));
  };
  const weights = queryTerms.map((t) => [t, weight(t)]);

  return chunks
    .map((c, i) => ({ c, score: weights.reduce((s, [t, w]) => s + (chunkTokens[i].has(t) ? w : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_CHUNKS)
    .map((x) => `[${x.c.filename}]\n${x.c.text}`)
    .join('\n\n');
}

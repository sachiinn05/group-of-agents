import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Agent, Attachment, Message } from './db.js';
import { requireAuth } from './auth.js';
import { ask, chat } from './llm.js';
import { TOOLS, runTool } from './emailTool.js';
import { extractText, isSupported } from './extractText.js';

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 3 } });

const MAX_FILE_TEXT = 8000; // characters of each file sent to the model

const getAgent = (id, userId) =>
  mongoose.isValidObjectId(id) ? Agent.findOne({ _id: id, userId }) : null;

// Turns stored messages into what the model sees, with attached file text appended.
async function buildHistory(messages) {
  const ids = messages.flatMap((m) => m.attachments.map((a) => a.attachmentId));
  const files = await Attachment.find({ _id: { $in: ids } }, 'filename text');
  const byId = new Map(files.map((f) => [f.id, f]));
  return messages.map((m) => {
    const parts = m.attachments
      .map((a) => byId.get(String(a.attachmentId)))
      .filter(Boolean)
      .map((f) => `\n\n[Attached file: ${f.filename}]\n${f.text.slice(0, MAX_FILE_TEXT)}`);
    return { role: m.role, content: m.content + parts.join('') };
  });
}

const MAX_TOOL_ROUNDS = 4;

// Runs the agent. Agents with tools may call them; we run each call and hand the result back.
export async function runAgent(agent, history, userId) {
  const tools = agent.tools.map((t) => TOOLS[t]).filter(Boolean);
  if (tools.length === 0) return { reply: await ask(agent.systemPrompt, history), sent: [] };

  const sent = [];
  const knownText = history.map((m) => m.content).join('\n');
  const messages = [...history];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const msg = await chat(agent.systemPrompt, messages, tools);
    if (!msg.tool_calls?.length) {
      // Add a fixed line for each email that really went out, so it shows even if the model forgets.
      const notes = sent.map(
        (s) => `\n\n✉️ Sent from ${s.from} to ${s.to}: "${s.subject}"${s.attachments.length ? ` (attached: ${s.attachments.join(', ')})` : ''}`
      );
      return { reply: (msg.content || 'Done.') + notes.join(''), sent };
    }
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        // leave args empty; the tool will report what is missing
      }
      const content = await runTool(call.function.name, args, { userId, agentId: agent._id, knownText, sent });
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }
  return { reply: 'I could not finish that. Please try again.', sent };
}

// List the logged-in user's agents
router.get('/', async (req, res) => {
  const agents = await Agent.find({ userId: req.userId }, 'name role category');
  res.json(agents.map((a) => ({ id: a.id, name: a.name, role: a.role, category: a.category })));
});

// Saved chat history for one agent
router.get('/:id/messages', async (req, res) => {
  const agent = await getAgent(req.params.id, req.userId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  const messages = await Message.find({ agentId: agent._id }).sort({ _id: 1 }).limit(100);
  res.json(
    messages.map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments.map((a) => a.filename),
    }))
  );
});

// Create a custom agent
router.post('/', async (req, res) => {
  const { name, role, system_prompt } = req.body;
  if (!name || !system_prompt) return res.status(400).json({ error: 'name and system_prompt required' });
  const agent = await Agent.create({ userId: req.userId, name, role, systemPrompt: system_prompt });
  res.status(201).json({ id: agent.id });
});

// Chat with one agent (history is kept per agent). Accepts JSON, or multipart with files.
router.post('/:id/chat', upload.array('files', 3), async (req, res) => {
  const agent = await getAgent(req.params.id, req.userId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  const files = req.files || [];
  const message = (req.body.message || '').trim();
  if (!message && files.length === 0) return res.status(400).json({ error: 'message required' });

  const bad = files.find((f) => !isSupported(f.originalname));
  if (bad) return res.status(400).json({ error: `Unsupported file type: ${bad.originalname}` });

  const saved = [];
  try {
    for (const f of files) {
      const text = await extractText(f.originalname, f.buffer);
      if (!text) return res.status(400).json({ error: `No readable text in ${f.originalname}` });
      saved.push(
        await Attachment.create({
          userId: req.userId,
          agentId: agent._id,
          filename: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
          text,
          data: f.buffer,
        })
      );
    }
  } catch (e) {
    return res.status(400).json({ error: `Could not read file: ${e.message}` });
  }

  await Message.create({
    agentId: agent._id,
    role: 'user',
    content: message || '(see attached file)',
    attachments: saved.map((a) => ({ attachmentId: a._id, filename: a.filename })),
  });
  const recent = await Message.find({ agentId: agent._id }).sort({ _id: -1 }).limit(20);
  const history = await buildHistory(recent.reverse());
  try {
    const { reply, sent } = await runAgent(agent, history, req.userId);
    await Message.create({ agentId: agent._id, role: 'assistant', content: reply });
    res.json({ agent: agent.name, reply, sent });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

export default router;

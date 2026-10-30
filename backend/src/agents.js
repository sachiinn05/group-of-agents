import { Router } from 'express';
import mongoose from 'mongoose';
import { Agent, Message } from './db.js';
import { requireAuth } from './auth.js';
import { ask } from './llm.js';

const router = Router();
router.use(requireAuth);

const getAgent = (id, userId) =>
  mongoose.isValidObjectId(id) ? Agent.findOne({ _id: id, userId }) : null;

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
  res.json(messages.map((m) => ({ role: m.role, content: m.content })));
});

// Create a custom agent
router.post('/', async (req, res) => {
  const { name, role, system_prompt } = req.body;
  if (!name || !system_prompt) return res.status(400).json({ error: 'name and system_prompt required' });
  const agent = await Agent.create({ userId: req.userId, name, role, systemPrompt: system_prompt });
  res.status(201).json({ id: agent.id });
});

// Chat with one agent (history is kept per agent)
router.post('/:id/chat', async (req, res) => {
  const agent = await getAgent(req.params.id, req.userId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  await Message.create({ agentId: agent._id, role: 'user', content: message });
  const recent = await Message.find({ agentId: agent._id }).sort({ _id: -1 }).limit(20);
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }));
  try {
    const reply = await ask(agent.systemPrompt, history);
    await Message.create({ agentId: agent._id, role: 'assistant', content: reply });
    res.json({ agent: agent.name, reply });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

export default router;

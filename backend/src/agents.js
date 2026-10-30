import { Router } from 'express';
import { db } from './db.js';
import { requireAuth } from './auth.js';
import { ask } from './llm.js';

const router = Router();
router.use(requireAuth);

const getAgent = (id, userId) =>
  db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(id, userId);

// List the logged-in user's agents
router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, name, role FROM agents WHERE user_id = ?').all(req.userId));
});

// Create a custom agent
router.post('/', (req, res) => {
  const { name, role, system_prompt } = req.body;
  if (!name || !system_prompt) return res.status(400).json({ error: 'name and system_prompt required' });
  const { lastInsertRowid } = db
    .prepare('INSERT INTO agents (user_id, name, role, system_prompt) VALUES (?, ?, ?, ?)')
    .run(req.userId, name, role || '', system_prompt);
  res.status(201).json({ id: Number(lastInsertRowid) });
});

// Chat with one agent (history is kept per agent)
router.post('/:id/chat', async (req, res) => {
  const agent = getAgent(req.params.id, req.userId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const save = db.prepare('INSERT INTO messages (agent_id, role, content) VALUES (?, ?, ?)');
  save.run(agent.id, 'user', message);
  const history = db
    .prepare('SELECT role, content FROM messages WHERE agent_id = ? ORDER BY id DESC LIMIT 20')
    .all(agent.id)
    .reverse();
  try {
    const reply = await ask(agent.system_prompt, history);
    save.run(agent.id, 'assistant', reply);
    res.json({ agent: agent.name, reply });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

export default router;

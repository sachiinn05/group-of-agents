import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './db.js';
import { seedAgents } from './defaultAgents.js';

const router = Router();
const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (await User.exists({ email })) {
    return res.status(409).json({ error: 'email already registered' });
  }
  const user = await User.create({ email, password: bcrypt.hashSync(password, 10) });
  await seedAgents(user._id);
  res.status(201).json({ token: sign(user.id) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: sign(user.id) });
});

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

export default router;

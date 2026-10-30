import express from 'express';
import cors from 'cors';
import authRoutes from './auth.js';
import agentRoutes from './agents.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/agents', agentRoutes);

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));

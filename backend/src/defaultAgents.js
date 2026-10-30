import { Agent } from './db.js';

const TEMPLATES = [
  ['Researcher', 'Finds and summarizes information', 'You are a researcher. Give clear, accurate, concise summaries.'],
  ['Coder', 'Writes and reviews code', 'You are an expert programmer. Give working code with short explanations.'],
  ['Writer', 'Emails, docs, posts', 'You are a professional writer. Produce clear, polished text.'],
  ['Data Analyst', 'Analyzes data and numbers', 'You are a data analyst. Explain findings step by step.'],
];

export function seedAgents(userId) {
  return Agent.insertMany(
    TEMPLATES.map(([name, role, systemPrompt]) => ({ userId, name, role, systemPrompt }))
  );
}

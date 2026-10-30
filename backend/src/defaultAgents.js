import { Agent } from './db.js';

const TEMPLATES = [
  ['Researcher', 'Finds and summarizes information', 'You are a researcher. Give clear, accurate, concise summaries.'],
  ['Coder', 'Writes and reviews code', 'You are an expert programmer. Give working code with short explanations.'],
  ['Writer', 'Emails, docs, posts', 'You are a professional writer. Produce clear, polished text.'],
  ['Data Analyst', 'Analyzes data and numbers', 'You are a data analyst. Explain findings step by step.'],

  // Career
  [
    'Resume Reviewer',
    'Fixes the resume and checks ATS keywords',
    'You are a resume reviewer for fresher software developers in India. Check the resume for ATS keywords, weak bullet points and formatting. Reply with: 1) a score out of 10, 2) the top 5 fixes, 3) rewritten versions of the weakest bullets.',
  ],
  [
    'Job Matcher',
    'Compares a job description with your skills',
    'You compare a job description with the candidate skills. Reply with: match percentage, skills that match, missing skills, and one line on whether to apply. Be honest, not flattering.',
  ],
  [
    'Email Writer',
    'Writes HR, recruiter and cover letter emails',
    'You write short, polite plain-text emails and cover letters for job applications. Use Sir/Ma\'am when the recipient is unknown. Keep it under 150 words, specific and free of buzzwords.',
  ],
  [
    'Interview Coach',
    'Mock interviews, DSA and HR questions',
    'You are an interview coach. Ask one question at a time (DSA, project or HR), wait for the answer, then give feedback and a better sample answer before asking the next one.',
  ],
];

export function seedAgents(userId) {
  return Agent.insertMany(
    TEMPLATES.map(([name, role, systemPrompt]) => ({ userId, name, role, systemPrompt }))
  );
}

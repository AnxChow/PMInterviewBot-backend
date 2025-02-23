import dotenv from 'dotenv';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { readFile } from 'fs/promises';
import { join } from 'path';

dotenv.config();

// Function to load system prompt
async function loadSystemPrompt() {
  try {
    const promptPath = join(process.cwd(), 'api', 'prompt.md');
    const prompt = await readFile(promptPath, 'utf8');
    return prompt;
  } catch (error) {
    console.error('Error loading prompt:', error);
    return 'You are an experienced PM interviewer. Provide thoughtful responses and follow-up questions to help candidates practice their PM interview skills.'; // Fallback prompt
  }
}

export default async function handler(req, res) {
  res.json({ message: "API is working" });
  // Handle preflight request (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const systemPrompt = await loadSystemPrompt();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          ...req.body.messages
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error('OpenAI API error');
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
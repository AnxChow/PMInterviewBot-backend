import express from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';  // Add this if not already imported
import FormData from 'form-data';
import { Readable } from 'stream';  // Add this for handling buffers
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
dotenv.config();
app.use(cors({
  origin: ['https://pm-interview-bot.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json({ limit: '50mb' }));  // Increased limit for audio data
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// // Rate limiting middleware
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100 // limit each IP to 100 requests per windowMs
// });

// app.use(limiter);
// app.use(express.json());

async function loadSystemPrompt() {
    try {
      const promptPath = path.join(__dirname, 'prompt.md');
      const prompt = await readFile(promptPath, 'utf8');
      return prompt;
    } catch (error) {
      console.error('Error loading prompt:', error);
      return 'You are an experienced PM interviewer. Provide thoughtful responses and follow-up questions to help candidates practice their PM interview skills.'; // Fallback prompt
    }
  }

// Handle text-based chat
app.post('/api/chat', async (req, res) => {
  try {
    const systemPrompt = await loadSystemPrompt();  // Add await here
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
          max_tokens: 2000,  // Added this
        // temperature: 0.7,  // Optional: add this for more consistent responses
        // presence_penalty: 0.6,  // Optional: helps prevent repetition
        // frequency_penalty: 0.5   // Optional: helps prevent repetition
      }),
    });

    if (!response.ok) {
      throw new Error('OpenAI API error');
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle audio transcription
app.post('/api/transcribe', async (req, res) => {
    try {
      console.log("Received audio request");
      const audioBuffer = Buffer.from(req.body.audio, 'base64');
      
      const formData = new FormData();
      // Create a readable stream from the buffer
      const stream = Readable.from(audioBuffer);
      formData.append('file', stream, {
        filename: 'audio.webm',
        contentType: 'audio/webm',
      });
      formData.append('model', 'whisper-1');
  
      console.log("Sending to OpenAI...");
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData
      });
  
      console.log("OpenAI response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI error:", errorText);
        throw new Error(errorText);
      }
  
      const data = await response.json();
      console.log("Transcription successful");
      res.json(data);
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
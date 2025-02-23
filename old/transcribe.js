import dotenv from 'dotenv';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { Readable } from 'stream';

dotenv.config();

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
    const audioBuffer = Buffer.from(req.body.audio, 'base64');
    const formData = new FormData();
    const stream = Readable.from(audioBuffer);
    formData.append('file', stream, {
      filename: 'audio.webm',
      contentType: 'audio/webm',
    });
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Transcription error:', error);
    return res.status(500).json({ error: error.message });
  }
}
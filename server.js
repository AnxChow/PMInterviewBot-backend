import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import rateLimit from 'express-rate-limit';

import cors from 'cors';
import fetch from 'node-fetch';  // Add this if not already imported
import FormData from 'form-data';
import { Readable } from 'stream';  // Add this for handling buffers
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import pkg from 'pg';
import { errorHandler } from './middleware/errorHandler.js';
import { ensureAuthenticated } from './middleware/auth.js';

import config from './config.js'


const { Pool } = pkg;
const app = express();
const CLIENT_URL = config.clientUrl;
console.log('API Key loaded:', config.openaiKey ? 'Yes' : 'No');
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});
// Configure Passport to use Google OAuth
passport.use(new GoogleStrategy({
  clientID: config.googleClientId,
  clientSecret: config.googleClientSecret,
  callbackURL: `${config.serverUrl}/auth/google/callback`
},
  (accessToken, refreshToken, profile, done) => {
    // In production, you would look up or create a user record in your DB here.
    // For now, we'll simply return the Google profile.
    return done(null, profile);
  }
));

// Configure Passport session management
passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((user, done) => {
  done(null, user);
});

// Setup session middleware (must come before passport.initialize())
app.use(session({
  secret: config.sessionSecret || 'defaultsecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax' }
}));

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

app.use(cors({
  origin: [config.clientUrl],
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));  // Increased limit for audio data
const __filename = fileURLToPath(import.meta.url);

// Route to start the Google OAuth flow
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google OAuth callback route
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    // Extract details from the authenticated user's Google profile
    const googleId = req.user.id;
    const name = req.user.displayName;
    const email = req.user.emails[0].value;
    
    try {
      // Check if user already exists
      const result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
      if (result.rows.length === 0) {
        // Create new user if not found
        await pool.query('INSERT INTO users (google_id, name, email) VALUES ($1, $2, $3)', [googleId, name, email]);
      }
    } catch (err) {
      console.error('Error querying/inserting user:', err);
    }
    
    // Redirect to your client app
    res.redirect(CLIENT_URL);
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    res.json({ now: result.rows[0].now });
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ error: 'Database connection error' });
  }
});




// // Rate limiting middleware
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100 // limit each IP to 100 requests per windowMs
// });

// app.use(limiter);
// app.use(express.json());


async function loadPromptForRole(interviewType) {
  try {
    console.log('Loading prompt for role:', interviewType);
    const promptPath = path.join(process.cwd(), 'prompts', `${interviewType}.md`);
    console.log('Prompt path:', promptPath);
    const prompt = await readFile(promptPath, 'utf8');
    console.log('Loaded prompt:', prompt.substring(0, 100) + '...');
    return prompt;
  } catch (error) {
    console.error('Error loading prompt:', error);
    return 'You are an experienced interviewer. Provide thoughtful responses and follow-up questions.';
  }
}


// Handle text-based chat
app.post('/api/chat', async (req, res) => {
  try {
    console.log('Received request with interviewType:', req.body.interviewType);
    const { messages, interviewType } = req.body;
    const systemPrompt = await loadPromptForRole(interviewType);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
            {
                role: 'system',
                content: systemPrompt
              },
            ...messages
          ],
          max_tokens: 2000,  // Added this
        // temperature: 0.7,  // Optional: add this for more consistent responses
        // presence_penalty: 0.6,  // Optional: helps prevent repetition
        // frequency_penalty: 0.5   // Optional: helps prevent repetition
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();  // Get error details
      console.log('OpenAI error response:', errorData);  // Log it
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
          'Authorization': `Bearer ${config.openaiKey}`,
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

  // In your server.js (backend)
app.get('/api/current-user', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Also add a logout route:
app.get('/auth/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect(CLIENT_URL);
  });
});



  app.post('/api/save', ensureAuthenticated, async (req, res) => {
    const { transcription } = req.body;  // You could also use audioData if you plan to store binary data
    if (!transcription) {
      return res.status(400).json({ error: 'transcription is required' });
    }
    try {
      // Get the user’s database ID using their Google ID from the session (req.user)
      const googleId = req.user.id;
      const userResult = await pool.query('SELECT id FROM users WHERE google_id = $1', [googleId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;
      
      // Insert the recording record
      const insertResult = await pool.query(
        'INSERT INTO transcriptions (user_id, transcription) VALUES ($1, $2) RETURNING *',
        [userId, transcription]
      );
      res.json(insertResult.rows[0]);
    } catch (err) {
      console.error('Error saving recording:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/save', ensureAuthenticated, async (req, res) => {
    try {
      const googleId = req.user.id;
      const userResult = await pool.query('SELECT id FROM users WHERE google_id = $1', [googleId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;
      
      // Fetch recordings for the user, ordering by the most recent first
      const recordingsResult = await pool.query(
        'SELECT * FROM transcriptions WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      res.json(recordingsResult.rows);
    } catch (err) {
      console.error('Error fetching recordings:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/api/save/:id', ensureAuthenticated, async (req, res) => {
    const { id } = req.params;
    try {
      // Assuming you store transcriptions in a table called "recordings"
      const result = await pool.query('DELETE FROM transcriptions WHERE id = $1 RETURNING *', [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Recording not found' });
      }
      res.json({ message: 'Recording deleted', recording: result.rows[0] });
    } catch (err) {
      console.error('Error deleting recording:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  

  app.use(errorHandler);

  const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
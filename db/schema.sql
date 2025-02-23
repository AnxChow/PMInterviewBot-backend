-- Users table to store authenticated user data
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255)
);

-- Recordings table to store transcriptions
CREATE TABLE IF NOT EXISTS transcriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  transcription TEXT,         -- or audio_data BYTEA if you decide to store files directly
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

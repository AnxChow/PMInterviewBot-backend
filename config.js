import dotenv from 'dotenv';
dotenv.config();

const config = {
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    serverUrl: process.env.SERVER_URL || 'http://localhost:3001',
    databaseUrl: process.env.DATABASE_URL,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    sessionSecret: process.env.SESSION_SECRET || 'defaultsecret',
    openaiKey: process.env.OPENAI_API_KEY,
    port: process.env.PORT || 3001
  };
  
  export default config;
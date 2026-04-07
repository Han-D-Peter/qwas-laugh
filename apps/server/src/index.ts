import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socket/handlers.js';

const app = express();
const httpServer = createServer(app);

// CORS: In production, set CLIENT_ORIGIN to your Cloudflare Pages URL
// e.g. "https://qwas-laugh.pages.dev"
// Multiple origins can be comma-separated: "https://a.com,https://b.com"
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.CLIENT_ORIGIN || '*').split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

const corsOpts = {
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true,
};

const io = new Server(httpServer, { cors: corsOpts });
app.use(cors(corsOpts));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Serve TURN/ICE server credentials to clients
app.get('/api/turn-credentials', (_req, res) => {
  const turnUrl = process.env.TURN_SERVER_URL;
  const turnUser = process.env.TURN_USER || '';
  const turnPassword = process.env.TURN_PASSWORD || '';

  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Add TURN server if configured (e.g. Metered.ca or self-hosted coturn)
  if (turnUrl && turnUser && turnPassword) {
    iceServers.push(
      { urls: turnUrl, username: turnUser, credential: turnPassword },
      { urls: turnUrl.replace('turn:', 'turns:'), username: turnUser, credential: turnPassword },
    );
  }

  res.json({ iceServers });
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});

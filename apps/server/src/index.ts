import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socket/handlers.js';

const app = express();
const httpServer = createServer(app);

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.CLIENT_ORIGIN || '*']
  : ['http://localhost:3000', 'http://localhost:5173'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: allowedOrigins }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve TURN server credentials to clients
app.get('/api/turn-credentials', (_req, res) => {
  const turnUrl = process.env.TURN_SERVER_URL || 'stun:stun.l.google.com:19302';
  const turnUser = process.env.TURN_USER || '';
  const turnPassword = process.env.TURN_PASSWORD || '';

  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: 'stun:stun.l.google.com:19302' },
  ];

  if (turnUser && turnPassword) {
    iceServers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnPassword,
    });
  }

  res.json({ iceServers });
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

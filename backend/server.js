import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../Frontend/.env') });

import { connectDB, isDbConnected } from './src/config/db.js';
import sitesRouter from './src/routes/sites.routes.js';
import casesRouter from './src/routes/cases.routes.js';
import webhooksRouter from './src/routes/webhooks.routes.js';

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:8080';

// Enable CORS for frontend application
app.use(
  cors({
    origin: [CLIENT_ORIGIN, 'http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:5173'],
    credentials: true,
  })
);

// Support XML/plain text for Salesforce Outbound Messaging, plus standard JSON/URL-encoded
app.use(express.text({ type: ['text/*', 'application/xml', 'text/xml'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Lightweight health check endpoint for Docker & Nginx
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'insight-hub-backend',
  });
});

// Detailed health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      connected: isDbConnected(),
      provider: 'MongoDB',
    },
    salesforce: {
      instance: process.env.SF_INSTANCE_URL || 'configured',
    },
  });
});

// Mount application routes
app.use('/api/sites', sitesRouter);
app.use('/api/cases', casesRouter);
app.use('/api/webhooks', webhooksRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
async function startServer() {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`  Insight Hub Backend Service running on port ${PORT}`);
    console.log(`  Health Check: http://localhost:${PORT}/api/health`);
    console.log(`  Sites API:    http://localhost:${PORT}/api/sites`);
    console.log(`  Webhooks API: http://localhost:${PORT}/api/webhooks/salesforce`);
    console.log(`=======================================================`);
  });
}

startServer();

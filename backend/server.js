// God's Eye Backend Server - Live Salesforce & Site Management [reload 39 - 10:49]
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../Frontend/.env') });

import fs from 'fs';
import { connectDB, isDbConnected } from './src/config/db.js';

// Auto-copy user uploaded GreyOrange logo to Frontend public folder
try {
  const logoSource = 'C:\\Users\\aditya.s.ctr\\.gemini\\antigravity-ide\\brain\\cf935505-4d18-4c58-8714-38813cace52e\\.user_uploaded\\media_1792269238564.jpg';
  const logoDestDir = path.resolve(__dirname, '../Frontend/public');
  if (fs.existsSync(logoSource)) {
    if (!fs.existsSync(logoDestDir)) fs.mkdirSync(logoDestDir, { recursive: true });
    fs.copyFileSync(logoSource, path.join(logoDestDir, 'greyorange-logo.jpg'));
    fs.copyFileSync(logoSource, path.join(logoDestDir, 'greyorange-logo.png'));
  }
} catch {}
import sitesRouter from './src/routes/sites.routes.js';
import casesRouter from './src/routes/cases.routes.js';
import webhooksRouter from './src/routes/webhooks.routes.js';
import analyticsRouter from './src/routes/analytics.routes.js';

import { getSfConfig, getSalesforceToken, getLastSalesforceError, fetchRedZoneSitesOverview } from './src/services/salesforce.service.js';

// Process Safety Handlers - prevent container crashes from uncaught errors or unhandled promise rejections
process.on('uncaughtException', (err) => {
  console.error('[Process Safety] Uncaught exception intercepted:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process Safety] Unhandled promise rejection intercepted:', reason?.message || reason);
});

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend application (reflect origin or accept all allowed hosts)
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Support XML/plain text for Salesforce Outbound Messaging, plus standard JSON/URL-encoded with generous limits for sheet data
app.use(express.text({ type: ['text/*', 'application/xml', 'text/xml'], limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Detailed health check endpoint with full Salesforce & MongoDB diagnostics
app.get('/api/health', async (req, res) => {
  const { instanceUrl, clientId, clientSecret } = getSfConfig();
  const isSfConfigured = Boolean(clientId && clientSecret && instanceUrl);
  let liveAuth = null;

  if (req.query.test === 'true' || req.query.test_sf === 'true') {
    try {
      await getSalesforceToken();
      liveAuth = { ok: true, message: 'Salesforce OAuth authentication succeeded' };
    } catch (err) {
      liveAuth = { ok: false, error: err.message };
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      connected: isDbConnected(),
      provider: 'MongoDB',
      uri_configured: Boolean(process.env.MONGODB_URI),
    },
    salesforce: {
      configured: isSfConfigured,
      instance: instanceUrl,
      clientIdMasked: clientId ? `${clientId.slice(0, 6)}...${clientId.slice(-4)}` : 'MISSING',
      clientSecretConfigured: Boolean(clientSecret),
      lastError: getLastSalesforceError(),
      liveAuth,
    },
  });
});

// Mount application routes
app.use('/api/sites', sitesRouter);
app.use('/api/cases', casesRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/analytics', analyticsRouter);

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

    // Pre-warm Red Zone telemetry cache asynchronously so initial user clicks respond in < 5ms
    setTimeout(() => {
      fetchRedZoneSitesOverview().catch(err => {
        console.warn('[Startup] Red Zone cache pre-warm notice:', err.message);
      });
    }, 2000);
  });
}

startServer();

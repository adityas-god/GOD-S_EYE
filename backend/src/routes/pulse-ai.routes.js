import { Router } from 'express';
import { PulseAuthRepository } from '../models/PulseAuth.js';
import {
  chatWithPulseAI,
  getOrCreateSession,
  clearSession,
  getSessionMessages,
  getLastPulseAiStatus,
} from '../services/pulse-ai.service.js';

const router = Router();

/**
 * POST /api/pulse-ai/auth
 * Authenticates or registers an Organization ID with password in MongoDB.
 * Initializes an isolated, ephemeral in-memory session.
 */
router.post('/auth', async (req, res) => {
  try {
    const { org_id, orgId, password } = req.body || {};
    const targetOrg = org_id || orgId;

    if (!targetOrg || !password) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID and Password are required',
      });
    }

    const authResult = await PulseAuthRepository.authenticateOrRegister(targetOrg, password);
    if (!authResult.success) {
      return res.status(401).json(authResult);
    }

    // Allocate an isolated ephemeral session in memory
    const session = getOrCreateSession(null, authResult.orgId);

    return res.json({
      success: true,
      orgId: authResult.orgId,
      sessionId: session.id,
      isNew: authResult.isNew,
      message: authResult.isNew ? 'New Organization account registered and session started' : 'Authenticated successfully',
    });
  } catch (err) {
    console.error('[Pulse AI Auth Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Authentication failed',
    });
  }
});

/**
 * POST /api/pulse-ai/chat
 * Multi-turn chat message with Pulse AI.
 * Employs ephemeral in-memory session context and agentic tool invocation.
 */
router.post('/chat', async (req, res) => {
  try {
    const { sessionId, message, orgId } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message text is required',
      });
    }

    const session = getOrCreateSession(sessionId, orgId);
    const result = await chatWithPulseAI({
      sessionId: session.id,
      message,
      orgId: session.orgId,
    });

    return res.json({
      success: true,
      reply: result.reply,
      toolsUsed: result.toolsUsed || [],
      sessionId: result.sessionId,
      orgId: result.orgId,
    });
  } catch (err) {
    console.error('[Pulse AI Chat Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Error processing request with Pulse AI',
    });
  }
});

/**
 * POST /api/pulse-ai/clear
 * Resets / deletes in-memory chat session data (zero DB trace).
 */
router.post('/clear', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (sessionId) {
      clearSession(sessionId);
    }
    return res.json({
      success: true,
      message: 'Ephemeral chat session deleted and reset',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/pulse-ai/session
 * Checks if active session exists in memory.
 */
router.get('/session', (req, res) => {
  const { sessionId } = req.query;
  const messages = sessionId ? getSessionMessages(sessionId) : [];
  return res.json({
    success: true,
    active: Boolean(sessionId && messages),
    messagesCount: messages.length,
  });
});

/**
 * GET /api/pulse-ai/status
 * Returns operational provider status (OpenRouter / Gemini / active model).
 */
router.get('/status', (req, res) => {
  return res.json({
    success: true,
    status: getLastPulseAiStatus(),
  });
});

export default router;

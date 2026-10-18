import { Router } from 'express';
import {
  getCasesAnalytics,
  getAlertsAnalytics,
  clearAnalyticsCache,
  TIMEFRAMES,
} from '../services/analytics.service.js';

const router = Router();

/**
 * GET /api/analytics/timeframes
 * Return available analytics timeframes
 */
router.get('/timeframes', (req, res) => {
  res.json({
    success: true,
    timeframes: Object.values(TIMEFRAMES),
  });
});

/**
 * GET /api/analytics/cases
 * Query parameters:
 *   timeframe: '24h' | '48h' | '7d' | '15d' | '1m' | '2m' | '3m' | '6m' (default '7d')
 *   refresh: 'true' to bypass cache
 */
router.get('/cases', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '7d';
    const startDate = req.query.startDate || req.query.start || null;
    const endDate = req.query.endDate || req.query.end || null;
    const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
    if (forceRefresh) {
      clearAnalyticsCache();
    }
    const data = await getCasesAnalytics({ timeframe, startDate, endDate, forceRefresh });
    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('[Analytics Cases Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/alerts
 * Query parameters:
 *   timeframe: '24h' | '48h' | '7d' | '15d' | '1m' | '2m' | '3m' | '6m' | 'custom' (default '7d')
 *   startDate, endDate (when timeframe === 'custom')
 *   refresh: 'true' to bypass cache
 */
router.get('/alerts', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '7d';
    const startDate = req.query.startDate || req.query.start || null;
    const endDate = req.query.endDate || req.query.end || null;
    const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
    if (forceRefresh) {
      clearAnalyticsCache();
    }
    const data = await getAlertsAnalytics({ timeframe, startDate, endDate, forceRefresh });
    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('[Analytics Alerts Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

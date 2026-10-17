import { Router } from 'express';
import { CaseRepository } from '../models/Case.js';
import {
  fetchOpenCasesForSite,
  fetchLiveCasesOverview,
  getAlertAnalyticsForSite,
  fetchRedZoneSitesOverview,
  isLiveOpenCase,
  hasTicketEndTime,
  getTicketEndTime,
  fetchAllLiveCasesAndAlerts,
} from '../services/salesforce.service.js';

const router = Router();

/**
 * GET /api/cases/red-zone
 * Return all sites qualifying for RED Zone based on SF tickets:
 * Criteria-1: >=3 Sev-1 or >=5 Sev-2 in last 7 days
 * Criteria-3: MTBF < 36h in last 14 days (per-site basis)
 * Exit: 21 continuous days without breach
 */
router.get('/red-zone', async (req, res) => {
  try {
    const forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';
    const result = await fetchRedZoneSitesOverview({ forceRefresh });
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cases/alerts/analytics
 * Get historical alert metrics, bar/line graph buckets, MTTR, auto-resolve and breach statistics
 */
router.get('/alerts/analytics', async (req, res) => {
  try {
    const siteName = req.query.site || req.query.siteName || '';
    const range = req.query.range || '7d';
    const forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';
    const analytics = await getAlertAnalyticsForSite({ siteName, range, forceRefresh });
    res.json({
      success: true,
      ...analytics,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/sev-summary', async (req, res) => {
  try {
    const overview = await fetchLiveCasesOverview();
    const urgentSites = Object.values(overview.siteStats || {})
      .filter(s => s.sev1Count > 0 || s.sev2Count > 0)
      .map(s => ({
        siteName: s.siteName,
        sev1Count: s.sev1Count,
        sev2Count: s.sev2Count,
        count: s.count,
        alertCount: s.alertCount,
      }));
    res.json({
      success: true,
      urgentSitesCount: urgentSites.length,
      urgentSites,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/**
 * GET /api/cases
 * Get all open cases (excluding 'Closed' and 'On Hold')
 */
router.get('/', async (req, res) => {
  try {
    const { site } = req.query;
    if (site) {
      const result = await fetchOpenCasesForSite({ siteName: site });
      return res.json({
        success: true,
        count: result.cases.length,
        cases: result.cases,
        alerts: result.alerts,
        closed: result.closed || [],
      });
    }

    const openCases = await CaseRepository.findAllOpenCases();
    const strictlyFiltered = openCases.filter(c => isLiveOpenCase(c) && !hasTicketEndTime(c) && !getTicketEndTime(c));
    res.json({
      success: true,
      count: strictlyFiltered.length,
      cases: strictlyFiltered,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cases/overview
 * Get aggregated live open cases stats for all sites
 */
router.get('/overview', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
    const overview = await fetchLiveCasesOverview(forceRefresh);
    res.json({
      success: true,
      ...overview,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cases/site/:siteName
 * Get open cases not on hold for a specific site
 */
router.get('/site/:siteName', async (req, res) => {
  try {
    const { siteName } = req.params;
    const result = await fetchOpenCasesForSite({ siteName });
    res.json({
      success: true,
      siteName,
      totalOpenCases: result.totalOpenCases,
      cases: result.cases,
      alerts: result.alerts,
      closed: result.closed || [],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

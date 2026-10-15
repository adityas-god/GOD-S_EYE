import { Router } from 'express';
import { CaseRepository } from '../models/Case.js';
import { fetchOpenCasesForSite, fetchLiveCasesOverview, getLastSalesforceError } from '../services/salesforce.service.js';

const router = Router();

router.get('/test-soql', async (req, res) => {
  try {
    const overview = await fetchLiveCasesOverview(true);
    const lastErr = getLastSalesforceError();
    res.json({
      success: !lastErr,
      error: lastErr,
      overview,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
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
      });
    }

    const openCases = await CaseRepository.findAllOpenCases();
    res.json({
      success: true,
      count: openCases.length,
      cases: openCases,
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
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

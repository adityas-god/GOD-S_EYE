import { Router } from 'express';
import { CaseRepository } from '../models/Case.js';
import {
  fetchOpenCasesForSite,
  fetchLiveCasesOverview,
  getAlertAnalyticsForSite,
  fetchRedZoneSitesOverview,
  clearRedZoneSiteCache,
  isLiveOpenCase,
  hasTicketEndTime,
  getTicketEndTime,
  executeSOQL,
  getSfConfig,
} from '../services/salesforce.service.js';
import {
  getSheetConfig,
  syncRedZoneSheet,
  updateSheetUrlAndSync,
  syncFromCsvText,
} from '../services/sheets.service.js';

const router = Router();

/**
 * GET /api/cases/red-zone/sheet-config
 * Return Cloud Sheet sync status, current URL, and synced Red Zone sites
 */
router.get('/red-zone/sheet-config', (req, res) => {
  try {
    const config = getSheetConfig();
    res.json({ success: true, ...config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cases/red-zone/sheet-sync
 * Trigger cloud sheet sync, update the Google Sheet / OneDrive URL, or paste direct CSV/TSV data
 */
router.post('/red-zone/sheet-sync', async (req, res) => {
  try {
    const { url, csvData } = req.body || {};
    let syncResult;
    if (csvData && typeof csvData === 'string' && csvData.trim()) {
      syncResult = await syncFromCsvText(csvData.trim());
    } else if (url && typeof url === 'string' && url.trim()) {
      syncResult = await updateSheetUrlAndSync(url.trim());
    } else {
      syncResult = await syncRedZoneSheet({ force: true });
    }
    clearRedZoneSiteCache();
    res.json({
      success: syncResult.success,
      ...syncResult,
      sheetConfig: getSheetConfig(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    if (forceRefresh) {
      clearRedZoneSiteCache();
    }
    const siteName = req.query.site || req.query.siteName || '';
    const result = await fetchRedZoneSitesOverview({ forceRefresh, siteName });
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/red-zone/summary', async (req, res) => {
  try {
    clearRedZoneSiteCache();
    const forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';
    const siteName = req.query.site || req.query.siteName || '';
    const result = await fetchRedZoneSitesOverview({ forceRefresh, siteName });
    res.json({
      success: true,
      totalRedZoneSites: result.totalRedZoneSites,
      activeBreachesCount: result.activeBreachesCount,
      exitPendingCount: result.exitPendingCount,
      sites: result.redZoneSites.map(s => ({
        siteName: s.siteName,
        status: s.status,
        isCurrentBreach: s.isCurrentBreach,
        sev1_7d: s.criteria1.sev1Count7d,
        sev2_7d: s.criteria1.sev2Count7d,
        mtbf: s.criteria3.mtbfHours,
        reasons: s.reasons,
        qualifyingIncidents: (s.qualifyingIncidents || []).map(i => ({
          caseNumber: i.caseNumber,
          subject: i.subject,
          severity: i.severity,
          rawSeverity: i.rawSeverity,
          createdDate: i.createdDate,
        })),
      })),
      timestamp: result.timestamp,
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
    const startDate = req.query.startDate || req.query.start || null;
    const endDate = req.query.endDate || req.query.end || null;
    const forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';
    const analytics = await getAlertAnalyticsForSite({ siteName, range, startDate, endDate, forceRefresh });
    res.json({
      success: true,
      ...analytics,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



/**
 * GET /api/cases/test-soql
 * Live test query directly against Salesforce API
 */
router.get('/test-soql', async (req, res) => {
  try {
    const query = req.query.q || "SELECT Id, CaseNumber, Status, Subject, AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Description FROM Case WHERE CaseNumber IN ('00295792', '00295731', '00295730', '00295244')";
    const paginate = req.query.paginate === 'true';
    const result = await executeSOQL(query, { paginate, maxRecords: 6000 });
    res.json({
      success: true,
      totalSize: result.totalSize,
      recordsCount: result.records?.length,
      records: result.records || [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      connected: false,
      error: error.message,
    });
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
        product_lines: result.product_lines || [],
        product_line: result.product_line || null,
        site: result.site || null,
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
    console.error('[Cases API] Error in /overview:', error);
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
    const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
    const result = await fetchOpenCasesForSite({ siteName, forceRefresh });
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

/**
 * GET /api/cases/debug-inspect
 * Plain text inspection of live cases for Essilor, H&M, and Sams
 */
router.get('/debug-inspect', async (req, res) => {
  try {
    const { fetchAllLiveCasesAndAlerts, compileSiteIndex, findBestSiteForCase, DEFAULT_ALL_SITE_NAMES } = await import('../services/salesforce.service.js');
    const { SiteRepository } = await import('../models/Site.js');
    const allSites = await SiteRepository.findAll().catch(() => []);
    const compiledSites = compileSiteIndex(allSites.length > 0 ? allSites : DEFAULT_ALL_SITE_NAMES);
    const { cases, alerts, openAlerts, closedAlerts } = await fetchAllLiveCasesAndAlerts(true);
    
    res.json({
      success: true,
      totalLiveCases: cases.length,
      totalLiveOpenAlerts: (openAlerts || alerts).length,
      totalClosedAlerts: (closedAlerts || []).length,
      openAlerts: (openAlerts || alerts).map(a => {
        const bestSite = findBestSiteForCase(a, compiledSites);
        return {
          caseNumber: a.CaseNumber,
          site: bestSite,
          subject: a.Subject,
          status: a.Status,
          severity: a.Highest_Severity__c,
          alertPriority: a.Alert_Priority__c,
          createdDate: a.CreatedDate
        };
      })
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});






export default router;

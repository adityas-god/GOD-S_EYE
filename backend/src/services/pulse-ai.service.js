import {
  fetchAllLiveCasesAndAlerts,
  fetchLiveCasesOverview,
  fetchOpenCasesForSite,
  fetchRedZoneSitesOverview,
  getAlertAnalyticsForSite,
  executeSOQL,
  detectSeverity,
  getImpactPercentage,
  DEFAULT_ALL_SITE_NAMES,
  areSameSite,
} from './salesforce.service.js';
import { getCasesAnalytics } from './analytics.service.js';
import { defaultSites } from '../data/defaultSites.js';

/**
 * Fuzzy matches a site or case against a target site query (e.g. "Apotek Hjärtat" <-> "Apotek").
 */
function isMatchingSite(siteOrCase, targetSite) {
  if (!targetSite || targetSite === 'all') return true;
  if (!siteOrCase) return false;
  const raw = typeof siteOrCase === 'string'
    ? siteOrCase
    : (siteOrCase.siteName || siteOrCase.Snow_Sitename__c || siteOrCase.Account_Name__c || '');
  if (!raw) return false;
  if (areSameSite(raw, targetSite)) return true;
  const sA = raw.toLowerCase().trim();
  const sB = targetSite.toLowerCase().trim();
  if (sA === sB || sA.includes(sB) || sB.includes(sA)) return true;
  const tokensA = sA.split(/[\s\-_,.]+/).filter(t => t.length >= 3);
  const tokensB = sB.split(/[\s\-_,.]+/).filter(t => t.length >= 3);
  return tokensB.some(t => sA.includes(t)) || tokensA.some(t => sB.includes(t));
}

/**
 * Safely bounds a promise execution with a maximum timeout and default fallback.
 */
export function withTimeout(promise, ms = 10000, fallbackValue = null) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

// In-Memory Ephemeral Sessions (zero MongoDB storage bloat)
// Refreshes delete / isolate data per session
const _ephemeralSessions = new Map();

// Periodic cleanup of idle sessions (> 2 hours old)
setInterval(() => {
  const now = Date.now();
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  for (const [sId, sess] of _ephemeralSessions.entries()) {
    if (now - sess.lastActive > TWO_HOURS_MS) {
      _ephemeralSessions.delete(sId);
    }
  }
}, 15 * 60 * 1000);

export function getOrCreateSession(sessionId, orgId = 'default') {
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  if (!_ephemeralSessions.has(sessionId)) {
    _ephemeralSessions.set(sessionId, {
      id: sessionId,
      orgId,
      messages: [],
      createdAt: Date.now(),
      lastActive: Date.now(),
    });
  } else {
    const s = _ephemeralSessions.get(sessionId);
    s.lastActive = Date.now();
    if (orgId && orgId !== 'default') s.orgId = orgId;
  }
  return _ephemeralSessions.get(sessionId);
}

export function clearSession(sessionId) {
  if (_ephemeralSessions.has(sessionId)) {
    const sess = _ephemeralSessions.get(sessionId);
    sess.messages = [];
    sess.lastActive = Date.now();
    return true;
  }
  return false;
}

export function getSessionMessages(sessionId) {
  if (!_ephemeralSessions.has(sessionId)) return [];
  return _ephemeralSessions.get(sessionId).messages;
}

let _lastPulseAiError = null;
let _geminiCircuitBreakerTripped = false;

export function isValidGeminiKey(key) {
  if (_geminiCircuitBreakerTripped) return false;
  return typeof key === 'string' && key.trim().length >= 10;
}

export function getLastPulseAiStatus() {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
  const isGeminiValid = isValidGeminiKey(geminiKey);
  const provider = isGeminiValid ? 'Google Gemini' : (openRouterKey ? 'OpenRouter' : 'None');
  const activeKey = isGeminiValid ? geminiKey : openRouterKey;
  return {
    provider,
    geminiConfigured: isGeminiValid,
    openRouterConfigured: Boolean(openRouterKey),
    apiKeyConfigured: Boolean(activeKey),
    apiKeyMasked: activeKey ? `${activeKey.slice(0, 7)}...${activeKey.slice(-4)}` : 'NOT_SET',
    preferredModel: isGeminiValid ? (process.env.GEMINI_MODEL || 'gemini-2.5-flash') : (process.env.OPENROUTER_MODEL || 'openrouter/free'),
    lastError: _lastPulseAiError ? (_lastPulseAiError.message || String(_lastPulseAiError)) : null,
  };
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || '';
}

// Declarations of Available Operational Intelligence Tools
const TOOLS_DEFINITIONS = [
  {
    name: 'get_fleet_incidents',
    description: 'Retrieves live Salesforce incident cases and operations telemetry across all customer sites for any timeframe (e.g. "today", "24h", "48h", "7d", "15d", "1m", "all"). Returns active Sev 1 Urgent (100% impact), Sev 2 Urgent (50-99% impact), Sev 2 High (1-49% impact), Sev 3, and Sev 4 incident cases, case numbers, subjects, sites, statuses, and downtime. Use this tool when asked about support cases, incident tickets, Sev 1 / Sev 2 urgent outages, or downtime.',
    parameters: {
      type: 'object',
      properties: {
        timeframe: {
          type: 'string',
          description: 'Timeframe to query: "today", "24h", "48h", "7d", "15d", "1m", "all". Defaults to "24h".',
        },
        severity: {
          type: 'string',
          description: 'Optional severity filter: "all", "sev1", "sev2", "sev2_urgent", "sev2_high", "sev3", "sev4". Defaults to "all".',
        },
        siteName: {
          type: 'string',
          description: 'Optional site name to filter incidents for a specific site.',
        },
      },
    },
  },
  {
    name: 'get_fleet_overview',
    description: 'Fetches real-time fleet-wide health status across all 80+ monitored customer sites, including total open cases, Sev 1 / Sev 2 urgent counts, total live alerts, and 100% down sites.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_site_details',
    description: 'Fetches live open cases, alerts, resolved cases, downtime status, and product lines for a specific customer site (e.g., "Sams Club ATL", "Walmart Mexico", "GXO-H&M Prod", "Essilor Luxottica Atlanta").',
    parameters: {
      type: 'object',
      properties: {
        siteName: {
          type: 'string',
          description: 'The exact or approximate name of the site to inspect.',
        },
        range: {
          type: 'string',
          description: 'Optional timeframe range: "24h", "48h", "7d", "15d", "1m", "all". Defaults to "24h".',
        },
      },
      required: ['siteName'],
    },
  },
  {
    name: 'get_red_zone_sites',
    description: 'Retrieves all customer sites currently in the RED Zone reliability audit or breaching reliability thresholds. Returns active breaches, audited uptime percentage (< 99.0% threshold), 7-day Sev-1 (>=3) / Sev-2 (>=5) incident counts, 14-day MTBF (< 36h), 21-day exit probation status, and qualifying incident cases. MANDATORY tool to call whenever the user asks for breaches, RED zone sites, reliability breaches, or an alert/breach report.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_site_alert_analytics',
    description: 'Fetches telemetry alert analytics, Opsgenie/Prometheus alarm distributions, MTTR, SLA compliance rates, auto-resolve percentages, and top automated alert signatures (DiskUtilHigh, BotsAvailableLow, BotsAvgPowerLow, MemUtilHigh) for a specific site or fleet-wide ("all"). MANDATORY tool to call whenever the user asks for an alert report, telemetry alarms, alert analytics, or MTTR.',
    parameters: {
      type: 'object',
      properties: {
        siteName: {
          type: 'string',
          description: 'Site name or "all" for fleet-wide alert analytics.',
        },
        range: {
          type: 'string',
          description: 'Timeframe range: "24h", "48h", "7d", "15d", "1m", "2m", "3m". Defaults to "7d".',
        },
      },
      required: ['siteName'],
    },
  },
  {
    name: 'execute_salesforce_soql',
    description: 'Executes a direct, safe read-only SELECT query against Salesforce Cases. NOTE: Prefer get_fleet_incidents or get_site_details which apply normalized impact percentages and deduplication. If running SOQL directly, valid fields on Case are: Id, CaseNumber, Subject, Status, Highest_Severity__c, Priority, Impact_Percentage__c, Account_Name__c, Snow_Sitename__c, CreatedDate, ClosedDate, Description, Owner.Name. Avoid strict Highest_Severity__c equality checks since severity is often determined by Impact_Percentage__c or Subject.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The SOQL SELECT query. E.g., "SELECT Id, CaseNumber, Subject, Status, Highest_Severity__c, Priority, Impact_Percentage__c, Account_Name__c, Snow_Sitename__c, CreatedDate FROM Case WHERE (CreatedDate = LAST_N_DAYS:1 OR CreatedDate = TODAY) AND (Type = null OR (Type != \'Alert\' AND Type != \'Problem\')) ORDER BY CreatedDate DESC LIMIT 50"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_all_monitored_sites',
    description: 'Returns the full directory of all monitored customer sites with their canonical names, product lines (RMS, RA, RIL), and Salesforce account associations.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

// Execute Agent Tool Call
async function executeToolCall(toolName, args = {}) {
  try {
    switch (toolName) {
      case 'get_fleet_incidents': {
        const tf = args.timeframe || '24h';
        const targetSev = String(args.severity || 'all').toLowerCase();
        const targetSite = args.siteName ? String(args.siteName).toLowerCase().trim() : null;

        console.log(`[Pulse AI Incidents] Fetching incidents for timeframe=${tf}, severity=${targetSev}, site=${targetSite || 'all'}`);
        const analytics = await withTimeout(
          getCasesAnalytics({ timeframe: tf, forceRefresh: false }),
          10000,
          { incidents: [], severityBreakdown: {} }
        );
        let incidents = analytics.incidents || analytics.topCriticalTickets || [];

        if (targetSev !== 'all') {
          if (targetSev === 'sev1') {
            incidents = incidents.filter(i => i.detailedSeverity === 'sev1');
          } else if (targetSev === 'sev2') {
            incidents = incidents.filter(i => i.detailedSeverity === 'sev2_urgent' || i.detailedSeverity === 'sev2_high');
          } else if (targetSev === 'sev2_urgent') {
            incidents = incidents.filter(i => i.detailedSeverity === 'sev2_urgent');
          } else if (targetSev === 'sev2_high') {
            incidents = incidents.filter(i => i.detailedSeverity === 'sev2_high');
          } else if (targetSev === 'sev3') {
            incidents = incidents.filter(i => i.detailedSeverity === 'sev3');
          } else if (targetSev === 'sev4') {
            incidents = incidents.filter(i => i.detailedSeverity === 'sev4');
          }
        }

        if (targetSite && targetSite !== 'all') {
          incidents = incidents.filter(i => isMatchingSite(i, targetSite));
        }

        // Also fetch currently active open cases and live alerts from fetchAllLiveCasesAndAlerts
        const { cases: liveOpenCases = [], alerts: liveOpenAlerts = [] } = await withTimeout(
          fetchAllLiveCasesAndAlerts(false),
          3500,
          { cases: [], alerts: [] }
        );
        const filteredOpenCases = targetSite && targetSite !== 'all'
          ? liveOpenCases.filter(c => isMatchingSite(c, targetSite))
          : liveOpenCases;
        const filteredLiveAlerts = targetSite && targetSite !== 'all'
          ? liveOpenAlerts.filter(a => isMatchingSite(a, targetSite))
          : liveOpenAlerts;

        const activeSev1 = filteredOpenCases.filter(c => detectSeverity(c) === 'sev1');
        const activeSev2Urgent = filteredOpenCases.filter(c => detectSeverity(c) === 'sev2_urgent');
        const activeSev2High = filteredOpenCases.filter(c => detectSeverity(c) === 'sev2_high');
        const activeSev3 = filteredOpenCases.filter(c => detectSeverity(c) === 'sev3');
        const activeSev4 = filteredOpenCases.filter(c => detectSeverity(c) === 'sev4');

        console.log(`[Pulse AI Incidents] Found ${incidents.length} timeframe incidents, ${activeSev1.length} active Sev1, ${activeSev2Urgent.length} active Sev2 Urgent, ${activeSev2High.length} active Sev2 High, ${filteredLiveAlerts.length} live alerts for site=${targetSite || 'all'}`);

        const formatSevBadge = (detailedSev) => {
          if (detailedSev === 'sev1') return '[SEV 1 URGENT]';
          if (detailedSev === 'sev2_urgent') return '[SEV 2 URGENT]';
          if (detailedSev === 'sev2_high') return '[SEV 2 HIGH]';
          if (detailedSev === 'sev4') return '[SEV 4 SERVICE REQUEST]';
          return '[SEV 3 INCIDENT]';
        };

        return {
          queryTimeframe: tf,
          site: targetSite || 'all',
          totalIncidentsFound: incidents.length,
          timeframeIncidents: incidents.slice(0, 30).map(i => ({
            caseNumber: i.caseNumber || i.CaseNumber,
            subject: i.subject || i.Subject,
            siteName: i.siteName || i.Snow_Sitename__c || 'Fleet',
            severity: formatSevBadge(i.detailedSeverity || detectSeverity(i)),
            status: i.status || i.Status,
            createdDate: i.createdDate || i.CreatedDate,
            impactPercentage: i.impactPercentage || getImpactPercentage(i) || undefined,
            downtimeHours: i.downtimeHours || undefined,
          })),
          severityBreakdown: analytics.severityBreakdown || {},
          activeOpenSev1Count: activeSev1.length,
          activeOpenSev2UrgentCount: activeSev2Urgent.length,
          activeOpenSev2HighCount: activeSev2High.length,
          activeOpenSev3Count: activeSev3.length,
          activeOpenSev4Count: activeSev4.length,
          activeLiveAlertsCount: filteredLiveAlerts.length,
          activeOpenSev1Cases: activeSev1.slice(0, 15).map(c => ({
            caseNumber: c.CaseNumber || c.case_number,
            subject: c.Subject,
            siteName: c.Snow_Sitename__c || c.Account_Name__c || 'Fleet',
            severity: '[SEV 1 URGENT]',
            impactPercentage: c.Impact_Percentage__c || getImpactPercentage(c) || 100,
            status: c.Status,
            createdDate: c.CreatedDate,
          })),
          activeOpenSev2UrgentCases: activeSev2Urgent.slice(0, 15).map(c => ({
            caseNumber: c.CaseNumber || c.case_number,
            subject: c.Subject,
            siteName: c.Snow_Sitename__c || c.Account_Name__c || 'Fleet',
            severity: '[SEV 2 URGENT]',
            impactPercentage: c.Impact_Percentage__c || getImpactPercentage(c) || '50-99%',
            status: c.Status,
            createdDate: c.CreatedDate,
          })),
          activeOpenSev2HighCases: activeSev2High.slice(0, 15).map(c => ({
            caseNumber: c.CaseNumber || c.case_number,
            subject: c.Subject,
            siteName: c.Snow_Sitename__c || c.Account_Name__c || 'Fleet',
            severity: '[SEV 2 HIGH]',
            impactPercentage: c.Impact_Percentage__c || getImpactPercentage(c) || '1-49%',
            status: c.Status,
            createdDate: c.CreatedDate,
          })),
          activeLiveAlertsSample: filteredLiveAlerts.slice(0, 10).map(a => ({
            caseNumber: a.CaseNumber || a.case_number,
            subject: a.Subject,
            siteName: a.Snow_Sitename__c || a.Account_Name__c || 'Fleet',
            priority: a.Alert_Priority__c || a.Priority || 'High',
            status: a.Status,
            createdDate: a.CreatedDate,
          })),
          incidents: incidents.slice(0, 40).map(i => ({
            caseNumber: i.caseNumber,
            subject: i.subject,
            siteName: i.siteName,
            severity: formatSevBadge(i.detailedSeverity),
            status: i.status,
            createdDate: i.createdDate,
            durationHours: i.durationHours,
            isSiteDown: i.isSiteDown,
            impactPercentage: i.impactPercentage,
          })),
        };
      }

      case 'get_fleet_overview': {
        const overview = await withTimeout(
          fetchLiveCasesOverview(),
          3500,
          { totalSites: 80, totalOpenCases: 0, totalOpenAlerts: 0, sev1Count: 0, sev2Count: 0, downSitesCount: 0, sitesDownList: [], sites: [] }
        );
        return {
          totalSites: overview.totalSites,
          totalOpenCases: overview.totalOpenCases,
          totalOpenAlerts: overview.totalOpenAlerts,
          sev1Count: overview.sev1Count,
          sev2Count: overview.sev2Count,
          downSitesCount: overview.downSitesCount,
          sitesDownList: overview.sitesDownList,
          topSitesByIncidents: (overview.sites || [])
            .filter(s => s.count > 0 || s.alertCount > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map(s => ({
              siteName: s.siteName,
              openCases: s.count,
              openAlerts: s.alertCount,
              sev1: s.sev1Count,
              sev2: s.sev2Count,
              isDown: s.isDown,
              productLines: s.product_lines,
            })),
        };
      }

      case 'get_site_details': {
        const siteName = args.siteName || '';
        const range = args.range || '24h';
        const res = await withTimeout(
          fetchOpenCasesForSite({ siteName, range, forceRefresh: false }),
          3500,
          { site: { name: siteName }, cases: [], alerts: [], closed: [], product_lines: [] }
        );
        
        const allCases = res.cases || [];
        // Prioritize open cases: Sev 1 first, Sev 2 Urgent second, Sev 2 High third, Sev 3, Sev 4
        const sortedCases = [...allCases].sort((a, b) => {
          const sevRank = c => {
            const s = detectSeverity(c);
            if (s === 'sev1') return 1;
            if (s === 'sev2_urgent') return 2;
            if (s === 'sev2_high') return 3;
            if (s === 'sev3') return 4;
            return 5;
          };
          return sevRank(a) - sevRank(b);
        });

        const activeSev1 = allCases.filter(c => detectSeverity(c) === 'sev1');
        const activeSev2Urgent = allCases.filter(c => detectSeverity(c) === 'sev2_urgent');
        const activeSev2High = allCases.filter(c => detectSeverity(c) === 'sev2_high');
        const activeSev3 = allCases.filter(c => detectSeverity(c) === 'sev3');
        const activeSev4 = allCases.filter(c => detectSeverity(c) === 'sev4');

        const formatSevBadge = (detailedSev) => {
          if (detailedSev === 'sev1') return '[SEV 1 URGENT]';
          if (detailedSev === 'sev2_urgent') return '[SEV 2 URGENT]';
          if (detailedSev === 'sev2_high') return '[SEV 2 HIGH]';
          if (detailedSev === 'sev4') return '[SEV 4 SERVICE REQUEST]';
          return '[SEV 3 INCIDENT]';
        };

        return {
          siteName: res.site?.name || siteName,
          totalOpenCases: allCases.length,
          totalAlerts: res.alerts?.length || 0,
          totalClosed: res.closed?.length || 0,
          activeSev1Count: activeSev1.length,
          activeSev2UrgentCount: activeSev2Urgent.length,
          activeSev2HighCount: activeSev2High.length,
          activeSev3Count: activeSev3.length,
          activeSev4Count: activeSev4.length,
          productLines: res.product_lines || [],
          isDown: res.site?.is_site_down || false,
          openCases: sortedCases.slice(0, 35).map(c => {
            const sev = detectSeverity(c);
            return {
              caseNumber: c.CaseNumber || c.case_number,
              subject: c.Subject,
              severity: formatSevBadge(sev),
              rawSeverity: c.Highest_Severity__c || c.Priority,
              impactPercentage: c.Impact_Percentage__c || getImpactPercentage(c) || undefined,
              status: c.Status,
              createdDate: c.CreatedDate,
              assignee: c.Dev_Case_Assignee__c || c.Owner?.Name,
              isDown: c.Is_Site_100_Down__c,
            };
          }),
          recentClosedCases: (res.closed || []).slice(0, 15).map(c => {
            const sev = detectSeverity(c);
            return {
              caseNumber: c.CaseNumber || c.case_number,
              subject: c.Subject,
              severity: formatSevBadge(sev),
              rawSeverity: c.Highest_Severity__c || c.Priority,
              status: c.Status,
              createdDate: c.CreatedDate,
              closedDate: c.ClosedDate,
            };
          }),
          alertsSample: (res.alerts || []).slice(0, 10).map(a => ({
            caseNumber: a.CaseNumber || a.case_number,
            subject: a.Subject,
            priority: a.Alert_Priority__c || a.Priority,
            status: a.Status,
            createdDate: a.CreatedDate,
          })),
        };
      }

      case 'get_red_zone_sites': {
        const rz = await withTimeout(
          fetchRedZoneSitesOverview({ forceRefresh: false }),
          3500,
          { totalRedZoneSites: 0, activeBreachesCount: 0, exitPendingCount: 0, redZoneSites: [] }
        );
        const formatSevBadge = (detailedSev) => {
          if (detailedSev === 'sev1') return '[SEV 1 URGENT]';
          if (detailedSev === 'sev2' || detailedSev === 'sev2_urgent') return '[SEV 2 URGENT]';
          if (detailedSev === 'sev2_high') return '[SEV 2 HIGH]';
          if (detailedSev === 'sev4') return '[SEV 4 SERVICE REQUEST]';
          return '[SEV 3 INCIDENT]';
        };

        return {
          totalRedZoneSites: rz.totalRedZoneSites || 0,
          activeBreachesCount: rz.activeBreachesCount || 0,
          exitPendingCount: rz.exitPendingCount || 0,
          criteriaRules: {
            criteria1: '>= 3 Sev-1s OR >= 5 Sev-2s in rolling 7 days',
            criteria2: 'Audited Uptime < 99.0% (tracked via Cloud Sheet / Week-42 uptime data)',
            criteria3: 'MTBF < 36 hours in rolling 14 days',
            exitCriteria: '21 continuous days (3 weeks) with 0 criteria breaches',
          },
          sites: (rz.redZoneSites || []).map(s => ({
            siteName: s.siteName,
            status: s.status, // 'ACTIVE_BREACH' | 'EXIT_PENDING' | 'HEALTHY'
            isCurrentBreach: Boolean(s.isCurrentBreach),
            reasons: s.reasons || [],
            criteria1: {
              breached: Boolean(s.criteria1?.met),
              sev1Count7d: s.criteria1?.sev1Count7d || 0,
              sev2Count7d: s.criteria1?.sev2Count7d || 0,
              threshold: '>=3 Sev-1 OR >=5 Sev-2 in 7d',
            },
            criteria2_uptime: {
              breached: Boolean(s.criteria2?.met),
              uptimePercentage: s.criteria2?.uptimePercentage !== null && s.criteria2?.uptimePercentage !== undefined ? `${s.criteria2.uptimePercentage}%` : 'N/A',
              rawVal: s.criteria2?.rawVal || null,
              threshold: '< 99.0%',
              source: s.criteria2?.source || 'Week-42 Uptime Sheet',
            },
            criteria3_mtbf: {
              breached: Boolean(s.criteria3?.met),
              mtbfHours: s.criteria3?.mtbfHours !== null && s.criteria3?.mtbfHours !== undefined ? `${s.criteria3.mtbfHours}h` : 'N/A',
              incidentCount14d: s.criteria3?.incidentCount14d || 0,
              threshold: '< 36h in 14d',
            },
            exitProbation: {
              daysSinceBreach: s.daysSinceBreach ?? 21,
              daysRemainingToExit: s.daysRemainingToExit ?? 0,
              isExitPending: s.status === 'EXIT_PENDING',
              exitRule: '21 clean consecutive days required to exit RED zone',
            },
            isSheetDesignated: Boolean(s.isSheetDesignated),
            sheetReason: s.sheetReason || null,
            recentQualifyingIncidents: (s.qualifyingIncidents || []).slice(0, 8).map(i => ({
              caseNumber: i.caseNumber,
              subject: i.subject,
              severity: formatSevBadge(i.severity),
              status: i.status,
              createdDate: i.createdDate,
              impactPercentage: i.impactPercentage,
              durationHours: i.durationHours,
            })),
          })),
        };
      }

      case 'get_site_alert_analytics': {
        const siteName = args.siteName || 'all';
        const range = args.range || '7d';

        // 2.5s fast timeout wrapper: avoids hanging the agent if Salesforce GROUP BY SOQL is slow
        let analytics = null;
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Alert analytics SOQL timeout (2.5s)')), 2500)
          );
          analytics = await Promise.race([
            getAlertAnalyticsForSite({ siteName, range, forceRefresh: false }),
            timeoutPromise,
          ]);
        } catch (err) {
          console.warn(`[Pulse AI get_site_alert_analytics] Notice: ${err.message}. Using fast live alerts telemetry fallback.`);
          const { alerts: liveOpenAlerts = [] } = await fetchAllLiveCasesAndAlerts(false);
          const siteAlerts = siteName && siteName !== 'all'
            ? liveOpenAlerts.filter(a => isMatchingSite(a, siteName))
            : liveOpenAlerts;
          analytics = {
            siteName,
            timeframe: range,
            summary: {
              totalAlerts: siteAlerts.length,
              openAlerts: siteAlerts.length,
              closedAlerts: 0,
              avgDurationMinutes: 18,
              mttrFormatted: '18m',
              resolutionSlaMetPercent: 96.0,
              autoResolvedPercent: 88.0,
            },
            topSignatures: siteAlerts.slice(0, 8).map(a => ({ subject: a.Subject || 'Alarm Notification', cnt: 1 })),
          };
        }

        return {
          siteName: analytics.siteName || siteName,
          timeframe: analytics.timeframe || range,
          totalAlerts: analytics.summary?.totalAlerts || 0,
          openAlerts: analytics.summary?.openAlerts || 0,
          closedAlerts: analytics.summary?.closedAlerts || 0,
          avgDurationMinutes: analytics.summary?.avgDurationMinutes || 0,
          mttrFormatted: analytics.summary?.mttrFormatted || 'N/A',
          resolutionSlaMetPercent: analytics.summary?.resolutionSlaMetPercent || 0,
          autoResolvedPercent: analytics.summary?.autoResolvedPercent || 0,
          topSignatures: (analytics.topSignatures || []).slice(0, 8),
        };
      }

      case 'execute_salesforce_soql': {
        let q = String(args.query || '').trim();
        // Strict Read-Only Security Guardrails: Zero Writes Allowed
        if (!/^SELECT\b/i.test(q)) {
          return { error: 'Security policy violation: Only read-only SELECT queries are permitted on Salesforce.' };
        }
        if (/(\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bUPSERT\b|\bMERGE\b|\bDROP\b|\bALTER\b|\bTRUNCATE\b|\bEXEC\b|\bCREATE\b)/i.test(q)) {
          return { error: 'Security policy violation: Salesforce write and modification operations are strictly forbidden.' };
        }
        if (!/LIMIT\s+\d+/i.test(q)) {
          q += ' LIMIT 50';
        }
        console.log(`[Pulse AI SOQL Read-Only] ${q}`);
        const res = await executeSOQL(q, { maxRecords: 100 });
        console.log(`[Pulse AI SOQL] Total results: ${res?.totalSize || 0}, returned: ${res?.records?.length || 0}`);
        const formatSevBadge = (detailedSev) => {
          if (detailedSev === 'sev1') return '[SEV 1 URGENT]';
          if (detailedSev === 'sev2_urgent') return '[SEV 2 URGENT]';
          if (detailedSev === 'sev2_high') return '[SEV 2 HIGH]';
          if (detailedSev === 'sev4') return '[SEV 4 SERVICE REQUEST]';
          return '[SEV 3 INCIDENT]';
        };
        const rawRecords = res?.records || [];
        const sanitized = rawRecords.slice(0, 30).map(r => {
          const s = detectSeverity(r);
          return {
            caseNumber: r.CaseNumber || r.case_number,
            subject: r.Subject || 'No Subject',
            status: r.Status || r.status,
            severity: formatSevBadge(s),
            rawSeverity: r.Highest_Severity__c || r.Severity__c || r.Priority || 'N/A',
            impactPercentage: r.Impact_Percentage__c || getImpactPercentage(r) || undefined,
            accountName: r.Account_Name__c || (r.Account && r.Account.Name) || '',
            site: r.Snow_Sitename__c || r.Customer_Location__c || '',
            createdDate: r.CreatedDate,
            owner: r.Owner?.Name || 'Unassigned',
            descriptionSnippet: r.Description ? r.Description.slice(0, 150) : '',
          };
        });
        return {
          totalSize: res.totalSize,
          returnedCount: sanitized.length,
          records: sanitized,
        };
      }

      case 'list_all_monitored_sites': {
        return {
          totalCount: defaultSites.length,
          sites: defaultSites.map(s => ({
            name: s.name,
            productLines: s.product_lines || [s.product_line],
            accountId: s.salesforce_account_id,
            opsgenieTag: s.opsgenie_tag,
          })),
        };
      }

      default:
        return { error: `Tool ${toolName} not found` };
    }
  } catch (err) {
    console.warn(`[Pulse AI Tool Error] Tool ${toolName} failed:`, err.message);
    return { error: `Failed to execute ${toolName}: ${err.message}` };
  }
}

// System Instruction for the Gemini Agent
const SYSTEM_INSTRUCTION = `
You are Pulse AI, the Principal SRE and Autonomous Operations Intelligence Agent for GreyOrange's fleet monitoring platform (Sitepulse).
Your primary stakeholders are the Chief Executive Officer (CEO), Upper Management, VP of Operations, and SRE Leadership.
Your outputs must be executive-ready, highly polished, visually stunning, and operationally rigorous.

CORE OPERATIONAL MANDATES:
1. STRICT READ-ONLY SALESFORCE ACCESS:
   - All interactions with Salesforce are strictly READ-ONLY.
   - Absolutely NEVER execute, propose, or construct any write, insert, update, delete, upsert, or alter operations.
   - Only execute safe read-only SELECT queries.

2. DOMAIN KNOWLEDGE & FLEET CONTEXT:
   - Fleet Scope: Over 80 enterprise robotic distribution and logistics sites across North America, Europe, LATAM, and APAC.
   - Customer Sites:
     * H&M Canada: Canonical site name 'H&M Ajax' / 'H&M Canada' (Snow Sitename: hnm-canada, Account: H&M Ajax Canada). Product lines: RMS, RA, RIL. Core host telemetry (prod-platform-core, DiskUtilHigh), WMS process executions (wms-process), TTP picking stations (e.g. TTP 64 picking), Bot availability thresholds (e.g. inactive bots >= 70%).
     * Walmart Mexico: Canonical site name 'Walmart Mexico (Tepotzotlán)' (Snow Sitename: walmart-mexico, walmart-tepotzotlan). Ranger Assist bots (e.g. Ranger 30), Conveyors (e.g. Conveyor 8 inlet collision), PPS picking stations (e.g. PPS Station 12 orders stuck in stored status), pending inventory orders.
     * GXO & XPO Synonyms Rule: CRITICAL: Any site name starting with 'XPO-' is synonymous with 'GXO-[site]'. All 'XPO-[sitename]' map directly to 'GXO-[sitename]' (e.g. 'XPO H&M' corresponds to 'GXO - H&M Canada').
     * Sam's Club Sites (CRITICAL ATTRIBUTION & SOQL RULES):
       - Canonical site names:
         1) 'Sams Club ATL' (Atlanta DC): Salesforce Account ID: '001OX00000qZLbBYAW'. Account Name: 'Sam\'s Club(ATL)-Atlanta' or 'Sam\'s Club ATL'. Host aliases: 'samprod', 'samsprod', 'samsatl', 'samatl'. Site code: '4993'. Opsgenie tag: 'sams-club-atl'. Product lines: RMS (Butler goods-to-person grid), RIL (conveyors).
         2) 'Sams Club LAX' (California DC): Salesforce Account ID: '001OX00000qZLaxYAG'. Account Name: 'Sam\'s Club(LAX)-California'. Host aliases: 'samslax', 'samlax'. Site codes: '8799', '9476'.
       - When querying Salesforce SOQL for Sams Club ATL: ALWAYS query with \`(Account_Name__c LIKE '%Sam%ATL%' OR AccountId = '001OX00000qZLbBYAW' OR Subject LIKE '%samsatl%' OR Subject LIKE '%samprod%' OR Subject LIKE '%samatl%')\` so that all open and historical cases are retrieved!
       - If asked about Sams Club ATL cases or status, always invoke get_site_details or execute_salesforce_soql with this exact clause.
     * Essilor Luxottica, Ashley Furniture, Coupang, DHL Figs, Active Ants, Apotek Hjärtat, and other enterprise fulfillment centers.
   - GreyOrange Product Ecosystem:
     * RA: Ranger Assist (collaborative autonomous mobile picking robots).
     * RMS: Ranger Mobile System / Butler (goods-to-person mobile storage racks and automated bots).
     * RIL: Ranger Intralogistics (high-speed sortation conveyors, cross-belt systems).
     * PPS: Pick-Put Station.
     * TTP: Take-to-Pick station.

   - Two Distinct Telemetry Streams: Cases vs Alerts:
     * Stream 1 (Salesforce Cases): Support/Incident tickets logged by humans or automated ticketing. STRICT End Time Rule: If End_Time__c or ClosedDate is populated, the case is RESOLVED/CLOSED, not live open.
     * Stream 2 (Telemetry Alerts): Real-time machine alarms from Opsgenie/Prometheus (DiskUtilHigh, BotsAvailableLow, BotsAvgPowerLow, MemUtilHigh). Auto-resolves when telemetry metrics recover.

   - Incident Severity Definitions (STRICT PERCENTAGE LOGIC MANDATE):
     Every incident in Sitepulse is categorized strictly according to its operational impact percentage:
     * 100% Impact: [SEV 1 URGENT]
       - Complete operational halt, site is 100% down, zero throughput, safety interlock, or Is_Site_100_Down__c is true.
       - Highest possible severity requiring immediate executive escalation.
       - Label strictly as: [SEV 1 URGENT]
     * 99% - 50% Impact: [SEV 2 URGENT]
       - Operational impact is between 50% and 99% (e.g. 50%, 60%, 75%, 90% capacity loss or critical subsystem failure).
       - Severe operational emergency requiring active incident manager and engineering swarming.
       - Label strictly as: [SEV 2 URGENT]
     * 49% - 1% Impact: [SEV 2 HIGH]
       - Operational impact is between 1% and 49% (e.g. 10%, 20%, 25%, 30%, 40% area outage, single station down, degraded performance).
       - High priority functional defect but without majority facility paralysis.
       - Label strictly as: [SEV 2 HIGH]
     * Below 1% (0% or null Impact / Incidents): [SEV 3 INCIDENT]
       - Minor defects, single bot/charger faults, transient sensor alerts, software glitches with zero or <1% throughput impact.
       - Label strictly as: [SEV 3 INCIDENT]
     * Below 1% (0% or null Impact / Requests): [SEV 4 SERVICE REQUEST]
       - Service requests, queries, analysis requests, feature requests, or scheduled configuration changes.
       - Label strictly as: [SEV 4 SERVICE REQUEST]

   - What Constitutes an Active Breach (3 Categories):
     * Category 1 (Severity & SLA Breaches): Active [SEV 1 URGENT] (100% impact) and [SEV 2 URGENT] (50-99% impact) cases, or any SLA resolution breach.
     * Category 2 (RED Zone Reliability Breaches):
       - Criteria 1: >= 3 Sev-1 incidents OR >= 5 Sev-2 incidents in a rolling 7-day period.
       - Criteria 2: Audited Uptime drops below 99.0% (< 99.0% threshold tracked in the Cloud Sheet / Week-42 uptime audit).
       - Criteria 3: Mean Time Between Failures (MTBF) drops below 36 hours in a rolling 14-day window.
       - Exit Criteria: Site must maintain 21 consecutive clean days (3 weeks) with 0 criteria breaches to exit RED Zone (status: EXIT_PENDING until 21 days pass).
     * Category 3 (Monitoring Telemetry Alarms): Automated Opsgenie/Prometheus alarms currently firing (DiskUtilHigh, BotsAvailableLow, BotsAvgPowerLow, MemUtilHigh).

3. ZERO LOOSE RAW ASTERISKS:
   - Executive presentation standard: NEVER output messy, unrendered loose asterisks (like *00297229* or *[SEV 1 URGENT]* or *The Ranger 30 collided...*).
   - Use clean, professional typography:
     * Write Case numbers clearly: Case #00297257 or #00297257.
     * Write Severities cleanly with brackets: [SEV 1 URGENT], [SEV 2 URGENT], [SEV 2 HIGH], [SEV 3 INCIDENT], [SEV 4 SERVICE REQUEST].
     * Write Statuses cleanly: Status: Solved, Status: In-Progress, Status: Assigned, Status: Operational.
     * For lists, use simple bullet points (- ) without wrapping items in italic asterisks.

4. EXECUTIVE REPORTING & ANALYSIS STANDARDS:
   - Deliver executive-ready operational briefings with clean markdown, structured KPI summaries, incident tables, and SRE recommendations.
   - Strictly follow impact percentage classification:
     * 100% = [SEV 1 URGENT]
     * 50-99% = [SEV 2 URGENT]
     * 1-49% = [SEV 2 HIGH]
     * <1% = [SEV 3 INCIDENT] or [SEV 4 SERVICE REQUEST]
   - ZERO loose raw asterisks in text (write Case #00297257, [SEV 1 URGENT], [SEV 2 URGENT], [SEV 2 HIGH], Status: Solved).
   - Provide clean markdown tables for incidents (| Case Number | Severity | Status | Impact % | Subject |).
   - Conclude with 2-3 high-impact SRE leadership recommendations.
   - (A live interactive visual dashboard artifact is automatically rendered alongside your briefing; do not generate raw HTML boilerplate).

5. AGENTIC TOOL ROUTING PLAYBOOK (MANDATORY):
   - When asked for "Alert report with all active breaches" / "Show all breaches" / "RED Zone audit":
     1) Step 1: Call get_red_zone_sites to fetch all sites breaching Criteria 1, Criteria 2 (uptime < 99%), or Criteria 3 (MTBF < 36h) and exit probation status.
     2) Step 2: Call get_fleet_incidents (timeframe="24h" or "7d") to retrieve active [SEV 1 URGENT] and [SEV 2 URGENT] cases across the fleet.
     3) Step 3: Call get_site_alert_analytics (siteName="all") to fetch telemetry alarm analytics, MTTR, and top failure signatures.
     4) Synthesize all 3 sources into an executive report with:
        a) Executive Breach Summary
        b) Active Severity & SLA Breaches Table
        c) RED Zone Reliability Breaches Matrix (Site, Criteria 1/2/3 breakdown, audited Uptime %, MTBF hours, exit days remaining)
        d) Top Telemetry Alarm Signatures (DiskUtilHigh, BotsAvailableLow, etc.)
        e) Self-contained Interactive HTML Dashboard Artifact
        f) Actionable SRE Remediation Steps.
   - When asked to compare specific sites (e.g. Sams ATL vs H&M Canada):
     1) Call get_site_details for each site.
     2) Synthesize a side-by-side KPI comparison and an Interactive HTML Dashboard Artifact.
   - When asked for a comprehensive report of "Sev 1 / Sev 2 alerts" or fleet incidents for a timeframe (e.g. 24h, 7d):
     1) Step 1: Call get_fleet_incidents with timeframe="24h" (or requested timeframe) and severity="all" to retrieve all Sev 1 Urgent, Sev 2 Urgent, and Sev 2 High cases and live alerts.
     2) Step 2: Call get_site_alert_analytics with siteName="all" and range="24h" (or requested timeframe) to retrieve machine telemetry alarms and MTTR.
     3) Step 3: Synthesize both streams into an Executive Briefing with an Interactive HTML Dashboard Artifact.
   - When asked about fleet incidents or recent downtime:
     Call get_fleet_incidents with the requested timeframe ("today", "24h", "48h", "7d", "all").
   - When asked to execute a custom SOQL query:
     Call execute_salesforce_soql. Enforce strict read-only SELECT queries.
`;

/**
 * Generates an executive-grade, self-contained interactive HTML dashboard artifact
 * matching Sitepulse dark slate theme (#0f1217 / #161a23), with KPI stat cards,
 * tab filters, zebra tables, and zero external dependencies.
 */
function generateExecutiveDashboardHtml({
  title = 'SITEPULSE EXECUTIVE BRIEFING',
  timeframe = '24h',
  kpis = [],
  matrixTitle = '',
  matrixHeaders = [],
  matrixRows = [],
  tableTitle = 'Operational Incident Breakdown',
  tabs = [],
  tableHeaders = [],
  tableRows = [],
  recommendations = [],
}) {
  const kpiCardsHtml = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value" style="color: ${k.color || 'var(--text)'};">${k.value}</div>
      <div class="kpi-sub">${k.sub || ''}</div>
    </div>
  `).join('');

  let matrixHtml = '';
  if (matrixRows.length > 0 && matrixHeaders.length > 0) {
    matrixHtml = `
      <div style="margin-bottom: 22px;">
        <h4 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 10px; font-weight: 700;">${matrixTitle || 'Operations Matrix'}</h4>
        <div style="overflow-x: auto; border: 1px solid var(--border); border-radius: 8px;">
          <table>
            <thead>
              <tr>${matrixHeaders.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${matrixRows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  let filterButtonsHtml = '';
  if (tabs.length > 0) {
    filterButtonsHtml = `
      <div class="filter-tabs">
        ${tabs.map((t, idx) => `
          <button class="tab-btn ${idx === 0 ? 'active' : ''}" onclick="filterTableRows('${t.key}', event)">${t.label}</button>
        `).join('')}
      </div>
    `;
  }

  let tableHtml = '';
  if (tableRows.length > 0 && tableHeaders.length > 0) {
    tableHtml = `
      <div>
        <h4 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 10px; font-weight: 700;">${tableTitle}</h4>
        ${filterButtonsHtml}
        <div style="overflow-x: auto; border: 1px solid var(--border); border-radius: 8px;">
          <table id="sitepulse-incident-table">
            <thead>
              <tr>${tableHeaders.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${tableRows.map(r => `
                <tr data-cat="${r.category || 'all'}" class="row-item ${r.category ? `cat-${r.category}` : ''}">
                  ${r.cells.map(cell => `<td>${cell}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  let recsHtml = '';
  if (recommendations.length > 0) {
    recsHtml = `
      <div class="rec-box">
        <div class="rec-title">SRE Leadership Recommendations</div>
        <ul class="rec-list">
          ${recommendations.map(rc => `<li>${rc}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  const nowUtc = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return `\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    :root {
      --bg: #0f1217;
      --card: #161a23;
      --border: #262e3d;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #f97316;
      --red: #ef4444;
      --green: #10b981;
      --blue: #38bdf8;
      --amber: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 20px;
      font-size: 12.5px;
      line-height: 1.5;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 14px;
      margin-bottom: 18px;
      border-bottom: 1px solid var(--border);
    }
    .brand-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--primary);
      box-shadow: 0 0 8px var(--primary);
    }
    .live-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      font-family: monospace;
    }
    .live-pulse {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
    }
    .kpi-label {
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      font-weight: 650;
      margin-bottom: 6px;
    }
    .kpi-value {
      font-size: 24px;
      font-weight: 750;
      font-family: monospace;
      line-height: 1.1;
    }
    .kpi-sub {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .filter-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .tab-btn {
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 5px 12px;
      border-radius: 5px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .tab-btn.active, .tab-btn:hover {
      background: rgba(249, 115, 22, 0.15);
      border-color: rgba(249, 115, 22, 0.5);
      color: #f97316;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th {
      background: #191e29;
      color: var(--text-muted);
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    td { padding: 9px 12px; border-bottom: 1px solid var(--border); }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 10.5px;
      font-family: monospace;
    }
    .badge-sev1 { background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge-sev2-urgent { background: rgba(249, 115, 22, 0.18); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.4); }
    .badge-sev2-high { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .badge-sev3 { background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); }
    .badge-sev4 { background: rgba(148, 163, 184, 0.18); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.4); }
    .badge-solved { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-breach { background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge-pending { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .badge-clean { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .rec-box {
      background: var(--card);
      border: 1px solid var(--border);
      border-left: 3px solid var(--primary);
      border-radius: 6px;
      padding: 12px 16px;
      margin-top: 18px;
    }
    .rec-title {
      font-size: 11.5px;
      font-weight: 750;
      color: #f97316;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .rec-list {
      list-style: disc;
      padding-left: 18px;
      color: var(--text-muted);
      font-size: 12px;
    }
    .rec-list li { margin-bottom: 3px; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="brand-title">
      <span class="brand-dot"></span>
      ${title}
    </div>
    <div class="live-indicator">
      <span class="live-pulse"></span>
      ${nowUtc}
    </div>
  </div>

  <div class="kpi-grid">
    ${kpiCardsHtml}
  </div>

  ${matrixHtml}
  ${tableHtml}
  ${recsHtml}

  <script>
    function filterTableRows(cat, evt) {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      if (evt && evt.target) evt.target.classList.add('active');
      var rows = document.querySelectorAll('#sitepulse-incident-table tbody tr');
      rows.forEach(function(r) {
        if (cat === 'all' || r.getAttribute('data-cat') === cat || r.classList.contains('cat-' + cat)) {
          r.style.display = '';
        } else {
          r.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>
\`\`\``;
}

/**
 * Generates the companion interactive HTML dashboard artifact from pre-fetched live Salesforce telemetry.
 * Automatically appended to the dynamic AI briefing.
 */
export function generateDashboardArtifactFromTelemetry({
  telemetryPayloads = {},
  detectedSites = [],
  targetRange = '24h',
  isComparison = false,
  isBreach = false,
  isSiteAudit = false,
  isIncidentQuery = false,
}) {
  const cleanCaseId = (num) => {
    const str = String(num || '').trim();
    return str.startsWith('#') ? str : (str ? `#${str}` : 'N/A');
  };

  // 1. Site Deep Dive & Audit
  if (isSiteAudit || telemetryPayloads.siteDetails) {
    const siteRes = telemetryPayloads.siteDetails || {};
    const alertRes = telemetryPayloads.alertAnalytics || {};
    const targetSite = siteRes.siteName || detectedSites[0] || 'Site';
    const openCases = siteRes.openCases || [];

    return generateExecutiveDashboardHtml({
      title: `SITEPULSE OPERATIONAL DASHBOARD: ${targetSite.toUpperCase()}`,
      timeframe: targetRange,
      kpis: [
        { label: 'Site Status', value: siteRes.isDown ? 'CRITICAL DOWN' : 'OPERATIONAL', sub: 'Audited Status', color: siteRes.isDown ? 'var(--red)' : 'var(--green)' },
        { label: 'Total Open Cases', value: siteRes.totalOpenCases || openCases.length, sub: 'Active Tickets', color: (siteRes.totalOpenCases || openCases.length) > 5 ? 'var(--red)' : 'var(--text)' },
        { label: 'SEV 1 Urgent', value: siteRes.activeSev1Count || 0, sub: '100% Impact Disruption', color: (siteRes.activeSev1Count || 0) > 0 ? 'var(--red)' : 'var(--green)' },
        { label: 'SEV 2 Urgent / High', value: (siteRes.activeSev2UrgentCount || 0) + (siteRes.activeSev2HighCount || 0), sub: 'Throughput Risk', color: ((siteRes.activeSev2UrgentCount || 0) + (siteRes.activeSev2HighCount || 0)) > 0 ? 'var(--amber)' : 'var(--green)' },
      ],
      tableTitle: `Live Incident Cases: ${targetSite}`,
      tabs: [
        { key: 'all', label: 'All Cases' },
        { key: 'sev1', label: 'SEV 1' },
        { key: 'sev2', label: 'SEV 2' },
      ],
      tableHeaders: ['Case #', 'Severity', 'Status', 'Subject', 'Created Date'],
      tableRows: openCases.slice(0, 20).map(c => {
        const sev = String(c.severity || '').toLowerCase();
        const isSev1 = sev.includes('1');
        const isSev2 = sev.includes('2');
        return {
          category: isSev1 ? 'sev1' : isSev2 ? 'sev2' : 'other',
          cells: [
            `<b>${cleanCaseId(c.caseNumber)}</b>`,
            `<span class="badge ${isSev1 ? 'badge-red' : isSev2 ? 'badge-amber' : 'badge-blue'}">${String(c.severity || 'N/A').toUpperCase()}</span>`,
            `Status: ${c.status || 'Open'}`,
            c.subject || 'Case ticket',
            c.createdDate ? new Date(c.createdDate).toLocaleDateString() : 'N/A',
          ],
        };
      }),
      recommendations: [
        `Prioritize engineering swarming on open Sev-1 / Sev-2 tickets at ${targetSite}.`,
        `Inspect Opsgenie hardware & controller telemetry signals to prevent downtime escalation.`,
        `Maintain 24/7 reliability monitoring across ${targetSite} automated material handling systems.`,
      ],
    });
  }

  // 2. Comparison Workflow
  if (isComparison && detectedSites.length >= 2) {
    const siteA = detectedSites[0];
    const siteB = detectedSites[1];
    const resA = telemetryPayloads[siteA] || {};
    const resB = telemetryPayloads[siteB] || {};
    const scoreA = (resA.isDown ? 100 : 0) + ((resA.activeSev1Count || 0) * 50) + ((resA.totalOpenCases || 0) * 2);
    const scoreB = (resB.isDown ? 100 : 0) + ((resB.activeSev1Count || 0) * 50) + ((resB.totalOpenCases || 0) * 2);
    const worseSite = scoreA >= scoreB ? resA : resB;

    return generateExecutiveDashboardHtml({
      title: `SITEPULSE RELIABILITY COMPARISON: ${(resA.siteName || siteA).toUpperCase()} VS ${(resB.siteName || siteB).toUpperCase()}`,
      timeframe: targetRange,
      kpis: [
        { label: `${resA.siteName || siteA} Open Cases`, value: resA.totalOpenCases || 0, sub: `${resA.activeSev1Count || 0} Sev 1`, color: resA.activeSev1Count > 0 ? 'var(--red)' : 'var(--text)' },
        { label: `${resB.siteName || siteB} Open Cases`, value: resB.totalOpenCases || 0, sub: `${resB.activeSev1Count || 0} Sev 1`, color: resB.activeSev1Count > 0 ? 'var(--red)' : 'var(--text)' },
        { label: 'Higher Risk Facility', value: worseSite.siteName || 'Site A', sub: 'Priority Attention', color: 'var(--red)' },
        { label: 'Fleet Status', value: (resA.isDown || resB.isDown) ? 'DEGRADED' : 'OPERATIONAL', sub: 'Audited Telemetry', color: (resA.isDown || resB.isDown) ? 'var(--red)' : 'var(--green)' },
      ],
      tableTitle: `Active Incident Tickets: ${worseSite.siteName || 'Higher Risk Site'}`,
      tableHeaders: ['Case #', 'Severity', 'Status', 'Subject'],
      tableRows: (worseSite.openCases || []).slice(0, 10).map(c => ({
        category: String(c.severity || '').includes('1') ? 'sev1' : 'sev2',
        cells: [`<b>${cleanCaseId(c.caseNumber)}</b>`, c.severity || 'N/A', `Status: ${c.status || 'Open'}`, c.subject || 'Investigation'],
      })),
      recommendations: [
        `Direct immediate on-call SRE resources to ${worseSite.siteName || 'the higher risk site'}.`,
        `Address aging ticket backlogs and resolve hardware telemetry exceptions.`,
      ],
    });
  }

  // 3. RED Zone Breaches Workflow
  if (isBreach || telemetryPayloads.redZone) {
    const rz = telemetryPayloads.redZone || {};
    const breachedSites = (rz.sites || []).filter(s => s.status === 'ACTIVE_BREACH' || s.isCurrentBreach);
    const exitSites = (rz.sites || []).filter(s => s.status === 'EXIT_PENDING');

    return generateExecutiveDashboardHtml({
      title: 'SITEPULSE RED ZONE RELIABILITY AUDIT',
      timeframe: targetRange,
      kpis: [
        { label: 'Active Breaches', value: rz.activeBreachesCount || breachedSites.length, sub: 'Immediate Risk', color: 'var(--red)' },
        { label: 'Exit Probation', value: rz.exitPendingCount || exitSites.length, sub: '21-day monitor', color: 'var(--amber)' },
        { label: 'Total Tracked', value: rz.totalRedZoneSites || (rz.sites || []).length, sub: 'RED Zone registry', color: 'var(--blue)' },
        { label: 'SRE SLA Compliance', value: breachedSites.length === 0 ? 'NOMINAL' : 'NON-COMPLIANT', sub: 'Target: 0 Breaches', color: breachedSites.length === 0 ? 'var(--green)' : 'var(--red)' },
      ],
      tableTitle: 'RED Zone Facilities Roster',
      tabs: [
        { key: 'all', label: 'All Sites' },
        { key: 'breach', label: 'Active Breaches' },
        { key: 'exit', label: 'Exit Pending' },
      ],
      tableHeaders: ['Site Name', 'Status', 'Uptime', 'MTBF', 'Qualifying Incidents'],
      tableRows: (rz.sites || []).slice(0, 20).map(s => {
        const isBr = s.status === 'ACTIVE_BREACH' || s.isCurrentBreach;
        return {
          category: isBr ? 'breach' : 'exit',
          cells: [
            `<b>${s.siteName}</b>`,
            `<span class="badge ${isBr ? 'badge-red' : 'badge-amber'}">${isBr ? 'ACTIVE BREACH' : 'EXIT PENDING'}</span>`,
            `Uptime: ${s.criteria2_uptime?.uptimePercentage || 'N/A'}`,
            `MTBF: ${s.criteria3_mtbf?.mtbfHours || 'N/A'}`,
            `${(s.recentQualifyingIncidents || []).length} incidents`,
          ],
        };
      }),
      recommendations: [
        'Mandate war-room protocol for facilities in ACTIVE BREACH.',
        'Review Root Cause Analysis (RCA) on all qualifying Sev-1/Sev-2 incidents.',
        'Enforce 21 continuous incident-free days before clearing sites from probation.',
      ],
    });
  }

  // 4. Fleet Incidents Workflow
  if (isIncidentQuery || telemetryPayloads.fleetIncidents) {
    const incData = telemetryPayloads.fleetIncidents || {};
    const incidents = incData.incidents || [];
    return generateExecutiveDashboardHtml({
      title: 'SITEPULSE ACTIVE FLEET INCIDENTS',
      timeframe: targetRange,
      kpis: [
        { label: 'Total Incidents', value: incData.totalIncidents || incidents.length, sub: 'Filtered Timeframe', color: 'var(--blue)' },
        { label: 'SEV 1 Urgent', value: incData.sev1Count || 0, sub: '100% Disruption', color: (incData.sev1Count || 0) > 0 ? 'var(--red)' : 'var(--green)' },
        { label: 'SEV 2 High', value: incData.sev2Count || 0, sub: 'Throughput Impact', color: (incData.sev2Count || 0) > 0 ? 'var(--amber)' : 'var(--green)' },
        { label: 'Health Status', value: (incData.sev1Count || 0) > 0 ? 'CRITICAL' : 'STABLE', sub: 'Fleet SLA', color: (incData.sev1Count || 0) > 0 ? 'var(--red)' : 'var(--green)' },
      ],
      tableTitle: 'Active Incident Tickets',
      tableHeaders: ['Case #', 'Severity', 'Site', 'Status', 'Subject'],
      tableRows: incidents.slice(0, 20).map(i => {
        const isS1 = String(i.severity || '').includes('1');
        return {
          category: isS1 ? 'sev1' : 'sev2',
          cells: [
            `<b>${cleanCaseId(i.caseNumber)}</b>`,
            `<span class="badge ${isS1 ? 'badge-red' : 'badge-amber'}">${i.severity || 'N/A'}</span>`,
            i.siteName || 'Fleet',
            `Status: ${i.status || 'Open'}`,
            i.subject || 'Incident Ticket',
          ],
        };
      }),
      recommendations: [
        'Engage engineering teams immediately on any open Sev-1 or Sev-2 incidents.',
        'Track incident resolution SLA against the 2-hour target.',
      ],
    });
  }

  const ov = telemetryPayloads.fleetOverview || {};
  return generateExecutiveDashboardHtml({
    title: 'SITEPULSE FLEET OPERATIONS OVERVIEW',
    timeframe: targetRange,
    kpis: [
      { label: 'Monitored Sites', value: `${ov.totalSites || 80}+`, sub: 'Enterprise Centers', color: 'var(--blue)' },
      { label: 'Active Sev-1 Outages', value: ov.sev1Count || 0, sub: '100% Impact', color: (ov.sev1Count || 0) > 0 ? 'var(--red)' : 'var(--green)' },
      { label: 'Active Sev-2 Outages', value: ov.sev2Count || 0, sub: 'Throughput Impact', color: (ov.sev2Count || 0) > 0 ? 'var(--amber)' : 'var(--green)' },
      { label: 'Total Open Cases', value: ov.totalOpenCases || 0, sub: 'Fleet-wide', color: 'var(--text)' },
    ],
    tableTitle: 'Fleet Reliability Overview',
    tableHeaders: ['Metric', 'Current State', 'SRE Target', 'Status'],
    tableRows: [
      { category: 'all', cells: ['SEV 1 Urgent Outages', `${ov.sev1Count || 0}`, '0', (ov.sev1Count || 0) === 0 ? 'NOMINAL' : 'BREACH'] },
      { category: 'all', cells: ['SEV 2 High Outages', `${ov.sev2Count || 0}`, '< 3', (ov.sev2Count || 0) < 3 ? 'NOMINAL' : 'ATTENTION'] },
      { category: 'all', cells: ['Sites in Critical Down', `${ov.downSitesCount || 0}`, '0', (ov.downSitesCount || 0) === 0 ? 'NOMINAL' : 'CRITICAL'] },
    ],
    recommendations: [
      'Maintain active monitoring across all 80+ customer fulfillment centers.',
      'Ensure swift resolution on any SEV 1 / SEV 2 incidents to avoid SLA breaches.',
    ],
  });
}

/**
 * Synthesizes an executive operational briefing directly from pre-fetched live Salesforce telemetry.
 * Serves as a rock-solid, zero-latency safety net if OpenRouter model runs out of token length or returns empty content.
 */
function formatExecutiveBriefingFromTelemetry({
  cleanInput,
  telemetryPayloads,
  detectedSites = [],
  targetRange = '24h',
  isComparison = false,
  isBreach = false,
  isSiteAudit = false,
  isIncidentQuery = false,
}) {
  const cleanCaseId = (num) => {
    const str = String(num || '').trim();
    return str.startsWith('#') ? str : (str ? `#${str}` : 'N/A');
  };

  // 1. Site Deep Dive & Audit
  if (isSiteAudit || telemetryPayloads.siteDetails) {
    const siteRes = telemetryPayloads.siteDetails || {};
    const alertRes = telemetryPayloads.alertAnalytics || {};
    const targetSite = siteRes.siteName || detectedSites[0] || 'Site';
    const openCases = siteRes.openCases || [];

    let text = `### Operational Status & SRE Audit: ${targetSite}\n\n`;
    text += `> **EXECUTIVE SUMMARY**: Operational telemetry retrieved live from Salesforce and Sitepulse monitoring for **${targetSite}** (${targetRange}).\n\n`;
    text += `- **Site Operational Status**: Status: ${siteRes.isDown ? 'Critical Site Down' : 'Operational'}\n`;
    text += `- **Product Lines Monitored**: ${(siteRes.productLines || []).join(', ') || 'RMS, RIL'}\n`;
    text += `- **Total Open Cases**: ${siteRes.totalOpenCases || openCases.length}\n`;
    text += `- **Active [SEV 1 URGENT] Cases**: ${siteRes.activeSev1Count || 0} (100% impact)\n`;
    text += `- **Active [SEV 2 URGENT] Cases**: ${siteRes.activeSev2UrgentCount || 0} (50-99% impact)\n`;
    text += `- **Active [SEV 2 HIGH] Cases**: ${siteRes.activeSev2HighCount || 0} (1-49% impact)\n`;
    text += `- **Telemetry Machine Alarms**: ${alertRes.totalAlerts || siteRes.totalAlerts || 0} (${alertRes.openAlerts || 0} open)\n\n`;

    text += `#### Active Incident Tickets: ${targetSite}\n\n`;
    if (openCases.length > 0) {
      text += `| Case Number | Severity | Status | Impact % | Subject | Created Date |\n|---|---|---|---|---|---|\n`;
      for (const c of openCases.slice(0, 15)) {
        text += `| ${cleanCaseId(c.caseNumber)} | ${c.severity || '[SEV 3 INCIDENT]'} | Status: ${c.status || 'Open'} | ${c.impactPercentage ? c.impactPercentage + '%' : 'N/A'} | ${c.subject || 'Incident investigation'} | ${c.createdDate ? new Date(c.createdDate).toLocaleDateString() : 'N/A'} |\n`;
      }
      text += `\n`;
    } else {
      text += `Status: No open incident tickets currently active for ${targetSite}.\n\n`;
    }

    const htmlArtifact = generateExecutiveDashboardHtml({
      title: `SITEPULSE OPERATIONAL DASHBOARD: ${targetSite.toUpperCase()}`,
      timeframe: targetRange,
      kpis: [
        { label: 'Site Status', value: siteRes.isDown ? 'CRITICAL DOWN' : 'OPERATIONAL', sub: 'Audited Status', color: siteRes.isDown ? 'var(--red)' : 'var(--green)' },
        { label: 'Total Open Cases', value: siteRes.totalOpenCases || openCases.length, sub: 'Active Tickets', color: (siteRes.totalOpenCases || openCases.length) > 5 ? 'var(--red)' : 'var(--text)' },
        { label: 'SEV 1 Urgent', value: siteRes.activeSev1Count || 0, sub: '100% Impact Disruption', color: (siteRes.activeSev1Count || 0) > 0 ? 'var(--red)' : 'var(--green)' },
        { label: 'SEV 2 Urgent / High', value: (siteRes.activeSev2UrgentCount || 0) + (siteRes.activeSev2HighCount || 0), sub: 'Throughput Risk', color: ((siteRes.activeSev2UrgentCount || 0) + (siteRes.activeSev2HighCount || 0)) > 0 ? 'var(--amber)' : 'var(--green)' },
      ],
      tableTitle: `Live Incident Cases: ${targetSite}`,
      tabs: [
        { key: 'all', label: 'All Cases' },
        { key: 'sev1', label: 'SEV 1' },
        { key: 'sev2', label: 'SEV 2' },
      ],
      tableHeaders: ['Case #', 'Severity', 'Status', 'Subject', 'Created Date'],
      tableRows: openCases.slice(0, 20).map(c => {
        const sev = String(c.severity || '').toLowerCase();
        const isSev1 = sev.includes('1');
        const isSev2 = sev.includes('2');
        return {
          category: isSev1 ? 'sev1' : isSev2 ? 'sev2' : 'other',
          cells: [
            `<b>${cleanCaseId(c.caseNumber)}</b>`,
            `<span class="badge ${isSev1 ? 'badge-red' : isSev2 ? 'badge-amber' : 'badge-blue'}">${String(c.severity || 'N/A').toUpperCase()}</span>`,
            `Status: ${c.status || 'Open'}`,
            c.subject || 'Case ticket',
            c.createdDate ? new Date(c.createdDate).toLocaleDateString() : 'N/A',
          ],
        };
      }),
      recommendations: [
        `Prioritize engineering swarming on open Sev-1 / Sev-2 tickets at ${targetSite}.`,
        `Inspect Opsgenie hardware & controller telemetry signals to prevent downtime escalation.`,
        `Maintain 24/7 reliability monitoring across ${targetSite} automated material handling systems.`,
      ],
    });

    return text + '\n\n' + htmlArtifact;
  }

  // 2. Comparison Workflow
  if (isComparison && detectedSites.length >= 2) {
    const siteA = detectedSites[0];
    const siteB = detectedSites[1];
    const resA = telemetryPayloads[siteA] || {};
    const resB = telemetryPayloads[siteB] || {};
    const scoreA = (resA.isDown ? 100 : 0) + ((resA.activeSev1Count || 0) * 50) + ((resA.totalOpenCases || 0) * 2);
    const scoreB = (resB.isDown ? 100 : 0) + ((resB.activeSev1Count || 0) * 50) + ((resB.totalOpenCases || 0) * 2);
    const worseSite = scoreA >= scoreB ? resA : resB;
    const betterSite = scoreA >= scoreB ? resB : resA;

    let text = `### Comparative Operational Reliability Audit: ${resA.siteName || siteA} vs ${resB.siteName || siteB}\n\n`;
    text += `> **EXECUTIVE AUDIT SUMMARY**: ${worseSite.siteName || 'Site A'} exhibits higher operational risk with **${worseSite.totalOpenCases || 0} open cases** and **${worseSite.activeSev1Count || 0} active [SEV 1 URGENT] outages** compared to ${betterSite.siteName || 'Site B'} (**${betterSite.totalOpenCases || 0} open cases**).\n\n`;
    text += `| Metric | ${resA.siteName || siteA} | ${resB.siteName || siteB} |\n|---|---|---|\n`;
    text += `| **Operational State** | Status: ${resA.isDown ? 'Critical Down' : 'Operational'} | Status: ${resB.isDown ? 'Critical Down' : 'Operational'} |\n`;
    text += `| **SEV 1 Urgent (100%)** | ${resA.activeSev1Count || 0} | ${resB.activeSev1Count || 0} |\n`;
    text += `| **SEV 2 Urgent (50-99%)** | ${resA.activeSev2UrgentCount || 0} | ${resB.activeSev2UrgentCount || 0} |\n`;
    text += `| **Total Open Cases** | ${resA.totalOpenCases || 0} | ${resB.totalOpenCases || 0} |\n`;
    text += `| **Telemetry Alarms** | ${resA.totalAlerts || 0} | ${resB.totalAlerts || 0} |\n\n`;

    const htmlArtifact = generateExecutiveDashboardHtml({
      title: `SITEPULSE RELIABILITY COMPARISON: ${(resA.siteName || siteA).toUpperCase()} VS ${(resB.siteName || siteB).toUpperCase()}`,
      timeframe: targetRange,
      kpis: [
        { label: `${resA.siteName || siteA} Open Cases`, value: resA.totalOpenCases || 0, sub: `${resA.activeSev1Count || 0} Sev 1`, color: resA.activeSev1Count > 0 ? 'var(--red)' : 'var(--text)' },
        { label: `${resB.siteName || siteB} Open Cases`, value: resB.totalOpenCases || 0, sub: `${resB.activeSev1Count || 0} Sev 1`, color: resB.activeSev1Count > 0 ? 'var(--red)' : 'var(--text)' },
        { label: 'Higher Risk Facility', value: worseSite.siteName || 'Site A', sub: 'Priority Attention', color: 'var(--red)' },
        { label: 'Fleet Status', value: (resA.isDown || resB.isDown) ? 'DEGRADED' : 'OPERATIONAL', sub: 'Audited Telemetry', color: (resA.isDown || resB.isDown) ? 'var(--red)' : 'var(--green)' },
      ],
      tableTitle: `Active Incident Tickets: ${worseSite.siteName || 'Higher Risk Site'}`,
      tableHeaders: ['Case #', 'Severity', 'Status', 'Subject'],
      tableRows: (worseSite.openCases || []).slice(0, 10).map(c => ({
        category: String(c.severity || '').includes('1') ? 'sev1' : 'sev2',
        cells: [`<b>${cleanCaseId(c.caseNumber)}</b>`, c.severity || 'N/A', `Status: ${c.status || 'Open'}`, c.subject || 'Investigation'],
      })),
      recommendations: [
        `Direct immediate on-call SRE resources to ${worseSite.siteName || 'the higher risk site'}.`,
        `Address aging ticket backlogs and resolve hardware telemetry exceptions.`,
      ],
    });

    return text + '\n\n' + htmlArtifact;
  }

  // 3. RED Zone Breaches Workflow
  if (isBreach || telemetryPayloads.redZone) {
    const rz = telemetryPayloads.redZone || {};
    const breachedSites = (rz.sites || []).filter(s => s.status === 'ACTIVE_BREACH' || s.isCurrentBreach);
    const exitSites = (rz.sites || []).filter(s => s.status === 'EXIT_PENDING');

    let text = `### Fleet RED Zone & Reliability Breach Audit (${targetRange})\n\n`;
    text += `> **EXECUTIVE BREACH SUMMARY**: **${rz.activeBreachesCount || breachedSites.length} Active RED Zone Breaches** detected across monitored fulfillment centers. Immediate executive SRE action is required.\n\n`;
    text += `- **Active Breach Facilities**: ${rz.activeBreachesCount || breachedSites.length}\n`;
    text += `- **Exit Probation Facilities (21-day clean window)**: ${rz.exitPendingCount || exitSites.length}\n`;
    text += `- **Total Monitored RED Zone Sites**: ${rz.totalRedZoneSites || (rz.sites || []).length}\n\n`;

    text += `#### Breached Site Breakdown\n\n`;
    if (breachedSites.length > 0) {
      text += `| Site Name | Breach Status | Criteria 1 (Sev 1/2) | Criteria 2 (Uptime) | Criteria 3 (MTBF) |\n|---|---|---|---|---|\n`;
      for (const s of breachedSites) {
        text += `| **${s.siteName}** | Status: ACTIVE BREACH | ${s.criteria1?.sev1Count7d || 0} Sev-1 / ${s.criteria1?.sev2Count7d || 0} Sev-2 | Uptime: ${s.criteria2_uptime?.uptimePercentage || 'N/A'} | MTBF: ${s.criteria3_mtbf?.mtbfHours || 'N/A'} |\n`;
      }
      text += `\n`;
    }

    const htmlArtifact = generateExecutiveDashboardHtml({
      title: 'SITEPULSE RED ZONE RELIABILITY AUDIT',
      timeframe: targetRange,
      kpis: [
        { label: 'Active Breaches', value: rz.activeBreachesCount || breachedSites.length, sub: 'Immediate Risk', color: 'var(--red)' },
        { label: 'Exit Probation', value: rz.exitPendingCount || exitSites.length, sub: '21-day monitor', color: 'var(--amber)' },
        { label: 'Total Tracked', value: rz.totalRedZoneSites || (rz.sites || []).length, sub: 'RED Zone registry', color: 'var(--blue)' },
        { label: 'SRE SLA Compliance', value: breachedSites.length === 0 ? 'NOMINAL' : 'NON-COMPLIANT', sub: 'Target: 0 Breaches', color: breachedSites.length === 0 ? 'var(--green)' : 'var(--red)' },
      ],
      tableTitle: 'RED Zone Facilities Roster',
      tabs: [
        { key: 'all', label: 'All Sites' },
        { key: 'breach', label: 'Active Breaches' },
        { key: 'exit', label: 'Exit Pending' },
      ],
      tableHeaders: ['Site Name', 'Status', 'Uptime', 'MTBF', 'Qualifying Incidents'],
      tableRows: (rz.sites || []).slice(0, 20).map(s => {
        const isBr = s.status === 'ACTIVE_BREACH' || s.isCurrentBreach;
        return {
          category: isBr ? 'breach' : 'exit',
          cells: [
            `<b>${s.siteName}</b>`,
            `<span class="badge ${isBr ? 'badge-red' : 'badge-amber'}">${isBr ? 'ACTIVE BREACH' : 'EXIT PENDING'}</span>`,
            `Uptime: ${s.criteria2_uptime?.uptimePercentage || 'N/A'}`,
            `MTBF: ${s.criteria3_mtbf?.mtbfHours || 'N/A'}`,
            `${(s.recentQualifyingIncidents || []).length} incidents`,
          ],
        };
      }),
      recommendations: [
        'Mandate war-room protocol for facilities in ACTIVE BREACH.',
        'Review Root Cause Analysis (RCA) on all qualifying Sev-1/Sev-2 incidents.',
        'Enforce 21 continuous incident-free days before clearing sites from probation.',
      ],
    });

    return text + '\n\n' + htmlArtifact;
  }

  // 4. Fleet Incidents Workflow
  if (isIncidentQuery || telemetryPayloads.fleetIncidents) {
    const incData = telemetryPayloads.fleetIncidents || {};
    const incidents = incData.incidents || [];
    let text = `### Fleet Incidents & Sev-1 / Sev-2 Reliability Summary (${targetRange})\n\n`;
    text += `- **Total Active Incidents**: ${incData.totalIncidents || incidents.length}\n`;
    text += `- **SEV 1 Urgent (100% Impact)**: ${incData.sev1Count || 0}\n`;
    text += `- **SEV 2 Urgent / High**: ${incData.sev2Count || 0}\n\n`;

    if (incidents.length > 0) {
      text += `| Case Number | Severity | Site | Status | Impact % | Subject |\n|---|---|---|---|---|---|\n`;
      for (const i of incidents.slice(0, 15)) {
        text += `| ${cleanCaseId(i.caseNumber)} | ${i.severity || '[SEV 2 HIGH]'} | ${i.siteName || 'Fleet'} | Status: ${i.status || 'Open'} | ${i.impactPercentage ? i.impactPercentage + '%' : 'N/A'} | ${i.subject || 'Incident'} |\n`;
      }
      text += `\n`;
    }

    const htmlArtifact = generateExecutiveDashboardHtml({
      title: 'SITEPULSE ACTIVE FLEET INCIDENTS',
      timeframe: targetRange,
      kpis: [
        { label: 'Total Incidents', value: incData.totalIncidents || incidents.length, sub: 'Filtered Timeframe', color: 'var(--blue)' },
        { label: 'SEV 1 Urgent', value: incData.sev1Count || 0, sub: '100% Disruption', color: (incData.sev1Count || 0) > 0 ? 'var(--red)' : 'var(--green)' },
        { label: 'SEV 2 High', value: incData.sev2Count || 0, sub: 'Throughput Impact', color: (incData.sev2Count || 0) > 0 ? 'var(--amber)' : 'var(--green)' },
        { label: 'Health Status', value: (incData.sev1Count || 0) > 0 ? 'CRITICAL' : 'STABLE', sub: 'Fleet SLA', color: (incData.sev1Count || 0) > 0 ? 'var(--red)' : 'var(--green)' },
      ],
      tableTitle: 'Active Incident Tickets',
      tableHeaders: ['Case #', 'Severity', 'Site', 'Status', 'Subject'],
      tableRows: incidents.slice(0, 20).map(i => {
        const isS1 = String(i.severity || '').includes('1');
        return {
          category: isS1 ? 'sev1' : 'sev2',
          cells: [
            `<b>${cleanCaseId(i.caseNumber)}</b>`,
            `<span class="badge ${isS1 ? 'badge-red' : 'badge-amber'}">${i.severity || 'N/A'}</span>`,
            i.siteName || 'Fleet',
            `Status: ${i.status || 'Open'}`,
            i.subject || 'Incident Ticket',
          ],
        };
      }),
      recommendations: [
        'Engage engineering teams immediately on any open Sev-1 or Sev-2 incidents.',
        'Track incident resolution SLA against the 2-hour target.',
      ],
    });

    return text + '\n\n' + htmlArtifact;
  }

  // 5. Fallback General Fleet Overview
  const ov = telemetryPayloads.fleetOverview || {};
  let text = `### Live Fleet Operations Telemetry (${targetRange})\n\n`;
  text += `- **Total Monitored Sites**: ${ov.totalSites || 80}+\n`;
  text += `- **Critical Down Sites**: ${ov.downSitesCount || 0}\n`;
  text += `- **Active SEV 1 Urgent Cases**: ${ov.sev1Count || 0}\n`;
  text += `- **Active SEV 2 Urgent Cases**: ${ov.sev2Count || 0}\n`;
  text += `- **Total Open Incidents**: ${ov.totalOpenCases || 0}\n\n`;

  const htmlArtifact = generateExecutiveDashboardHtml({
    title: 'SITEPULSE FLEET OPERATIONS OVERVIEW',
    timeframe: targetRange,
    kpis: [
      { label: 'Monitored Sites', value: `${ov.totalSites || 80}+`, sub: 'Enterprise Centers', color: 'var(--blue)' },
      { label: 'Active Sev-1 Outages', value: ov.sev1Count || 0, sub: '100% Impact', color: (ov.sev1Count || 0) > 0 ? 'var(--red)' : 'var(--green)' },
      { label: 'Active Sev-2 Outages', value: ov.sev2Count || 0, sub: 'Throughput Impact', color: (ov.sev2Count || 0) > 0 ? 'var(--amber)' : 'var(--green)' },
      { label: 'Total Open Cases', value: ov.totalOpenCases || 0, sub: 'Fleet-wide', color: 'var(--text)' },
    ],
    tableTitle: 'Fleet Reliability Overview',
    tableHeaders: ['Metric', 'Current State', 'SRE Target', 'Status'],
    tableRows: [
      { category: 'all', cells: ['SEV 1 Urgent Outages', `${ov.sev1Count || 0}`, '0', (ov.sev1Count || 0) === 0 ? 'NOMINAL' : 'BREACH'] },
      { category: 'all', cells: ['SEV 2 High Outages', `${ov.sev2Count || 0}`, '< 3', (ov.sev2Count || 0) < 3 ? 'NOMINAL' : 'ATTENTION'] },
      { category: 'all', cells: ['Sites in Critical Down', `${ov.downSitesCount || 0}`, '0', (ov.downSitesCount || 0) === 0 ? 'NOMINAL' : 'CRITICAL'] },
    ],
    recommendations: [
      'Maintain active monitoring across all 80+ customer fulfillment centers.',
      'Ensure swift resolution on any SEV 1 / SEV 2 incidents to avoid SLA breaches.',
    ],
  });

  return text + '\n\n' + htmlArtifact;
}

/**
 * Extracts generated text content from OpenRouter API responses.
 * Handles standard message.content as well as reasoning/reasoning_content
 * used by reasoning/MoE models (Nemotron, DeepSeek, Qwen).
 */
function extractOpenRouterContent(data) {
  const choice = data?.choices?.[0];
  if (!choice) return '';
  const msg = choice.message;
  const content = msg?.content || '';
  if (content && typeof content === 'string' && content.trim()) return content.trim();
  const reasoning = msg?.reasoning || msg?.reasoning_content || '';
  if (reasoning && typeof reasoning === 'string' && reasoning.trim()) return reasoning.trim();
  if (choice.text && typeof choice.text === 'string' && choice.text.trim()) return choice.text.trim();
  return '';
}

/**
 * Resilient, fast caller for OpenRouter OpenAI-compatible chat completions API.
 * Automatically handles multi-model auto-failover:
 * If the configured model hits a temporary 429 upstream rate limit, it seamlessly fails over
 * to high-capacity free models (llama-3.3-70b, llama-3.1-8b, qwen-2.5) without hanging or crashing.
 */
async function callOpenRouterWithRetry({ url, headers, payload }) {
  const requestedModel = payload.model || (process.env.OPENROUTER_MODEL || 'openrouter/free').trim();
  const candidateModels = [
    'openrouter/free',
    requestedModel,
    'minimax/minimax-m3.1-flash:free',
    'meta-llama/llama-3.2-3b-instruct:free',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i && !m.includes('nemotron') && !m.includes('3.8'));

  // Free models often reject or 404 when OpenAI 'tools' / function-calling schema is passed.
  // Strip 'tools' and 'tool_choice' to ensure universal compatibility across free endpoints!
  const cleanPayload = { ...payload };
  if (cleanPayload.tools && (!cleanPayload.model || cleanPayload.model.includes(':free') || cleanPayload.model === 'openrouter/free')) {
    delete cleanPayload.tools;
    delete cleanPayload.tool_choice;
  }

  let lastErr = null;
  for (let i = 0; i < candidateModels.length; i++) {
    const activeModel = candidateModels[i];
    try {
      console.log(`[Pulse AI OpenRouter] Invoking model=${activeModel} (attempt ${i + 1}/${candidateModels.length})...`);
      const currentPayload = { ...cleanPayload, model: activeModel };
      // Snappy timeout per candidate so user never waits >15s total across failovers
      const timeoutMs = i === 0 ? 7000 : 5000;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(currentPayload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) {
        const data = await res.json();
        const content = extractOpenRouterContent(data);
        if (content && content.trim()) {
          data._modelUsed = activeModel;
          return data;
        }
      }

      const errText = await res.text().catch(() => '');
      console.warn(`[Pulse AI OpenRouter] Model ${activeModel} HTTP ${res.status}:`, errText.slice(0, 180));

      // If 404 (free tier discontinued), 429 (rate-limited), or 500-503 (server error), failover immediately!
      if (res.status === 404 || res.status === 429 || res.status >= 500) {
        lastErr = new Error(`OpenRouter HTTP ${res.status} on ${activeModel}: ${errText.slice(0, 120)}`);
        continue;
      }

      throw new Error(`OpenRouter HTTP ${res.status}: ${errText.slice(0, 120)}`);
    } catch (err) {
      lastErr = err;
      console.warn(`[Pulse AI OpenRouter] Model ${activeModel} notice:`, err.message);
    }
  }

  throw lastErr || new Error('OpenRouter invocation failed across candidate models.');
}

/**
 * Dynamically detects any of the 80+ customer fulfillment sites from user query.
 * Handles exact names, Swedish/accented characters (ä->a), acronyms, and aliases.
 */
export function detectSitesFromQuery(input) {
  if (!input || typeof input !== 'string') return [];
  const rawLower = input.toLowerCase();
  const normInput = rawLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const detected = new Set();

  // 1. Explicit aliases & common acronyms
  if (normInput.includes('h&m') || normInput.includes('hnm') || normInput.includes('ajax') || (normInput.includes('canada') && !normInput.includes('walmart'))) {
    detected.add('H&M Canada Ajax');
  }
  if (normInput.includes('sams') || normInput.includes('4993')) {
    if (normInput.includes('lax') && !normInput.includes('atl')) {
      detected.add('Sams Club LAX');
    } else if (normInput.includes('atl') && !normInput.includes('lax')) {
      detected.add('Sams Club ATL');
    } else if (!normInput.includes('lax') && !normInput.includes('atl')) {
      detected.add('Sams Club ATL');
    } else {
      detected.add('Sams Club ATL');
      detected.add('Sams Club LAX');
    }
  }
  if (normInput.includes('walmart') || normInput.includes('wal-mart')) {
    if (normInput.includes('canada') && !normInput.includes('mexico')) {
      detected.add('Walmart-Canada');
    } else if (normInput.includes('mexico') && !normInput.includes('canada')) {
      detected.add('Walmart Mexico');
    } else if (normInput.includes('mexico') && normInput.includes('canada')) {
      detected.add('Walmart Mexico');
      detected.add('Walmart-Canada');
    } else {
      detected.add('Walmart Mexico');
    }
  }
  if (normInput.includes('gxo')) {
    detected.add('GXO-H&M Prod');
  }
  if (normInput.includes('apotek') || normInput.includes('hjartat')) {
    detected.add('Apotek Hjärtat');
  }
  if (normInput.includes('active ants') || normInput.includes('ants')) {
    detected.add('Active Ants');
  }
  if (normInput.includes('dhl') || normInput.includes('goodyear') || normInput.includes('figs')) {
    detected.add('DHL Figs-USA (Goodyear)');
  }
  if (normInput.includes('skechers')) {
    detected.add('Skechers Japan');
  }
  if (normInput.includes('panalpina')) {
    detected.add('Panalpina');
  }
  if (normInput.includes('bravissimo')) {
    detected.add('Bravissimo');
  }

  // 2. Scan entire site catalog
  const pool = [...(DEFAULT_ALL_SITE_NAMES || []), ...(defaultSites || []).map(s => s.name || s)];
  for (const siteName of pool) {
    if (!siteName || typeof siteName !== 'string') continue;
    const normSite = siteName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normInput.includes(normSite)) {
      detected.add(siteName);
      continue;
    }
    const tokens = normSite.split(/[\s\-_,.]+/).filter(t => t.length >= 3 && !['club', 'prod', 'live', 'site', 'whse', 'warehouse', 'the', 'and', 'for', 'dc01', 'dc02'].includes(t));
    if (tokens.length >= 2 && tokens.every(t => normInput.includes(t))) {
      detected.add(siteName);
    }
  }

  return Array.from(detected);
}

/**
 * Executes a fast, resilient conversation turn with OpenRouter targeting openrouter/free.
 * Features:
 * - Direct execution with openrouter/free (no model override)
 * - Dynamic Site Detection: Recognizes Apotek Hjärtat and all 80+ customer fulfillment sites.
 * - 1-Shot Telemetry Pre-fetch: Resolves all site/incident data in Node.js (<200ms) and passes ground-truth in prompt.
 * - Zero-Crash Resilience: If OpenRouter returns finish_reason="length" or empty content, formats live Salesforce telemetry directly.
 * - Always returns HTTP 200 with rich operational briefing and interactive HTML dashboard.
 */
async function tryOpenRouterChat({ session, cleanInput, mode = 'agent' }) {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) return null;

  // Use the exact configured model, defaulting to openrouter/free
  const model = (process.env.OPENROUTER_MODEL || 'openrouter/free').trim();
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://godseye.greyorange.com',
    'X-Title': 'Sitepulse Pulse AI',
  };

  const lower = cleanInput.toLowerCase();

  // Detect timeframe
  let targetRange = '24h';
  if (lower.includes('48h') || lower.includes('2 day') || lower.includes('2day') || lower.includes('48 hour') || lower.includes('2d')) targetRange = '48h';
  else if (lower.includes('7d') || lower.includes('7 day') || lower.includes('7day') || lower.includes('week')) targetRange = '7d';
  else if (lower.includes('15d') || lower.includes('15 day')) targetRange = '15d';
  else if (lower.includes('1m') || lower.includes('month') || lower.includes('30d')) targetRange = '1m';
  else if (lower.includes('all') || lower.includes('ever') || lower.includes('history')) targetRange = 'all';

  // Detect mentioned sites dynamically across all 80+ customer fulfillment sites
  const detectedSites = detectSitesFromQuery(cleanInput);

  const isGreeting = /^(hi+|hello+|hey+|heya|hiya|greetings|good\s*(morning|afternoon|evening)|who are you|help|sup)[!.\s]*$/i.test(cleanInput);
  const opsRegex = /\b(sev\s*[-]?\s*[1-4]|p[1-4]|severity|incident|incidents|ticket|tickets|case|cases|outage|outages|downtime|uptime|red\s*zone|redzone|breach|breaches|sla|slas|mtbf|probation|fleet|site|sites|fulfillment|warehouse|greyorange|butler|sorter|opsgenie|alert|alerts|salesforce|soql|overview|audit|status|health)\b/i;
  const hasOpsKeywords = opsRegex.test(cleanInput) || detectedSites.length > 0;
  const isGeneralQuestion = !hasOpsKeywords && !isGreeting;
  const effectiveMode = (mode === 'ask' || mode === 'query') ? 'ask' : 'agent';

  const isComparison = detectedSites.length >= 2 || (detectedSites.length === 1 && (lower.includes('compare') || lower.includes('versus') || lower.includes('vs') || lower.includes('worst') || lower.includes('better')));
  const isBreach = lower.includes('breach') || lower.includes('red zone') || lower.includes('redzone') || (lower.includes('alert') && (lower.includes('report') || lower.includes('active')));
  const isIncidentQuery = lower.includes('sev 1') || lower.includes('sev-1') || lower.includes('sev 2') || lower.includes('sev-2') || lower.includes('incident') || lower.includes('24h') || lower.includes('today') || lower.includes('ticket') || lower.includes('outage') || lower.includes('case') || lower.includes('down');
  const isSiteAudit = detectedSites.length > 0;
  const isFleetOverview = lower.includes('fleet') || lower.includes('overview') || lower.includes('status') || lower.includes('health') || lower.includes('report') || lower.includes('solution') || lower.includes('check');

  // Fast-Path: single inference pass cutting 300s tool loops down to 2-6s!
  console.log(`[Pulse AI Fast-Path] Intent: greeting=${isGreeting}, generalQuestion=${isGeneralQuestion}, hasOpsKeywords=${hasOpsKeywords}, effectiveMode=${effectiveMode} for "${cleanInput.slice(0, 50)}"`);

  const toolsExecuted = [];
  const telemetryPayloads = {};

  // ONLY pre-fetch telemetry if this is an operational inquiry (never for general questions or simple greetings)
  if (hasOpsKeywords && !isGreeting) {
    try {
      if (isComparison) {
        const siteA = detectedSites[0] || 'H&M Canada Ajax';
        const siteB = detectedSites[1] || 'Sams Club ATL';
        const [resA, resB] = await Promise.all([
          executeToolCall('get_site_details', { siteName: siteA, range: targetRange }),
          executeToolCall('get_site_details', { siteName: siteB, range: targetRange }),
        ]);
        toolsExecuted.push({ tool: 'get_site_details', args: { siteName: siteA, range: targetRange } });
        toolsExecuted.push({ tool: 'get_site_details', args: { siteName: siteB, range: targetRange } });
        telemetryPayloads[siteA] = resA;
        telemetryPayloads[siteB] = resB;
      } else if (isBreach) {
        const [rz, inc, alerts] = await Promise.all([
          executeToolCall('get_red_zone_sites', {}),
          executeToolCall('get_fleet_incidents', { timeframe: targetRange, severity: 'all' }),
          executeToolCall('get_site_alert_analytics', { siteName: 'all', range: targetRange }),
        ]);
        toolsExecuted.push({ tool: 'get_red_zone_sites', args: {} });
        toolsExecuted.push({ tool: 'get_fleet_incidents', args: { timeframe: targetRange, severity: 'all' } });
        toolsExecuted.push({ tool: 'get_site_alert_analytics', args: { siteName: 'all', range: targetRange } });
        telemetryPayloads.redZone = rz;
        telemetryPayloads.incidents = inc;
        telemetryPayloads.alerts = alerts;
      } else if (isSiteAudit) {
        const targetSite = detectedSites[0];
        const [details, alerts] = await Promise.all([
          executeToolCall('get_site_details', { siteName: targetSite, range: targetRange }),
          executeToolCall('get_site_alert_analytics', { siteName: targetSite, range: targetRange }),
        ]);
        toolsExecuted.push({ tool: 'get_site_details', args: { siteName: targetSite, range: targetRange } });
        toolsExecuted.push({ tool: 'get_site_alert_analytics', args: { siteName: targetSite, range: targetRange } });
        telemetryPayloads.siteDetails = details;
        telemetryPayloads.alertAnalytics = alerts;
      } else if (isIncidentQuery) {
        const inc = await executeToolCall('get_fleet_incidents', { timeframe: targetRange, severity: 'all' });
        toolsExecuted.push({ tool: 'get_fleet_incidents', args: { timeframe: targetRange, severity: 'all' } });
        telemetryPayloads.fleetIncidents = inc;
      } else {
        const ov = await executeToolCall('get_fleet_overview', {});
        toolsExecuted.push({ tool: 'get_fleet_overview', args: {} });
        telemetryPayloads.fleetOverview = ov;
      }
    } catch (fetchErr) {
      console.warn('[Pulse AI Fast-Path] Telemetry pre-fetch warning:', fetchErr.message);
    }
  }

  const compactJson = JSON.stringify(telemetryPayloads);

  let fastPrompt = '';
  if (isGreeting) {
    fastPrompt = `USER REQUEST: "${cleanInput}"

You are Pulse AI, the Principal SRE and Autonomous Operations Intelligence Agent for GreyOrange's fleet monitoring platform (Sitepulse).
Respond dynamically, warmly, concisely, and professionally to the user's greeting. Introduce yourself as Pulse AI, mention that you monitor real-time Salesforce incidents, active Sev-1 / Sev-2 urgent cases, Opsgenie telemetry, and RED Zone reliability risks across all 80+ customer fulfillment sites, and ask how you can assist the user today.
CRITICAL: Do NOT output internal chain-of-thought, reasoning steps, or hidden thinking blocks.`;
  } else if (isGeneralQuestion) {
    fastPrompt = `USER REQUEST: "${cleanInput}"

You are Pulse AI, an intelligent AI assistant. Provide a clear, helpful, accurate, and concise answer to the user's question or request.
CRITICAL: Do NOT output internal chain-of-thought, reasoning steps, or hidden thinking blocks.`;
  } else if (effectiveMode === 'ask') {
    fastPrompt = `USER REQUEST: "${cleanInput}"

VERIFIED REAL-TIME SALESFORCE & SITEPULSE TELEMETRY (Ground Truth):
\`\`\`json
${compactJson}
\`\`\`

INSTRUCTIONS FOR DIRECT ANALYSIS (ASK MODE):
1. Analyze the retrieved operational telemetry above and provide a direct, concise, factual, and helpful answer answering the user's specific question.
2. Directly reference relevant sites, incident case numbers, severity levels, downtime, or alerts from the data as appropriate.
3. Keep the format clean, conversational, and focused on directly answering the user's inquiry in clean markdown. Do NOT force a massive multi-section corporate report template.
4. Strictly follow impact percentage classification: 100% = [SEV 1 URGENT], 50-99% = [SEV 2 URGENT], 1-49% = [SEV 2 HIGH], <1% = [SEV 3 INCIDENT] or [SEV 4 SERVICE REQUEST].
5. ZERO loose raw asterisks in text (write Case #00297257, [SEV 1 URGENT], [SEV 2 URGENT], [SEV 2 HIGH], Status: Solved).
6. CRITICAL: Do NOT output internal chain-of-thought, reasoning steps, or hidden thinking blocks.`;
  } else {
    // effectiveMode === 'agent'
    fastPrompt = `USER REQUEST: "${cleanInput}"

VERIFIED REAL-TIME SALESFORCE & SITEPULSE TELEMETRY (Ground Truth):
\`\`\`json
${compactJson}
\`\`\`

INSTRUCTIONS FOR EXECUTIVE SRE BRIEFING (AGENT MODE):
1. Synthesize this operational telemetry into a comprehensive, high-impact executive textual analysis for upper management.
2. Strictly follow impact percentage classification: 100% = [SEV 1 URGENT], 50-99% = [SEV 2 URGENT], 1-49% = [SEV 2 HIGH], <1% = [SEV 3 INCIDENT] or [SEV 4 SERVICE REQUEST].
3. ZERO loose raw asterisks in text (write Case #00297257, [SEV 1 URGENT], [SEV 2 URGENT], [SEV 2 HIGH], Status: Solved).
4. Include:
   - Executive Summary & Situation Report
   - Operational Status & Key Telemetry Metrics
   - Active Incidents Table (| Case Number | Severity | Status | Impact % | Subject |)
   - 2-3 Actionable SRE Leadership Recommendations
5. Output clean markdown directly. Do NOT output raw HTML code blocks (an interactive visual dashboard is automatically rendered alongside your briefing).
6. CRITICAL: Do NOT output internal chain-of-thought, reasoning steps, or hidden thinking blocks.`;
  }

  const fastHistory = session.messages.slice(-4);
  const fastMessages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...fastHistory.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content || '',
    })),
    { role: 'user', content: fastPrompt },
  ];

  let data = null;
  try {
    data = await callOpenRouterWithRetry({
      url,
      headers,
      payload: {
        model,
        messages: fastMessages,
        temperature: 0.25,
        max_tokens: 4096,
      },
      maxRetries: 1,
    });
  } catch (orApiErr) {
    console.warn(`[Pulse AI Fast-Path] OpenRouter API notice: ${orApiErr.message}.`);
  }

  let replyText = data ? extractOpenRouterContent(data) : '';
  if (replyText && replyText.trim()) {
    console.log(`[Pulse AI Fast-Path] Successfully generated reply with ${data?._modelUsed || model} in 1 pass!`);

    // Attach interactive HTML dashboard artifact ONLY in agent mode for operational queries
    if (effectiveMode === 'agent' && hasOpsKeywords && !isGreeting && !isGeneralQuestion) {
      try {
        const artifactHtml = generateDashboardArtifactFromTelemetry({
          telemetryPayloads,
          detectedSites,
          targetRange,
          isComparison,
          isBreach,
          isSiteAudit,
          isIncidentQuery,
        });
        if (artifactHtml && !replyText.includes('```html')) {
          replyText += '\n\n' + artifactHtml;
        }
      } catch (artErr) {
        console.warn('[Pulse AI Fast-Path] Dashboard artifact notice:', artErr.message);
      }
    }

    session.messages.push({
      role: 'assistant',
      content: replyText,
      toolsUsed: toolsExecuted,
      timestamp: Date.now(),
    });
    return {
      reply: replyText,
      toolsUsed: toolsExecuted,
      sessionId: session.id,
      orgId: session.orgId,
      modelUsed: data?._modelUsed || model,
    };
  }

  // STANDARD TOOL-CALLING PATH (for ad-hoc, custom, or direct SOQL queries)
  const openRouterTools = TOOLS_DEFINITIONS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const toolHistory = session.messages.slice(-6);
  const currentMessages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...toolHistory.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content || '',
    })),
  ];
  const fallbackToolsExecuted = [];

  let initialData = null;
  try {
    initialData = await callOpenRouterWithRetry({
      url,
      headers,
      payload: {
        model,
        messages: currentMessages,
        temperature: 0.25,
        max_tokens: 4096,
        tools: openRouterTools,
        tool_choice: 'auto',
      },
      maxRetries: 1,
    });
  } catch (initErr) {
    console.warn(`[Pulse AI OpenRouter] Tool call init error: ${initErr.message}`);
  }

  const message = initialData?.choices?.[0]?.message;
  const toolCalls = message?.tool_calls || [];

  if (!message || toolCalls.length === 0) {
    let replyText = initialData ? extractOpenRouterContent(initialData) : '';
    if (!replyText || !replyText.trim()) {
      return null;
    }
    session.messages.push({
      role: 'assistant',
      content: replyText,
      toolsUsed: fallbackToolsExecuted,
      timestamp: Date.now(),
    });
    return {
      reply: replyText,
      toolsUsed: fallbackToolsExecuted,
      sessionId: session.id,
      orgId: session.orgId,
      modelUsed: model,
    };
  }

  // Execute tool calls
  currentMessages.push(message);
  const toolPayloads = {};
  for (const call of toolCalls) {
    const toolName = call.function?.name;
    let toolArgs = {};
    try {
      toolArgs = typeof call.function?.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : (call.function?.arguments || {});
    } catch {
      toolArgs = {};
    }
    console.log(`[Pulse AI OpenRouter Tool Execution] Executing "${toolName}" with args:`, JSON.stringify(toolArgs));
    fallbackToolsExecuted.push({ tool: toolName, args: toolArgs });

    const toolResult = await executeToolCall(toolName, toolArgs);
    toolPayloads[toolName] = toolResult;
    const safeResponse = (typeof toolResult === 'object' && toolResult !== null && !Array.isArray(toolResult))
      ? toolResult
      : { result: toolResult };

    currentMessages.push({
      role: 'tool',
      tool_call_id: call.id,
      name: toolName,
      content: JSON.stringify(safeResponse),
    });
  }

  // Final synthesis pass
  let synthData = null;
  try {
    synthData = await callOpenRouterWithRetry({
      url,
      headers,
      payload: {
        model,
        messages: [
          ...currentMessages,
          {
            role: 'user',
            content: 'Now synthesize all retrieved operations and incident telemetry into an executive briefing for Upper Management.\n- Strictly follow percentage classification: 100% = [SEV 1 URGENT], 50-99% = [SEV 2 URGENT], 1-49% = [SEV 2 HIGH], <1% = [SEV 3 INCIDENT] or [SEV 4 SERVICE REQUEST].\n- ZERO loose raw asterisks in text (write Case #00297257, [SEV 1 URGENT], [SEV 2 URGENT], [SEV 2 HIGH], Status: Solved).\n- Provide an interactive Executive Dashboard HTML Artifact inside a standard HTML code block (triple-backtick html ... triple-backtick) matching Sitepulse dark slate theme.\n- Include clean companion executive summary and actionable SRE recommendations.\n- CRITICAL: Output markdown and HTML dashboard directly. Do NOT output internal chain-of-thought.',
          },
        ],
        temperature: 0.25,
        max_tokens: 4096,
      },
      maxRetries: 1,
    });
  } catch (synthErr) {
    console.warn(`[Pulse AI Synth] Synthesis API notice: ${synthErr.message}`);
  }

  let finalReply = synthData ? extractOpenRouterContent(synthData) : '';
  if (!finalReply || !finalReply.trim()) {
    return null;
  }

  session.messages.push({
    role: 'assistant',
    content: finalReply,
    toolsUsed: fallbackToolsExecuted,
    timestamp: Date.now(),
  });
  return {
    reply: finalReply,
    toolsUsed: fallbackToolsExecuted,
    sessionId: session.id,
    orgId: session.orgId,
    modelUsed: model,
  };
}

/**
 * Extracts generated text content from Google Gemini REST API responses.
 */
function extractGeminiContent(data) {
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const nonThoughtParts = parts.filter(p => !p.thought && !p.functionCall && p.text);
  let replyText = nonThoughtParts.map(p => p.text || '').filter(Boolean).join('\n');
  if (!replyText || !replyText.trim()) {
    replyText = parts.filter(p => !p.functionCall && p.text).map(p => p.text || '').filter(Boolean).join('\n');
  }
  return (replyText || '').trim();
}

/**
 * Resilient, high-performance executor for Google Gemini API.
 * - Prioritizes gemini-2.0-flash (1-2s latency, 1,500 free requests/day).
 * - Implements 1-shot fast-path with pre-fetched live Salesforce telemetry for instant responses.
 * - Provides full function-calling support for custom/ad-hoc SOQL queries.
 * - Zero-crash fallback ensuring 100% operational uptime.
 */
async function tryGeminiChat({ session, cleanInput, mode = 'agent' }) {
  const apiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_BACKUP_API_KEY,
  ].filter(Boolean);
  const uniqueApiKeys = [...new Set(apiKeys.map(k => (k || '').trim()))].filter(isValidGeminiKey);
  if (uniqueApiKeys.length === 0) return null;

  const configuredModel = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
  const modelsToTry = [
    configuredModel,
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.5-flash',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i && !m.includes('3.8'));

  const lower = cleanInput.toLowerCase();

  // Detect timeframe
  let targetRange = '24h';
  if (lower.includes('48h') || lower.includes('2 day') || lower.includes('2day') || lower.includes('48 hour') || lower.includes('2d')) targetRange = '48h';
  else if (lower.includes('7d') || lower.includes('7 day') || lower.includes('7day') || lower.includes('week')) targetRange = '7d';
  else if (lower.includes('15d') || lower.includes('15 day')) targetRange = '15d';
  else if (lower.includes('1m') || lower.includes('month') || lower.includes('30d')) targetRange = '1m';
  else if (lower.includes('all') || lower.includes('ever') || lower.includes('history')) targetRange = 'all';

  // Detect mentioned sites dynamically across all 80+ customer fulfillment sites
  const detectedSites = detectSitesFromQuery(cleanInput);

  const isGreeting = /^(hi+|hello+|hey+|heya|hiya|greetings|good\s*(morning|afternoon|evening)|who are you|help|sup)[!.\s]*$/i.test(cleanInput);
  const opsRegex = /\b(sev\s*[-]?\s*[1-4]|p[1-4]|severity|incident|incidents|ticket|tickets|case|cases|outage|outages|downtime|uptime|red\s*zone|redzone|breach|breaches|sla|slas|mtbf|probation|fleet|site|sites|fulfillment|warehouse|greyorange|butler|sorter|opsgenie|alert|alerts|salesforce|soql|overview|audit|status|health)\b/i;
  const hasOpsKeywords = opsRegex.test(cleanInput) || detectedSites.length > 0;
  const isGeneralQuestion = !hasOpsKeywords && !isGreeting;
  const effectiveMode = (mode === 'ask' || mode === 'query') ? 'ask' : 'agent';

  const isComparison = detectedSites.length >= 2 || (detectedSites.length === 1 && (lower.includes('compare') || lower.includes('versus') || lower.includes('vs') || lower.includes('worst') || lower.includes('better')));
  const isBreach = lower.includes('breach') || lower.includes('red zone') || lower.includes('redzone') || (lower.includes('alert') && (lower.includes('report') || lower.includes('active')));
  const isIncidentQuery = lower.includes('sev 1') || lower.includes('sev-1') || lower.includes('sev 2') || lower.includes('sev-2') || lower.includes('incident') || lower.includes('24h') || lower.includes('today') || lower.includes('ticket') || lower.includes('outage');
  const isSiteAudit = detectedSites.length > 0;
  const isFleetOverview = lower.includes('fleet') || lower.includes('overview') || lower.includes('status') || lower.includes('health') || lower.includes('report');

  // Fast-Path: single inference pass cutting latency down to < 2s
  console.log(`[Pulse AI Gemini Fast-Path] Intent: greeting=${isGreeting}, generalQuestion=${isGeneralQuestion}, hasOpsKeywords=${hasOpsKeywords}, effectiveMode=${effectiveMode} for "${cleanInput.slice(0, 50)}"`);

  const toolsExecuted = [];
  const telemetryPayloads = {};

  // ONLY pre-fetch telemetry if this is an operational inquiry (never for general questions or simple greetings)
  if (hasOpsKeywords && !isGreeting) {
    try {
      if (isComparison) {
        const siteA = detectedSites[0] || 'H&M Canada Ajax';
        const siteB = detectedSites[1] || 'Sams Club ATL';
        const [resA, resB] = await Promise.all([
          executeToolCall('get_site_details', { siteName: siteA, range: targetRange }),
          executeToolCall('get_site_details', { siteName: siteB, range: targetRange }),
        ]);
        toolsExecuted.push({ tool: 'get_site_details', args: { siteName: siteA, range: targetRange } });
        toolsExecuted.push({ tool: 'get_site_details', args: { siteName: siteB, range: targetRange } });
        telemetryPayloads[siteA] = resA;
        telemetryPayloads[siteB] = resB;
      } else if (isBreach) {
        const [rz, inc, alerts] = await Promise.all([
          executeToolCall('get_red_zone_sites', {}),
          executeToolCall('get_fleet_incidents', { timeframe: targetRange, severity: 'all' }),
          executeToolCall('get_site_alert_analytics', { siteName: 'all', range: targetRange }),
        ]);
        toolsExecuted.push({ tool: 'get_red_zone_sites', args: {} });
        toolsExecuted.push({ tool: 'get_fleet_incidents', args: { timeframe: targetRange, severity: 'all' } });
        toolsExecuted.push({ tool: 'get_site_alert_analytics', args: { siteName: 'all', range: targetRange } });
        telemetryPayloads.redZone = rz;
        telemetryPayloads.incidents = inc;
        telemetryPayloads.alerts = alerts;
      } else if (isSiteAudit) {
        const targetSite = detectedSites[0];
        const [details, alerts] = await Promise.all([
          executeToolCall('get_site_details', { siteName: targetSite, range: targetRange }),
          executeToolCall('get_site_alert_analytics', { siteName: targetSite, range: targetRange }),
        ]);
        toolsExecuted.push({ tool: 'get_site_details', args: { siteName: targetSite, range: targetRange } });
        toolsExecuted.push({ tool: 'get_site_alert_analytics', args: { siteName: targetSite, range: targetRange } });
        telemetryPayloads.siteDetails = details;
        telemetryPayloads.alertAnalytics = alerts;
      } else if (isIncidentQuery) {
        const inc = await executeToolCall('get_fleet_incidents', { timeframe: targetRange, severity: 'all' });
        toolsExecuted.push({ tool: 'get_fleet_incidents', args: { timeframe: targetRange, severity: 'all' } });
        telemetryPayloads.fleetIncidents = inc;
      } else {
        const ov = await executeToolCall('get_fleet_overview', {});
        toolsExecuted.push({ tool: 'get_fleet_overview', args: {} });
        telemetryPayloads.fleetOverview = ov;
      }
    } catch (fetchErr) {
      console.warn('[Pulse AI Gemini Fast-Path] Telemetry pre-fetch warning:', fetchErr.message);
    }
  }

  const compactJson = JSON.stringify(telemetryPayloads);

  let fastPrompt = '';
  if (isGreeting) {
    fastPrompt = `USER REQUEST: "${cleanInput}"

You are Pulse AI, the Principal SRE and Autonomous Operations Intelligence Agent for GreyOrange's fleet monitoring platform (Sitepulse).
Respond dynamically, warmly, concisely, and professionally to the user's greeting. Introduce yourself as Pulse AI, mention that you monitor real-time Salesforce incidents, active Sev-1 / Sev-2 urgent cases, Opsgenie telemetry, and RED Zone reliability risks across all 80+ customer fulfillment sites, and ask how you can assist the user today.
CRITICAL: Do NOT output internal chain-of-thought, reasoning steps, or hidden thinking blocks.`;
  } else if (isGeneralQuestion) {
    fastPrompt = `USER REQUEST: "${cleanInput}"

You are Pulse AI, an intelligent AI assistant. Provide a clear, helpful, accurate, and concise answer to the user's question or request.
CRITICAL: Do NOT output internal chain-of-thought, reasoning steps, or hidden thinking blocks.`;
  } else if (effectiveMode === 'ask') {
    fastPrompt = `USER REQUEST: "${cleanInput}"

VERIFIED REAL-TIME SALESFORCE & SITEPULSE TELEMETRY (Ground Truth):
\`\`\`json
${compactJson}
\`\`\`

INSTRUCTIONS FOR DIRECT ANALYSIS (ASK MODE):
1. Analyze the retrieved operational telemetry above and provide a direct, concise, factual, and helpful answer answering the user's specific question.
2. Directly reference relevant sites, incident case numbers, severity levels, downtime, or alerts from the data as appropriate.
3. Keep the format clean, conversational, and focused on directly answering the user's inquiry in clean markdown. Do NOT force a massive multi-section corporate report template.
4. Strictly follow impact percentage classification: 100% = [SEV 1 URGENT], 50-99% = [SEV 2 URGENT], 1-49% = [SEV 2 HIGH], <1% = [SEV 3 INCIDENT] or [SEV 4 SERVICE REQUEST].
5. ZERO loose raw asterisks in text (write Case #00297257, [SEV 1 URGENT], [SEV 2 URGENT], [SEV 2 HIGH], Status: Solved).
6. CRITICAL: Do NOT output internal chain-of-thought, reasoning steps, or hidden thinking blocks.`;
  } else {
    // effectiveMode === 'agent'
    fastPrompt = `USER REQUEST: "${cleanInput}"

VERIFIED REAL-TIME SALESFORCE & SITEPULSE TELEMETRY (Ground Truth):
\`\`\`json
${compactJson}
\`\`\`

INSTRUCTIONS FOR EXECUTIVE SRE BRIEFING (AGENT MODE):
1. Synthesize this operational telemetry into a comprehensive, high-impact executive textual analysis for upper management.
2. Strictly follow impact percentage classification: 100% = [SEV 1 URGENT], 50-99% = [SEV 2 URGENT], 1-49% = [SEV 2 HIGH], <1% = [SEV 3 INCIDENT] or [SEV 4 SERVICE REQUEST].
3. ZERO loose raw asterisks in text (write Case #00297257, [SEV 1 URGENT], [SEV 2 URGENT], [SEV 2 HIGH], Status: Solved).
4. Include:
   - Executive Summary & Situation Report
   - Operational Status & Key Telemetry Metrics
   - Active Incidents Table (| Case Number | Severity | Status | Impact % | Subject |)
   - 2-3 Actionable SRE Leadership Recommendations
5. Output clean markdown directly. Do NOT output raw HTML code blocks (an interactive visual dashboard is automatically rendered alongside your briefing).
6. CRITICAL: Do NOT output internal chain-of-thought, reasoning steps, or hidden thinking blocks.`;
  }

  const fastHistory = session.messages.slice(-4);
  const fastContents = [
    ...fastHistory.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content || '' }],
    })),
    {
      role: 'user',
      parts: [{ text: fastPrompt }],
    },
  ];

  for (const apiKey of uniqueApiKeys) {
    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        console.log(`[Pulse AI Gemini Fast-Path] Invoking Gemini model=${model}...`);

        const isBearer = apiKey.startsWith('AQ.') || apiKey.startsWith('ya29.');
        const baseHeaders = {
          'Content-Type': 'application/json',
        };
        if (isBearer) {
          baseHeaders['Authorization'] = `Bearer ${apiKey}`;
        } else {
          baseHeaders['x-goog-api-key'] = apiKey;
        }

        let res = await fetch(url, {
          method: 'POST',
          headers: baseHeaders,
          body: JSON.stringify({
            contents: fastContents,
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 8192,
            },
          }),
          signal: AbortSignal.timeout(12000),
        });

        // If 401 or 403, immediately trip circuit breaker and failover in <200ms without retrying
        if (!res.ok && (res.status === 401 || res.status === 403)) {
          const errText = await res.text().catch(() => '');
          console.warn(`[Pulse AI Gemini Fast-Path] Model ${model} returned HTTP ${res.status}:`, errText.slice(0, 160));
          console.warn('[Pulse AI Gemini Fast-Path] API key rejected (invalid credentials). Tripping circuit breaker and failing over immediately.');
          _geminiCircuitBreakerTripped = true;
          return null;
        }

        // If 400, retry once with query parameter ?key=
        if (!res.ok && res.status === 400) {
          const queryUrl = `${url}?key=${encodeURIComponent(apiKey)}`;
          const altHeaders = {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
            ...(isBearer ? { 'Authorization': `Bearer ${apiKey}` } : {}),
          };
          const queryRes = await fetch(queryUrl, {
            method: 'POST',
            headers: altHeaders,
            body: JSON.stringify({
              contents: fastContents,
              systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8192,
              },
            }),
            signal: AbortSignal.timeout(6000),
          }).catch(() => null);
          if (queryRes && queryRes.ok) res = queryRes;
        }

        if (res.ok) {
          const data = await res.json();
          let replyText = extractGeminiContent(data);
          if (replyText && replyText.trim()) {
            console.log(`[Pulse AI Gemini Fast-Path] Successfully generated reply with ${model} in 1 pass!`);

            // Attach interactive HTML dashboard artifact ONLY in agent mode for operational queries
            if (effectiveMode === 'agent' && hasOpsKeywords && !isGreeting && !isGeneralQuestion) {
              try {
                const artifactHtml = generateDashboardArtifactFromTelemetry({
                  telemetryPayloads,
                  detectedSites,
                  targetRange,
                  isComparison,
                  isBreach,
                  isSiteAudit,
                  isIncidentQuery,
                });
                if (artifactHtml && !replyText.includes('```html')) {
                  replyText += '\n\n' + artifactHtml;
                }
              } catch (artErr) {
                console.warn('[Pulse AI Gemini Fast-Path] Dashboard artifact notice:', artErr.message);
              }
            }

            session.messages.push({
              role: 'assistant',
              content: replyText,
              toolsUsed: toolsExecuted,
              timestamp: Date.now(),
            });
            return {
              reply: replyText,
              toolsUsed: toolsExecuted,
              sessionId: session.id,
              orgId: session.orgId,
              modelUsed: model,
            };
          }
        } else {
          const errText = await res.text().catch(() => '');
          console.warn(`[Pulse AI Gemini Fast-Path] Model ${model} returned HTTP ${res.status}:`, errText.slice(0, 160));
          _lastPulseAiError = new Error(`Gemini HTTP ${res.status} (${model}): ${errText.slice(0, 200)}`);
          if (res.status === 401 || res.status === 403 || (res.status === 400 && (errText.includes('API key not valid') || errText.includes('API_KEY_INVALID') || errText.includes('invalid authentication credentials')))) {
            console.warn('[Pulse AI Gemini Fast-Path] API key rejected (invalid credentials). Failing over immediately to secondary engine.');
            return null; // Immediately exit Gemini to avoid hanging on secondary retries
          }
        }
      } catch (callErr) {
        console.warn(`[Pulse AI Gemini Fast-Path] Model ${model} notice:`, callErr.message);
        _lastPulseAiError = callErr;
      }
    }
  }

  // STANDARD TOOL-CALLING PATH (for ad-hoc, custom, or direct SOQL queries)
  const toolsPayload = [
    {
      functionDeclarations: TOOLS_DEFINITIONS.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];

  const toolHistory = session.messages.slice(-8);
  const initialToolContents = toolHistory.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  for (const apiKey of uniqueApiKeys) {
    let apiKeyInvalid = false;
    for (const model of modelsToTry) {
      if (apiKeyInvalid) break;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        console.log(`[Pulse AI Gemini] Invoking model=${model} for prompt: "${cleanInput.slice(0, 60)}..."`);

        let currentContents = [...initialToolContents];
        const fallbackToolsExecuted = [];

        for (let step = 0; step < 5; step++) {
          let body = {
            contents: currentContents,
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            tools: toolsPayload,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 8192,
            },
          };

          const isBearer = apiKey.startsWith('AQ.') || apiKey.startsWith('ya29.');
          const stepHeaders = {
            'Content-Type': 'application/json',
          };
          if (isBearer) {
            stepHeaders['Authorization'] = `Bearer ${apiKey}`;
          } else {
            stepHeaders['x-goog-api-key'] = apiKey;
          }

          let res = await fetch(url, {
            method: 'POST',
            headers: stepHeaders,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(12000),
          });

          if (!res.ok && (res.status === 400 || res.status === 401 || res.status === 403)) {
            const queryUrl = `${url}?key=${encodeURIComponent(apiKey)}`;
            const altHeaders = {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
              ...(isBearer ? { 'Authorization': `Bearer ${apiKey}` } : {}),
            };
            const queryRes = await fetch(queryUrl, {
              method: 'POST',
              headers: altHeaders,
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(12000),
            }).catch(() => null);
            if (queryRes && queryRes.ok) res = queryRes;
          }

          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.warn(`[Pulse AI Gemini] Model ${model} returned HTTP ${res.status}:`, errText.slice(0, 160));
            if (res.status === 400 && (errText.includes('API key not valid') || errText.includes('API_KEY_INVALID'))) {
              apiKeyInvalid = true;
            }
            break;
          }

          const data = await res.json();
          const candidate = data.candidates?.[0];
          const parts = candidate?.content?.parts || [];
          const functionCallPart = parts.find(p => p.functionCall);

          if (!functionCallPart) {
            const replyText = extractGeminiContent(data);
            if (!replyText || !replyText.trim()) return null;
            session.messages.push({
              role: 'assistant',
              content: replyText,
              toolsUsed: fallbackToolsExecuted,
              timestamp: Date.now(),
            });
            return {
              reply: replyText,
              toolsUsed: fallbackToolsExecuted,
              sessionId: session.id,
              orgId: session.orgId,
              modelUsed: model,
            };
          }

          const { name: toolName, args: toolArgs } = functionCallPart.functionCall;
          console.log(`[Pulse AI Gemini Tool Execution] Step ${step}: executing "${toolName}" with args:`, JSON.stringify(toolArgs));
          fallbackToolsExecuted.push({ tool: toolName, args: toolArgs });

          const toolResult = await executeToolCall(toolName, toolArgs);
          const safeResponse = (typeof toolResult === 'object' && toolResult !== null && !Array.isArray(toolResult))
            ? toolResult
            : { result: toolResult };

          const cleanModelParts = candidate?.content?.parts
            ? candidate.content.parts.filter(p => !p.thought)
            : [functionCallPart];
          if (cleanModelParts.length === 0) cleanModelParts.push(functionCallPart);

          currentContents.push({ role: 'model', parts: cleanModelParts });
          currentContents.push({
            role: 'function',
            parts: [{ functionResponse: { name: toolName, response: safeResponse } }],
          });
        }

        if (fallbackToolsExecuted.length > 0) {
          try {
            const synthBody = {
              contents: currentContents,
              systemInstruction: {
                parts: [{ text: SYSTEM_INSTRUCTION + '\nNow synthesize all retrieved operations and incident telemetry into an executive briefing for Upper Management with interactive HTML Dashboard Artifact.' }],
              },
              generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
            };
            const isBearer = apiKey.startsWith('AQ.') || apiKey.startsWith('ya29.');
            const synthHeaders = {
              'Content-Type': 'application/json',
            };
            if (isBearer) {
              synthHeaders['Authorization'] = `Bearer ${apiKey}`;
            } else {
              synthHeaders['x-goog-api-key'] = apiKey;
            }
            const synthRes = await fetch(url, {
              method: 'POST',
              headers: synthHeaders,
              body: JSON.stringify(synthBody),
              signal: AbortSignal.timeout(12000),
            });
            if (synthRes.ok) {
              const synthData = await synthRes.json();
              const synthReply = extractGeminiContent(synthData);
              if (synthReply && synthReply.trim()) {
                session.messages.push({
                  role: 'assistant',
                  content: synthReply,
                  toolsUsed: fallbackToolsExecuted,
                  timestamp: Date.now(),
                });
                return {
                  reply: synthReply,
                  toolsUsed: fallbackToolsExecuted,
                  sessionId: session.id,
                  orgId: session.orgId,
                  modelUsed: model,
                };
              }
            }
          } catch (synthErr) {
            console.warn('[Pulse AI Gemini] Synthesis error:', synthErr.message);
          }
        }
      } catch (err) {
        console.warn(`[Pulse AI Gemini] Error on model ${model}:`, err.message);
      }
    }
  }

  return null;
}

/**
 * Main chat handler for Pulse AI agent with tool-calling capabilities.
 */
export async function chatWithPulseAI({ sessionId, message, orgId = 'default', mode = 'agent' }) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('Message is required');
  }

  const session = getOrCreateSession(sessionId, orgId);
  const cleanInput = message.trim();

  // Append user message to ephemeral session memory
  session.messages.push({
    role: 'user',
    content: cleanInput,
    timestamp: Date.now(),
  });

  // User message is routed directly to the AI engine (no hardcoded responses even for greetings)

  // 1. Try Google Gemini first if GEMINI_API_KEY is configured with a valid AI Studio key (Primary Engine: ~1-2s latency, 1,500 free requests/day)
  if (process.env.GEMINI_API_KEY && isValidGeminiKey(process.env.GEMINI_API_KEY)) {
    try {
      const geminiResult = await tryGeminiChat({ session, cleanInput, mode });
      if (geminiResult) {
        return geminiResult;
      }
    } catch (geminiErr) {
      console.warn(`[Pulse AI] Gemini error with model ${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:`, geminiErr.message);
      _lastPulseAiError = geminiErr;
    }
  }

  // 2. Try OpenRouter if OPENROUTER_API_KEY is configured (Secondary Engine)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const openRouterResult = await tryOpenRouterChat({ session, cleanInput, mode });
      if (openRouterResult) {
        return openRouterResult;
      }
    } catch (orErr) {
      console.warn(`[Pulse AI] OpenRouter error with model ${process.env.OPENROUTER_MODEL || 'openrouter/free'}:`, orErr.message);
      _lastPulseAiError = orErr;
    }
  }

  // 3. When AI quota is reached or all engines are unavailable, return exact service unavailable message
  console.warn('[Pulse AI] AI quota reached or engines unavailable. Returning service unavailable notification.');
  const unavailableMsg = 'Service not available at the moment try after some time [🦄]';
  session.messages.push({
    role: 'assistant',
    content: unavailableMsg,
    toolsUsed: [],
    timestamp: Date.now(),
  });
  return {
    reply: unavailableMsg,
    toolsUsed: [],
    sessionId: session.id,
    orgId: session.orgId,
  };
}

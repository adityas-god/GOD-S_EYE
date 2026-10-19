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
} from './salesforce.service.js';
import { getCasesAnalytics } from './analytics.service.js';
import { defaultSites } from '../data/defaultSites.js';

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

export function getLastPulseAiStatus() {
  const key = process.env.GEMINI_API_KEY || '';
  return {
    apiKeyConfigured: Boolean(key && key.trim().length > 0),
    apiKeyMasked: key && key.trim().length > 0 ? `${key.trim().slice(0, 6)}...${key.trim().slice(-4)}` : 'NOT_SET',
    preferredModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
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
    description: 'Executes a direct, safe read-only SELECT query against Salesforce Cases. Valid fields on Case: Id, CaseNumber, Subject, Status, Highest_Severity__c, Account_Name__c, Snow_Sitename__c, CreatedDate, ClosedDate, Description, Owner.Name. For Sev 1 use: Highest_Severity__c IN (\'1 - Urgent\', \'Sev 1\'). For Sev 2 use: Highest_Severity__c IN (\'2 - High\', \'Sev 2\'). For last 24h use: (CreatedDate = LAST_N_DAYS:1 OR CreatedDate = TODAY).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The SOQL SELECT query. E.g., "SELECT Id, CaseNumber, Subject, Status, Highest_Severity__c, Account_Name__c, Snow_Sitename__c, CreatedDate FROM Case WHERE Highest_Severity__c IN (\'1 - Urgent\', \'Sev 1\') AND (CreatedDate = LAST_N_DAYS:1 OR CreatedDate = TODAY) ORDER BY CreatedDate DESC LIMIT 50"',
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
        const analytics = await getCasesAnalytics({ timeframe: tf, forceRefresh: false });
        let incidents = analytics.incidents || [];

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
          incidents = incidents.filter(i => String(i.siteName || '').toLowerCase().includes(targetSite));
        }

        // Also fetch currently active open cases from fetchAllLiveCasesAndAlerts
        const { cases: liveOpenCases = [] } = await fetchAllLiveCasesAndAlerts(false);
        const activeSev1 = liveOpenCases.filter(c => detectSeverity(c) === 'sev1');
        const activeSev2Urgent = liveOpenCases.filter(c => detectSeverity(c) === 'sev2_urgent');
        const activeSev2High = liveOpenCases.filter(c => detectSeverity(c) === 'sev2_high');
        const activeSev3 = liveOpenCases.filter(c => detectSeverity(c) === 'sev3');
        const activeSev4 = liveOpenCases.filter(c => detectSeverity(c) === 'sev4');

        console.log(`[Pulse AI Incidents] Found ${incidents.length} timeframe incidents, ${activeSev1.length} active Sev1, ${activeSev2Urgent.length} active Sev2 Urgent, ${activeSev2High.length} active Sev2 High`);

        const formatSevBadge = (detailedSev) => {
          if (detailedSev === 'sev1') return '[SEV 1 URGENT]';
          if (detailedSev === 'sev2_urgent') return '[SEV 2 URGENT]';
          if (detailedSev === 'sev2_high') return '[SEV 2 HIGH]';
          if (detailedSev === 'sev4') return '[SEV 4 SERVICE REQUEST]';
          return '[SEV 3 INCIDENT]';
        };

        return {
          queryTimeframe: tf,
          totalIncidentsFound: incidents.length,
          severityBreakdown: analytics.severityBreakdown || {},
          activeFleetOpenSev1Count: activeSev1.length,
          activeFleetOpenSev2UrgentCount: activeSev2Urgent.length,
          activeFleetOpenSev2HighCount: activeSev2High.length,
          activeFleetOpenSev3Count: activeSev3.length,
          activeFleetOpenSev4Count: activeSev4.length,
          activeFleetOpenSev1Cases: activeSev1.slice(0, 15).map(c => ({
            caseNumber: c.CaseNumber || c.case_number,
            subject: c.Subject,
            siteName: c.Snow_Sitename__c || c.Account_Name__c || 'Fleet',
            severity: '[SEV 1 URGENT]',
            impactPercentage: c.Impact_Percentage__c || getImpactPercentage(c) || 100,
            status: c.Status,
            createdDate: c.CreatedDate,
          })),
          activeFleetOpenSev2UrgentCases: activeSev2Urgent.slice(0, 15).map(c => ({
            caseNumber: c.CaseNumber || c.case_number,
            subject: c.Subject,
            siteName: c.Snow_Sitename__c || c.Account_Name__c || 'Fleet',
            severity: '[SEV 2 URGENT]',
            impactPercentage: c.Impact_Percentage__c || getImpactPercentage(c) || '50-99%',
            status: c.Status,
            createdDate: c.CreatedDate,
          })),
          activeFleetOpenSev2HighCases: activeSev2High.slice(0, 15).map(c => ({
            caseNumber: c.CaseNumber || c.case_number,
            subject: c.Subject,
            siteName: c.Snow_Sitename__c || c.Account_Name__c || 'Fleet',
            severity: '[SEV 2 HIGH]',
            impactPercentage: c.Impact_Percentage__c || getImpactPercentage(c) || '1-49%',
            status: c.Status,
            createdDate: c.CreatedDate,
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
        const overview = await fetchLiveCasesOverview();
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
        const res = await fetchOpenCasesForSite({ siteName, range, forceRefresh: false });
        
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
        const rz = await fetchRedZoneSitesOverview({ forceRefresh: false });
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
        const analytics = await getAlertAnalyticsForSite({ siteName, range, forceRefresh: false });
        return {
          siteName: analytics.siteName,
          timeframe: analytics.timeframe,
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

4. INTERACTIVE HTML DASHBOARD ARTIFACTS (CRITICAL):
   - Whenever asked to compare sites (e.g. H&M Canada vs Walmart Mexico), provide an alert/breach report, audit RED zone risks, or deliver a fleet briefing:
     YOU MUST GENERATE AN INTERACTIVE EXECUTIVE DASHBOARD ARTIFACT ENCLOSED IN A SINGLE HTML CODE BLOCK (triple-backtick html ... triple-backtick)!
   - The interactive HTML dashboard must match Sitepulse's dark slate (#11141b / #181d27) visual aesthetic:
     * Self-contained, responsive HTML with inline CSS and interactive JavaScript.
     * Top Executive Header: 'SITEPULSE EXECUTIVE BRIEFING', Site Badges, Real-time UTC Timestamp, Live Status Indicator.
     * KPI Stat Cards: 4 sleek cards with large metrics (Active Breaches, Active Sev 1 Urgent, Active Sev 2 Urgent, Fleet Reliability % or Uptime).
     * Side-by-Side Comparison Matrix or RED Zone Breach Matrix with visual progress bars.
     * Interactive Filter Tabs: Buttons for [All], [Sev 1 Urgent], [Sev 2 Urgent], [Sev 2 High], [Active], [Resolved] that instantly filter table rows via JavaScript!
     * Incident Breakdown Table: Dark zebra styling, hover row highlighting, glowing pill badges (Crimson for Sev 1 Urgent, Bright Orange for Sev 2 Urgent, Amber for Sev 2 High, Blue for Sev 3 Incident, Slate for Sev 4 Service Request, Green for Solved, Cyan for In-Progress), monospace case numbers.
     * Executive Takeaways & SRE Recommendations: 3-4 bulleted strategic insights and recommended engineering actions for C-suite leadership.
   - In addition to the HTML dashboard artifact, provide a crisp executive summary in clean text (without loose asterisks) either before or after the artifact.

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
   - When asked about fleet incidents or recent downtime:
     Call get_fleet_incidents with the requested timeframe ("today", "24h", "48h", "7d", "all").
   - When asked to execute a custom SOQL query:
     Call execute_salesforce_soql. Enforce strict read-only SELECT queries.
`;

/**
 * Main chat handler for Pulse AI agent with tool-calling capabilities.
 */
export async function chatWithPulseAI({ sessionId, message, orgId = 'default' }) {
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

  // Fast conversational greeting interceptor: provides zero-latency response for greetings
  if (/^(hi|hello|hey|heya|hiya|greetings|good\s*(morning|afternoon|evening)|who are you|help)[!.]*$/i.test(cleanInput)) {
    const welcomeReply = `Hello! I am **Pulse AI**, your Principal SRE & Autonomous Operations Intelligence Agent for GreyOrange's fleet monitoring platform (**Sitepulse**).\n\nI monitor real-time Salesforce incidents, active Sev-1 / Sev-2 urgent cases, Opsgenie telemetry, and RED Zone reliability risks across all 80+ customer fulfillment sites.\n\n### How can I assist you?\n- **Incident Intelligence**: "Show all Sev-1 cases in past 24 hours" or "List Sev-2 high cases for today"\n- **Site Deep Dive & Audit**: "Show status for H&M Ajax" or "Audit Walmart Mexico"\n- **Comparative Benchmarking**: "Compare H&M Canada vs Walmart Mexico"\n- **Direct Salesforce SOQL**: "Run SOQL: SELECT CaseNumber, Subject, Status FROM Case WHERE CreatedDate = TODAY"`;
    
    session.messages.push({
      role: 'assistant',
      content: welcomeReply,
      toolsUsed: [],
      timestamp: Date.now(),
    });
    return {
      reply: welcomeReply,
      toolsUsed: [],
      sessionId: session.id,
      orgId: session.orgId,
    };
  }

  const apiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_BACKUP_API_KEY,
  ].filter(Boolean);
  const uniqueApiKeys = [...new Set(apiKeys)];

  if (uniqueApiKeys.length === 0) {
    _lastPulseAiError = new Error('No GEMINI_API_KEY found in process.env. Please configure GEMINI_API_KEY in your .env file and restart the container.');
    console.warn('[Pulse AI]', _lastPulseAiError.message);
  }

  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
  ].filter(Boolean);
  let lastError = null;

  // Build conversation history for Gemini (last 10 messages for rich context)
  const recentHistory = session.messages.slice(-10);
  const contents = recentHistory.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const toolsPayload = [
    {
      functionDeclarations: TOOLS_DEFINITIONS.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];

  for (const apiKey of uniqueApiKeys) {
    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        console.log(`[Pulse AI] Invoking Gemini model=${model} for prompt: "${cleanInput.slice(0, 60)}..."`);

        let currentContents = [...contents];
        const toolsExecuted = [];

        // Multi-step tool execution loop (max 5 iterations)
        for (let step = 0; step < 5; step++) {
          const generationConfig = {
            temperature: 0.2,
            maxOutputTokens: 8192,
          };
          // For Gemini 3.8 / 2.5 Flash, disable thinking mode (thinkingBudget: 0)
          // This avoids thought signature errors and reduces response latency to zero
          if (model.includes('3.8') || model.includes('2.5') || model.includes('flash')) {
            generationConfig.thinkingConfig = {
              thinkingBudget: 0,
            };
          }

          let body = {
            contents: currentContents,
            systemInstruction: {
              parts: [{ text: SYSTEM_INSTRUCTION }],
            },
            tools: toolsPayload,
            generationConfig,
          };

          const requestHeaders = {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          };

          let res = await fetch(url, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(body),
          });

          // If 401 returned, retry with query parameter ?key=
          if (!res.ok && res.status === 401) {
            const queryUrl = `${url}?key=${encodeURIComponent(apiKey)}`;
            const queryRes = await fetch(queryUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (queryRes.ok) {
              res = queryRes;
            }
          }

          // If 400 returned, retry once without thinkingConfig or by toggling functionResponse role
          if (!res.ok && res.status === 400) {
            let retryBody = { ...body };
            let changed = false;
            if (retryBody.generationConfig?.thinkingConfig) {
              delete retryBody.generationConfig.thinkingConfig;
              changed = true;
            }
            if (retryBody.contents?.some(c => c.parts?.some(p => p.functionResponse))) {
              retryBody.contents = retryBody.contents.map(c => {
                if (c.parts?.some(p => p.functionResponse)) {
                  return { ...c, role: c.role === 'function' ? 'user' : 'function' };
                }
                return c;
              });
              changed = true;
            }
            if (changed) {
              res = await fetch(url, {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(retryBody),
              });
            }
          }

          if (!res.ok) {
            const errText = await res.text();
            console.warn(`[Pulse AI API Error] Model ${model} returned HTTP ${res.status}: ${errText.slice(0, 200)}`);
            throw new Error(`Gemini API returned ${res.status}: ${errText}`);
          }

          const data = await res.json();
          const candidate = data.candidates?.[0];
          const content = candidate?.content;
          const parts = content?.parts || [];

          // Check if the model wants to call function tools
          const functionCallPart = parts.find(p => p.functionCall);

          if (!functionCallPart) {
            // Model returned final text response (filter out internal reasoning thoughts)
            const nonThoughtParts = parts.filter(p => !p.thought && !p.functionCall);
            let replyText = nonThoughtParts.map(p => p.text || '').filter(Boolean).join('\n');
            if (!replyText) {
              replyText = parts.filter(p => !p.functionCall).map(p => p.text || '').filter(Boolean).join('\n') || 'I have analyzed the data.';
            }

            console.log(`[Pulse AI] Successfully generated response via model=${model} (tools executed: ${toolsExecuted.length})`);
            
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
            };
          }

          // Execute function call
          const { name: toolName, args: toolArgs } = functionCallPart.functionCall;
          console.log(`[Pulse AI Tool Execution] Step ${step}: executing tool "${toolName}" with args:`, JSON.stringify(toolArgs));
          toolsExecuted.push({ tool: toolName, args: toolArgs });

          const toolResult = await executeToolCall(toolName, toolArgs);
          const safeResponse = (typeof toolResult === 'object' && toolResult !== null && !Array.isArray(toolResult))
            ? toolResult
            : { result: toolResult };

          // 1. Preserve candidate.content without thought parts (prevents thought signature mismatch in REST)
          const cleanModelParts = candidate?.content?.parts
            ? candidate.content.parts.filter(p => !p.thought)
            : [functionCallPart];
          if (cleanModelParts.length === 0) cleanModelParts.push(functionCallPart);

          currentContents.push({
            role: 'model',
            parts: cleanModelParts,
          });

          // 2. Append tool response turn (use 'function' for standard REST)
          currentContents.push({
            role: 'function',
            parts: [
              {
                functionResponse: {
                  name: toolName,
                  response: safeResponse,
                },
              },
            ],
          });
        }

      // If loop completed with executed tools, call Gemini one last time WITHOUT tools
      // This forces the agent to synthesize all collected operational data into rich markdown
      if (toolsExecuted.length > 0) {
        try {
          const finalGenConfig = {
            temperature: 0.2,
            maxOutputTokens: 8192,
          };
          if (model.includes('3.8') || model.includes('2.5') || model.includes('flash')) {
            finalGenConfig.thinkingConfig = { thinkingBudget: 0 };
          }
          let finalBody = {
            contents: currentContents,
            systemInstruction: {
              parts: [{ text: SYSTEM_INSTRUCTION + '\nNow synthesize all retrieved operations and incident telemetry into an executive briefing for the CEO and Upper Management.\n- Strictly follow percentage classification: 100% = [SEV 1 URGENT], 99-50% = [SEV 2 URGENT], 49-1% = [SEV 2 HIGH], <1% = [SEV 3 INCIDENT] or [SEV 4 SERVICE REQUEST].\n- ZERO loose asterisks in text (write Case #00297257, [SEV 1 URGENT], [SEV 2 URGENT], [SEV 2 HIGH], Status: Solved).\n- Provide an interactive Executive Dashboard HTML Artifact inside a standard HTML code block (triple-backtick html ... triple-backtick) matching Sitepulse dark slate theme with KPI cards, comparison matrix, interactive JavaScript filter tabs, and incident table.\n- Include clean companion executive summary and actionable SRE recommendations.' }],
            },
            generationConfig: finalGenConfig,
          };

          const finalHeaders = {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          };

          let finalRes = await fetch(url, {
            method: 'POST',
            headers: finalHeaders,
            body: JSON.stringify(finalBody),
          });

          if (!finalRes.ok && finalRes.status === 400 && finalBody.generationConfig?.thinkingConfig) {
            delete finalBody.generationConfig.thinkingConfig;
            finalRes = await fetch(url, {
              method: 'POST',
              headers: finalHeaders,
              body: JSON.stringify(finalBody),
            });
          }

          if (finalRes.ok) {
            const finalData = await finalRes.json();
            const candidate = finalData.candidates?.[0];
            const parts = candidate?.content?.parts || [];
            const nonThoughtParts = parts.filter(p => !p.thought && !p.functionCall);
            let finalReply = nonThoughtParts.map(p => p.text || '').filter(Boolean).join('\n');
            if (!finalReply) {
              finalReply = parts.filter(p => !p.functionCall).map(p => p.text || '').filter(Boolean).join('\n');
            }
            if (finalReply && finalReply.trim()) {
              session.messages.push({
                role: 'assistant',
                content: finalReply,
                toolsUsed: toolsExecuted,
                timestamp: Date.now(),
              });
              return {
                reply: finalReply,
                toolsUsed: toolsExecuted,
                sessionId: session.id,
                orgId: session.orgId,
              };
            }
          }
        } catch (finalErr) {
          console.warn('[Pulse AI] Final synthesis call warning:', finalErr.message);
        }
      }

      // Fallback only if model produced nothing
      const fallbackReply = "I retrieved the operations data for your query. Let me know if you would like me to drill down further.";
      session.messages.push({
        role: 'assistant',
        content: fallbackReply,
        toolsUsed: toolsExecuted,
        timestamp: Date.now(),
      });
      return {
        reply: fallbackReply,
        toolsUsed: toolsExecuted,
        sessionId: session.id,
        orgId: session.orgId,
      };

    } catch (err) {
      lastError = err;
      _lastPulseAiError = err;
      console.warn(`[Pulse AI] Model ${model} failed, trying fallback:`, err.message);
    }
  }
}

  // Resilient fallback: instead of crashing, execute operations telemetry directly
  console.warn('[Pulse AI] All Gemini models failed or unavailable. Engaging resilient operations fallback.');
  try {
    let fallbackText = '';
    const fallbackTools = [];
    const lower = cleanInput.toLowerCase();

    const cleanCaseId = (num) => {
      const str = String(num || '').trim();
      return str.startsWith('#') ? str : `#${str}`;
    };

    // Detect requested time range
    let targetRange = '24h';
    if (lower.includes('2 day') || lower.includes('2day') || lower.includes('48h') || lower.includes('48 hour') || lower.includes('2d')) {
      targetRange = '48h';
    } else if (lower.includes('7 day') || lower.includes('7day') || lower.includes('week') || lower.includes('7d')) {
      targetRange = '7d';
    } else if (lower.includes('all') || lower.includes('ever') || lower.includes('history')) {
      targetRange = 'all';
    }

    // Detect mentioned sites
    const detectedSites = [];
    if (lower.includes('h&m') || lower.includes('hnm') || lower.includes('ajax') || (lower.includes('canada') && !lower.includes('walmart'))) {
      detectedSites.push('H&M Canada Ajax');
    }
    if (lower.includes('sams') || lower.includes('4993') || (lower.includes('atl') && !lower.includes('atlantic'))) {
      const samsSite = lower.includes('lax') ? 'Sams Club LAX' : 'Sams Club ATL';
      if (!detectedSites.includes(samsSite)) detectedSites.push(samsSite);
    }
    if (lower.includes('walmart') || lower.includes('mexico') || lower.includes('wal-mart')) {
      if (!detectedSites.includes('Walmart Mexico')) detectedSites.push('Walmart Mexico');
    }
    if (lower.includes('gxo')) {
      if (!detectedSites.includes('GXO-H&M Prod')) detectedSites.push('GXO-H&M Prod');
    }

    const isComparison = detectedSites.length >= 2 || (detectedSites.length === 1 && (lower.includes('compare') || lower.includes('versus') || lower.includes('vs') || lower.includes('worst') || lower.includes('both')));

    if (isComparison && detectedSites.length >= 2) {
      // Multi-site comparison workflow
      const siteA = detectedSites[0];
      const siteB = detectedSites[1];
      const [resA, resB] = await Promise.all([
        executeToolCall('get_site_details', { siteName: siteA, range: targetRange }),
        executeToolCall('get_site_details', { siteName: siteB, range: targetRange }),
      ]);
      fallbackTools.push({ tool: 'get_site_details', args: { siteName: siteA, range: targetRange } });
      fallbackTools.push({ tool: 'get_site_details', args: { siteName: siteB, range: targetRange } });

      const score = (res) => {
        return (res.isDown ? 100 : 0) +
          ((res.activeSev1Count || 0) * 50) +
          ((res.activeSev2UrgentCount || 0) * 30) +
          ((res.activeSev2HighCount || 0) * 10) +
          ((res.totalOpenCases || 0) * 2) +
          ((res.totalAlerts || 0) * 3);
      };

      const scoreA = score(resA);
      const scoreB = score(resB);
      const isAWorse = scoreA >= scoreB;
      const worseSite = isAWorse ? resA : resB;
      const betterSite = isAWorse ? resB : resA;

      fallbackText = `### Operational Reliability Comparison: ${resA.siteName || siteA} vs ${resB.siteName || siteB} (Timeframe: ${targetRange})\n\n`;
      fallbackText += `> **EXECUTIVE VERDICT**: **${worseSite.siteName} is doing significantly worse** over the requested timeframe (${targetRange}).\n`;
      fallbackText += `> - **${worseSite.siteName}** has **${worseSite.totalOpenCases} open operational cases**, ${worseSite.activeSev1Count} Sev-1 Urgent, and ${worseSite.activeSev2UrgentCount || 0} Sev-2 Urgent incidents.\n`;
      fallbackText += `> - In contrast, **${betterSite.siteName}** maintains a much lower incident surface with **${betterSite.totalOpenCases} total open cases** and 0 Sev-1 cases.\n\n`;

      fallbackText += `#### Cross-Site Operations Metric Matrix\n\n`;
      fallbackText += `| Telemetry Metric | ${resA.siteName || siteA} | ${resB.siteName || siteB} | Risk Delta & SRE Assessment |\n`;
      fallbackText += `|---|---|---|---|\n`;
      fallbackText += `| **Site Status** | ${resA.isDown ? '🚨 Critical Down' : '✅ Operational'} | ${resB.isDown ? '🚨 Critical Down' : '✅ Operational'} | ${resA.isDown || resB.isDown ? 'Site outage flagged' : 'Both sites structurally online'} |\n`;
      fallbackText += `| **SEV 1 URGENT** | ${resA.activeSev1Count || 0} | ${resB.activeSev2UrgentCount || 0} | Critical downtime impact |\n`;
      fallbackText += `| **SEV 2 URGENT (50-99%)** | ${resA.activeSev2UrgentCount || 0} | ${resB.activeSev2UrgentCount || 0} | High operational impairment |\n`;
      fallbackText += `| **SEV 2 HIGH (1-49%)** | ${resA.activeSev2HighCount || 0} | ${resB.activeSev2HighCount || 0} | Moderate throughput risk |\n`;
      fallbackText += `| **SEV 3 Incidents** | ${resA.activeSev3Count || 0} | ${resB.activeSev3Count || 0} | Subsystem/station level issues |\n`;
      fallbackText += `| **SEV 4 Requests** | ${resA.activeSev4Count || 0} | ${resB.activeSev4Count || 0} | Standard requests/enhancements |\n`;
      fallbackText += `| **Total Open Cases** | **${resA.totalOpenCases || 0}** | **${resB.totalOpenCases || 0}** | ${isAWorse ? resA.siteName : resB.siteName} has ${(Math.abs(resA.totalOpenCases - resB.totalOpenCases))} more open cases |\n`;
      fallbackText += `| **Opsgenie Telemetry Alerts** | ${resA.totalAlerts || 0} | ${resB.totalAlerts || 0} | Active infrastructure monitors |\n`;
      fallbackText += `| **Product Lines Monitored** | ${(resA.productLines || []).join(', ') || 'RMS, RIL'} | ${(resB.productLines || []).join(', ') || 'RMS, RIL'} | Fleet equipment footprint |\n\n`;

      // Open cases breakdown for worse site
      fallbackText += `#### Top Active Cases: ${worseSite.siteName} (Higher Risk)\n\n`;
      if ((worseSite.openCases || []).length > 0) {
        fallbackText += `| Case Number | Severity | Status | Subject | Created Date |\n|---|---|---|---|---|\n`;
        for (const c of worseSite.openCases.slice(0, 8)) {
          fallbackText += `| ${cleanCaseId(c.caseNumber)} | [${String(c.severity || 'N/A').toUpperCase()}] | Status: ${c.status} | ${c.subject} | ${c.createdDate ? new Date(c.createdDate).toLocaleDateString() : 'N/A'} |\n`;
        }
        fallbackText += `\n`;
      } else {
        fallbackText += `No open cases found for ${worseSite.siteName}.\n\n`;
      }

      // Open cases breakdown for better site
      fallbackText += `#### Top Active Cases: ${betterSite.siteName}\n\n`;
      if ((betterSite.openCases || []).length > 0) {
        fallbackText += `| Case Number | Severity | Status | Subject | Created Date |\n|---|---|---|---|---|\n`;
        for (const c of betterSite.openCases.slice(0, 8)) {
          fallbackText += `| ${cleanCaseId(c.caseNumber)} | [${String(c.severity || 'N/A').toUpperCase()}] | Status: ${c.status} | ${c.subject} | ${c.createdDate ? new Date(c.createdDate).toLocaleDateString() : 'N/A'} |\n`;
        }
      } else {
        fallbackText += `No open cases found for ${betterSite.siteName}.\n`;
      }

    } else if (lower.includes('breach') || lower.includes('red zone') || lower.includes('redzone') || (lower.includes('alert') && (lower.includes('report') || lower.includes('active') || lower.includes('all')))) {
      // Autonomous Breach & Alert Report Workflow
      const [rzRes, incRes, alertRes] = await Promise.all([
        executeToolCall('get_red_zone_sites', {}),
        executeToolCall('get_fleet_incidents', { timeframe: targetRange, severity: 'all' }),
        executeToolCall('get_site_alert_analytics', { siteName: 'all', range: targetRange }),
      ]);
      fallbackTools.push({ tool: 'get_red_zone_sites', args: {} });
      fallbackTools.push({ tool: 'get_fleet_incidents', args: { timeframe: targetRange, severity: 'all' } });
      fallbackTools.push({ tool: 'get_site_alert_analytics', args: { siteName: 'all', range: targetRange } });

      const activeSev1Cases = incRes.activeFleetOpenSev1Cases || [];
      const activeSev2UrgentCases = incRes.activeFleetOpenSev2UrgentCases || [];
      const rzSites = rzRes.sites || [];
      const activeRzBreaches = rzSites.filter(s => s.isCurrentBreach);
      const exitPendingSites = rzSites.filter(s => s.status === 'EXIT_PENDING');

      fallbackText = `### Executive Operational Breach & Alert Report (Timeframe: ${targetRange})\n\n`;
      fallbackText += `> **EXECUTIVE AUDIT SUMMARY**: SRE Fleet Surveillance identified **${activeRzBreaches.length} sites in ACTIVE RED Zone breach**, **${activeSev1Cases.length} active [SEV 1 URGENT] cases (100% impact)**, **${activeSev2UrgentCases.length} active [SEV 2 URGENT] cases (50-99% impact)**, and **${alertRes.totalAlerts || 0} telemetry machine alarms** across 80+ customer fulfillment centers.\n\n`;

      // 1. Severity & SLA Breaches
      fallbackText += `#### 1. Active Severity Outage & SLA Breaches\n\n`;
      if (activeSev1Cases.length > 0 || activeSev2UrgentCases.length > 0) {
        fallbackText += `| Case Number | Severity | Impact % | Site | Status | Subject | Created Date |\n|---|---|---|---|---|---|---|\n`;
        for (const c of [...activeSev1Cases, ...activeSev2UrgentCases]) {
          fallbackText += `| ${cleanCaseId(c.caseNumber)} | ${c.severity} | ${c.impactPercentage}% | ${c.siteName} | Status: ${c.status} | ${c.subject} | ${c.createdDate ? new Date(c.createdDate).toLocaleDateString() : 'N/A'} |\n`;
        }
        fallbackText += `\n`;
      } else {
        fallbackText += `Status: Zero active [SEV 1 URGENT] or [SEV 2 URGENT] outages currently active across the fleet.\n\n`;
      }

      // 2. RED Zone Reliability Breaches Matrix
      fallbackText += `#### 2. RED Zone Reliability Breaches Matrix\n\n`;
      fallbackText += `*Criteria Rules*: Criteria 1 (>=3 Sev-1 OR >=5 Sev-2 in 7d), Criteria 2 (Audited Uptime < 99.0%), Criteria 3 (MTBF < 36h in 14d). *Exit Rule*: 21 continuous days with 0 criteria breaches.\n\n`;
      if (rzSites.length > 0) {
        fallbackText += `| Site Name | Status | Audited Uptime (Crit 2) | 7d Incidents (Crit 1) | 14d MTBF (Crit 3) | Exit Probation | Primary Breach Reason |\n|---|---|---|---|---|---|---|\n`;
        for (const s of rzSites) {
          const statusBadge = s.status === 'ACTIVE_BREACH' ? '🚨 ACTIVE BREACH' : s.status === 'EXIT_PENDING' ? '⏳ EXIT PENDING' : '✅ HEALTHY';
          const uptimeStr = s.criteria2_uptime?.uptimePercentage || 'N/A';
          const incStr = `Sev-1: ${s.criteria1?.sev1Count7d || 0}, Sev-2: ${s.criteria1?.sev2Count7d || 0}`;
          const mtbfStr = s.criteria3_mtbf?.mtbfHours || 'N/A';
          const exitStr = s.status === 'EXIT_PENDING' ? `${s.exitProbation?.daysRemainingToExit ?? 0} days remaining` : (s.status === 'ACTIVE_BREACH' ? 'Breached (0/21d)' : 'Clean');
          const reasonStr = (s.reasons || [])[0] || 'Reliability audit qualification';
          fallbackText += `| ${s.siteName} | ${statusBadge} | ${uptimeStr} | ${incStr} | ${mtbfStr} | ${exitStr} | ${reasonStr} |\n`;
        }
        fallbackText += `\n`;
      } else {
        fallbackText += `No sites currently qualify for RED Zone reliability breach.\n\n`;
      }

      // 3. Telemetry Machine Alarms
      fallbackText += `#### 3. Monitoring Telemetry Alarms & Fleet Stability\n\n`;
      fallbackText += `- **Total Telemetry Alarms**: ${alertRes.totalAlerts || 0} (${alertRes.openAlerts || 0} open, ${alertRes.closedAlerts || 0} closed)\n`;
      fallbackText += `- **Mean Time to Resolve (MTTR)**: ${alertRes.mttrFormatted || 'N/A'}\n`;
      fallbackText += `- **Alert SLA Compliance**: ${alertRes.resolutionSlaMetPercent || 100}%\n`;
      fallbackText += `- **Auto-Resolution Rate**: ${alertRes.autoResolvedPercent || 0}%\n\n`;

      if ((alertRes.topSignatures || []).length > 0) {
        fallbackText += `**Top Alarm Failure Signatures**:\n`;
        for (const sig of alertRes.topSignatures.slice(0, 5)) {
          fallbackText += `- **${sig.name || sig.signature}**: ${sig.count || sig.totalCount} occurrences (${sig.sitesAffected || 'Fleet-wide'})\n`;
        }
        fallbackText += `\n`;
      }

      fallbackText += `#### 4. Actionable SRE Remediation Steps\n\n`;
      fallbackText += `- **Immediate Action**: Swarm engineering squads on active RED Zone sites failing audited uptime (< 99.0%) and high incident frequency.\n`;
      fallbackText += `- **Telemetry Auto-Remediation**: Investigate disk utilization threshold alarms (DiskUtilHigh) on core host platforms.\n`;
      fallbackText += `- **Exit Probation Verification**: Maintain strict 21-day observation cycles before clearing probation flags.\n`;

    } else if (lower.includes('sev 1') || lower.includes('sev-1') || lower.includes('sev 2') || lower.includes('sev-2') || lower.includes('incident') || lower.includes('24h') || lower.includes('hour') || lower.includes('today')) {
      const incRes = await executeToolCall('get_fleet_incidents', { timeframe: targetRange, severity: 'all' });
      fallbackTools.push({ tool: 'get_fleet_incidents', args: { timeframe: targetRange, severity: 'all' } });
      const sev1Count = incRes.summary?.sev1_count || 0;
      const sev2Count = incRes.summary?.sev2_count || 0;
      const totalCount = incRes.totalIncidents || 0;

      fallbackText = `### Fleet Incident Report (Past ${targetRange})\n\n**Summary Overview**\n- **Total Monitored Incidents**: ${totalCount}\n- **Sev-1 Urgent Cases**: ${sev1Count}\n- **Sev-2 High / Urgent Cases**: ${sev2Count}\n\n`;
      if (totalCount === 0) {
        fallbackText += `Status: No urgent Sev-1 or Sev-2 incidents were recorded across the fleet in the past ${targetRange}.\nAll customer sites (RMS, Ranger Assist, RIL) are currently operating within nominal parameters.`;
      } else {
        fallbackText += `| Case Number | Site | Severity | Status | Subject |\n|---|---|---|---|---|\n`;
        for (const c of (incRes.incidents || []).slice(0, 15)) {
          fallbackText += `| ${cleanCaseId(c.caseNumber)} | ${c.siteName} | [${c.severity.toUpperCase()}] | Status: ${c.status} | ${c.subject} |\n`;
        }
      }
    } else if (detectedSites.length > 0) {
      const siteMatch = detectedSites[0];
      const siteRes = await executeToolCall('get_site_details', { siteName: siteMatch, range: targetRange });
      fallbackTools.push({ tool: 'get_site_details', args: { siteName: siteMatch, range: targetRange } });
      const openCases = siteRes.openCases || [];
      fallbackText = `### Operational Status: ${siteRes.siteName || siteMatch}\n\n` +
        `- **Site Operational Status**: Status: ${siteRes.isDown ? 'Site Down' : 'Operational'}\n` +
        `- **Product Lines**: ${(siteRes.productLines || []).join(', ') || 'RMS, RIL'}\n` +
        `- **Total Open Cases**: ${siteRes.totalOpenCases || openCases.length}\n` +
        `- **Sev-1 Urgent Cases**: ${siteRes.activeSev1Count || 0}\n` +
        `- **Sev-2 Urgent Cases**: ${siteRes.activeSev2UrgentCount || 0}\n` +
        `- **Sev-2 High Cases**: ${siteRes.activeSev2HighCount || 0}\n\n`;

      if (openCases.length > 0) {
        fallbackText += `| Case Number | Severity | Status | Subject | Created Date |\n|---|---|---|---|---|\n`;
        for (const c of openCases.slice(0, 15)) {
          fallbackText += `| ${cleanCaseId(c.caseNumber)} | [${String(c.severity || 'N/A').toUpperCase()}] | Status: ${c.status} | ${c.subject} | ${c.createdDate ? new Date(c.createdDate).toLocaleDateString() : 'N/A'} |\n`;
        }
      }
    } else {
      const ovRes = await executeToolCall('get_fleet_overview', {});
      fallbackTools.push({ tool: 'get_fleet_overview', args: {} });
      fallbackText = `### Live Fleet Operations Telemetry\n\n- **Total Monitored Sites**: ${ovRes.monitoredSitesCount || 80}\n- **Critical Down Sites**: ${ovRes.criticalDownSitesCount || 0}\n- **Active Sev-1 Cases**: ${ovRes.activeSev1Count || 0}\n- **Active Sev-2 Cases**: ${ovRes.activeSev2Count || 0}\n\nFleet telemetry is continuously monitored. Ask for a specific site or incident breakdown for detailed telemetry.`;
    }

    session.messages.push({
      role: 'assistant',
      content: fallbackText,
      toolsUsed: fallbackTools,
      timestamp: Date.now(),
    });
    return {
      reply: fallbackText,
      toolsUsed: fallbackTools,
      sessionId: session.id,
      orgId: session.orgId,
    };
  } catch (fbErr) {
    console.error('[Pulse AI] Resilient fallback error:', fbErr);
  }

  throw new Error(`Pulse AI service temporarily unavailable: ${lastError?.message || 'Unknown error'}`);
}

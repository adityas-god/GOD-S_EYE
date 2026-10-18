import {
  executeSOQL,
  compileSiteIndex,
  findBestSiteForCase,
  isAlertCase,
  isDirTicket,
  isImTicket,
  isIncidentTicket,
  getTicketEndTime,
  hasTicketEndTime,
  getImpactPercentage,
  inferProductLine,
  DEFAULT_ALL_SITE_NAMES,
  fetchAllLiveCasesAndAlerts,
  fetchRedZoneSitesOverview,
} from './salesforce.service.js';
import { SiteRepository } from '../models/Site.js';

export const TIMEFRAMES = {
  '24h': { key: '24h', label: '24 hrs', days: 1, hours: 24 },
  '48h': { key: '48h', label: '48 hrs', days: 2, hours: 48 },
  '7d':  { key: '7d',  label: '7 days', days: 7, hours: 168 },
  '15d': { key: '15d', label: '15 days', days: 15, hours: 360 },
  '1m':  { key: '1m',  label: '1 month', days: 30, hours: 720 },
  '2m':  { key: '2m',  label: '2 months', days: 60, hours: 1440 },
  '3m':  { key: '3m',  label: '3 months', days: 90, hours: 2160 },
  '6m':  { key: '6m',  label: '6 months', days: 180, hours: 4320 },
};

// In-memory SWR cache for analytics results (keyed by `${type}_${timeframe}`)
const _analyticsCache = new Map();
const _inFlightCases = new Map();
const _inFlightAlerts = new Map();

export function clearAnalyticsCache() {
  _analyticsCache.clear();
}

/**
 * Detailed severity classifier providing exact counts for:
 * - Sev 1 (Critical / 100% Impact)
 * - Sev 2 Urgent (50-99% Impact or Explicit Urgent)
 * - Sev 2 High (Standard Sev 2 High, Non-Urgent)
 * - Sev 3 (Medium / Standard)
 * - Sev 4 (Low / Minor)
 */
export function classifyDetailedSeverity(c) {
  if (!c) return 'sev3';
  const raw = c;
  const rawType = String(raw.Type || raw.type || '').trim().toLowerCase();
  if (rawType === 'feature request' || rawType === 'query' || rawType === 'analysis' || rawType === 'change') {
    return 'sev4';
  }

  const impact = getImpactPercentage(c);
  if (Boolean(raw.Is_Site_100_Down__c) || Boolean(raw.is_site_down) || Boolean(raw.isSiteDown) || impact >= 100) {
    return 'sev1';
  }

  const highestSevRaw = String(raw.Highest_Severity__c || raw.highest_severity || raw.severity || '').trim();
  const highestSev = highestSevRaw.toUpperCase();
  const prio = String(raw.Priority || raw.priority || raw.Snow_Priority__c || raw.Snow_Urgency__c || '').trim().toUpperCase();
  const sub = String(c.Subject || raw.subject || '').trim();

  // Explicit Sev 1
  for (const s of [highestSev, prio].filter(Boolean)) {
    if (
      s === 'SEVERITY 1' ||
      s === 'SEV 1' ||
      s === 'SEV-1' ||
      s === 'P1' ||
      s.includes('1 - URGENT') ||
      s.includes('SEV 1 - URGENT') ||
      s.includes('SEV 1 URGENT') ||
      s.includes('1 - CRITICAL') ||
      s === 'CRITICAL'
    ) {
      return 'sev1';
    }
  }
  if (/(?:^|[\[\(\s])(?:SEV[-_ ]*1(?:[-_ ]*URGENT)?|P1[-_ ]*URGENT|SEVERITY[-_ ]*1|CRITICAL[-_ ]*(?:OUTAGE|INCIDENT|SEV|IMPACT)|\[CRITICAL\])(?:$|[\]\)\s:])/i.test(sub)) {
    return 'sev1';
  }

  // Explicit Sev 2 Urgent
  if (impact >= 50 && impact < 100) {
    return 'sev2_urgent';
  }
  for (const s of [highestSev, prio].filter(Boolean)) {
    if (
      s.includes('2 - URGENT') ||
      s.includes('SEV 2 - URGENT') ||
      s.includes('SEV 2 URGENT') ||
      s.includes('SEVERITY 2 - URGENT') ||
      s.includes('SEVERITY 2 URGENT')
    ) {
      return 'sev2_urgent';
    }
  }
  if (/(?:^|[\[\(\s])(?:SEV[-_ ]*2[-_ ]*URGENT|P2[-_ ]*URGENT|SEVERITY[-_ ]*2[-_ ]*URGENT)(?:$|[\]\)\s:])/i.test(sub)) {
    return 'sev2_urgent';
  }

  // Explicit Sev 2 High (standard Sev 2, not marked Urgent)
  for (const s of [highestSev, prio].filter(Boolean)) {
    if (
      s === 'SEVERITY 2' ||
      s === 'SEV 2' ||
      s === 'SEV-2' ||
      s === 'P2' ||
      s.includes('2 - HIGH') ||
      s.includes('HIGH') ||
      s === 'HIGH'
    ) {
      return 'sev2_high';
    }
  }
  if (/(?:^|[\[\(\s])(?:SEV[-_ ]*2|P2|SEVERITY[-_ ]*2|\[SEV[-_ ]*2\])(?:$|[\]\)\s:])/i.test(sub)) {
    return 'sev2_high';
  }

  // Explicit Sev 4 (Low / Minor)
  for (const s of [highestSev, prio].filter(Boolean)) {
    if (
      s === 'SEVERITY 4' ||
      s === 'SEV 4' ||
      s === 'SEV-4' ||
      s === 'P4' ||
      s.includes('4 - LOW') ||
      s.includes('LOW') ||
      s === 'LOW' ||
      s.includes('MINOR')
    ) {
      return 'sev4';
    }
  }
  if (/(?:^|[\[\(\s])(?:SEV[-_ ]*4|P4|SEVERITY[-_ ]*4)(?:$|[\]\)\s:])/i.test(sub)) {
    return 'sev4';
  }

  return 'sev3';
}

function calculateIntervalUnionHours(intervals = []) {
  if (!Array.isArray(intervals) || intervals.length === 0) return 0;
  const valid = intervals
    .filter(([start, end]) => typeof start === 'number' && typeof end === 'number' && end > start && !isNaN(start) && !isNaN(end))
    .sort((a, b) => a[0] - b[0]);

  if (valid.length === 0) return 0;

  let totalMs = 0;
  let currentStart = valid[0][0];
  let currentEnd = valid[0][1];

  for (let i = 1; i < valid.length; i++) {
    const [start, end] = valid[i];
    if (start <= currentEnd) {
      if (end > currentEnd) currentEnd = end;
    } else {
      totalMs += (currentEnd - currentStart);
      currentStart = start;
      currentEnd = end;
    }
  }
  totalMs += (currentEnd - currentStart);
  return Math.round((totalMs / (3600 * 1000)) * 10) / 10;
}

function categorizeSubsystem(subject = '', desc = '') {
  const text = `${subject || ''} ${desc || ''}`.toLowerCase();
  if (/(?:100%|site down|system stopped|deadlock|power outage|blackout|grid failure|ups trip)/i.test(text)) {
    return 'System Outage';
  }
  if (/(?:bot|ranger|carrier|lift|charger|dock|conveyor|plc|vfd|sensor|motor|hardware)/i.test(text)) {
    return 'Robotics & Hardware';
  }
  if (/(?:database|postgres|deadlock|redis|api|service|timeout|error|exception|crash|memory|oom)/i.test(text)) {
    return 'Software & Database';
  }
  if (/(?:network|wifi|switch|router|ping|disconnect|packet|ap|access point|ethernet)/i.test(text)) {
    return 'Network & Connectivity';
  }
  if (/(?:pick|put|station|order|sku|wave|bin|chute|workflow|inventory)/i.test(text)) {
    return 'Workflow & Picking';
  }
  return 'Operational Support';
}

/**
 * Fetch and compute full Cases Analytics for the specified timeframe.
 * Strictly omits duplicate IM tickets, DIR tickets, and Alert-type cases.
 */
export async function getCasesAnalytics({ timeframe = '7d', forceRefresh = false } = {}) {
  const tfConfig = TIMEFRAMES[timeframe] || TIMEFRAMES['7d'];
  const cacheKey = `cases_${tfConfig.key}`;
  const now = Date.now();

  if (!forceRefresh) {
    const cached = _analyticsCache.get(cacheKey);
    if (cached && (now - cached.cachedAt < 60000)) {
      return cached.data;
    }
    if (_inFlightCases.has(cacheKey)) {
      return _inFlightCases.get(cacheKey);
    }
  }

  const fetchPromise = _executeCasesAnalytics(tfConfig, cacheKey);
  _inFlightCases.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    _inFlightCases.delete(cacheKey);
  }
}

async function _executeCasesAnalytics(tfConfig, cacheKey) {
  const now = Date.now();

  // 1. Get all known sites
  let allSites = [];
  try {
    allSites = await SiteRepository.findAll();
  } catch {
    allSites = [];
  }
  let allSiteNames = (allSites || []).map(s => s.name);
  if (allSiteNames.length === 0) {
    allSiteNames = DEFAULT_ALL_SITE_NAMES;
  }
  const compiledSites = compileSiteIndex(allSites.length > 0 ? allSites : allSiteNames);

  // 2. Query Salesforce Cases with robust SOQL syntax & 8s timeout
  const days = tfConfig.days;
  const primarySoql = [
    'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c,',
    'Alert_Priority__c, Snow_Priority__c, Snow_Urgency__c,',
    'Type, Product_Type__c, CreatedDate, ClosedDate, LastModifiedDate,',
    'End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c,',
    'Downtime__c, Description, AccountId, Account_Name__c, Customer_Location__c,',
    'Snow_Sitename__c, Site_Name_Customer_Input__c, Is_Site_100_Down__c, Impact_Percentage__c,',
    'Snow_id__c, Owner.Name, DIR_Approval__c, Approval_status__c, Current_RCA_Status__c, RCA_Approval__c',
    'FROM Case',
    `WHERE (CreatedDate = LAST_N_DAYS:${days} OR CreatedDate = TODAY)`,
    "AND (Type = null OR (Type != 'Problem' AND Type != 'Alert' AND Type != 'DIR' AND Type != 'RCA'))",
    'ORDER BY CreatedDate DESC LIMIT 1500',
  ].join(' ');

  const fallbackSoql = [
    'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c,',
    'Type, Product_Type__c, CreatedDate, ClosedDate, LastModifiedDate,',
    'End_Time__c, Downtime__c, Description,',
    'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Is_Site_100_Down__c, Snow_id__c,',
    'DIR_Approval__c, Approval_status__c, Current_RCA_Status__c',
    'FROM Case',
    `WHERE (CreatedDate = LAST_N_DAYS:${days} OR CreatedDate = TODAY)`,
    "AND (Type = null OR (Type != 'Problem' AND Type != 'Alert'))",
    'ORDER BY CreatedDate DESC LIMIT 1200',
  ].join(' ');

  let rawCases = [];
  try {
    const soqlPromise = executeSOQL(primarySoql);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SOQL primary query timed out after 8s')), 8000)
    );
    const res = await Promise.race([soqlPromise, timeoutPromise]);
    rawCases = res.records || [];
  } catch (errPrim) {
    console.warn(`[Analytics Cases SOQL] Primary query notice: ${errPrim.message}. Trying fallback query.`);
    try {
      const soqlFbPromise = executeSOQL(fallbackSoql);
      const timeoutFbPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SOQL fallback query timed out after 6s')), 6000)
      );
      const resFallback = await Promise.race([soqlFbPromise, timeoutFbPromise]);
      rawCases = resFallback.records || [];
    } catch (errFb) {
      console.warn(`[Analytics Cases SOQL] Fallback query notice: ${errFb.message}.`);
      rawCases = [];
    }
  }

  // 2b. Resilient multi-tier fallback: If SOQL query returns 0 or fails,
  // load ground truth from live cases cache and Red Zone dataset immediately
  if (rawCases.length === 0) {
    try {
      const [liveRes, rzRes] = await Promise.allSettled([
        fetchAllLiveCasesAndAlerts(false),
        fetchRedZoneSitesOverview({ forceRefresh: false }),
      ]);
      const pool = [];
      if (liveRes.status === 'fulfilled' && liveRes.value) {
        if (Array.isArray(liveRes.value.cases)) pool.push(...liveRes.value.cases);
        if (Array.isArray(liveRes.value.closed)) pool.push(...liveRes.value.closed);
      }
      if (rzRes.status === 'fulfilled' && rzRes.value?.redZoneSites) {
        for (const s of rzRes.value.redZoneSites) {
          if (Array.isArray(s.qualifyingIncidents)) {
            pool.push(...s.qualifyingIncidents);
          }
        }
      }
      const dedupMap = new Map();
      for (const item of pool) {
        const id = item.Id || item.id || item.CaseNumber || item.caseNumber;
        if (id && !dedupMap.has(id)) {
          dedupMap.set(id, item);
        }
      }
      rawCases = Array.from(dedupMap.values());
    } catch (e) {
      console.warn('[Analytics Cases] Fallback to live/redzone cache notice:', e.message);
    }
  }

  // 3. Strict filtering: Omit Alert cases and DIR paperwork tickets
  const timeframeWindowMs = tfConfig.hours * 60 * 60 * 1000;
  const timeframeStart = now - timeframeWindowMs;

  const validIncidentCandidates = rawCases.filter(c => {
    if (!c) return false;
    if (isAlertCase(c)) return false;
    if (isDirTicket(c)) return false;
    if (isImTicket(c)) return false;
    return isIncidentTicket(c);
  });

  // 3b. Group and deduplicate automated child IM tickets so 1 incident event = 1 incident count (O(N) Hash Map)
  // In Salesforce, automated child IM tickets share ParentId, CaseNumber, or Snow_id with the parent incident
  const clusterMap = new Map();
  for (const c of validIncidentCandidates) {
    const pId = c.ParentId || c.parent_id || c.Parent_Case__c || null;
    const snow = c.Snow_id__c || c.snow_id || null;
    const num = c.CaseNumber || c.case_number || c.Id || c.id;

    let key = '';
    if (pId && pId !== 'null' && pId !== 'undefined' && pId !== '0') {
      key = `parent_${String(pId).toLowerCase().trim()}`;
    } else if (snow && String(snow).toUpperCase().startsWith('IM')) {
      key = `snow_${String(snow).toLowerCase().trim()}`;
    } else {
      key = `case_${String(num).toLowerCase().trim()}`;
    }

    if (!clusterMap.has(key)) {
      clusterMap.set(key, [c]);
    } else {
      clusterMap.get(key).push(c);
    }
  }

  const incidentClusters = Array.from(clusterMap.values());

  const incidents = [];
  for (const cluster of incidentClusters) {
    // Pick the primary non-IM incident ticket in the cluster
    const primary = cluster.find(t => !isImTicket(t)) || cluster[0];

    // Determine highest severity in the incident cluster first
    let bestSev = 'sev4';
    for (const t of cluster) {
      const sev = classifyDetailedSeverity(t);
      if (sev === 'sev1') { bestSev = 'sev1'; break; }
      if (sev === 'sev2_urgent' && bestSev !== 'sev1') bestSev = 'sev2_urgent';
      else if (sev === 'sev2_high' && bestSev !== 'sev1' && bestSev !== 'sev2_urgent') bestSev = 'sev2_high';
      else if (sev === 'sev3' && bestSev === 'sev4') bestSev = 'sev3';
    }

    // Authoritative site matching: Must match a real monitored customer site
    let matchedSite = primary.siteName || findBestSiteForCase(primary, compiledSites);
    if (!matchedSite) {
      for (const t of cluster) {
        const s = t.siteName || findBestSiteForCase(t, compiledSites);
        if (s) {
          matchedSite = s;
          break;
        }
      }
    }
    // Strictly omit tickets not associated with any monitored customer site (eliminates "Unknown Site")
    if (!matchedSite) {
      continue;
    }

    // Incident timestamps
    const crTime = primary.CreatedDate ? new Date(primary.CreatedDate).getTime() : (primary.createdTime || 0);
    const endStr = getTicketEndTime(primary) || primary.endTime || primary.ClosedDate || primary.closedDate || null;
    const eTime = endStr ? new Date(endStr).getTime() : 0;
    const statusLower = String(primary.Status || primary.status || '').toLowerCase();
    const isResolved = Boolean(
      eTime > 0 ||
      statusLower.includes('closed') ||
      statusLower.includes('resolved') ||
      statusLower.includes('solved') ||
      statusLower.includes('cancel') ||
      statusLower.includes('complete') ||
      statusLower.includes('duplicate') ||
      statusLower.includes('hold') ||
      statusLower.includes('pending') ||
      statusLower.includes('waiting') ||
      statusLower.includes('work around') ||
      statusLower.includes('fix provided') ||
      statusLower.includes('monitoring')
    );

    // If ticket was already resolved before the window start, or created in the future, omit
    const resolvedFallbackTime = primary.ClosedDate
      ? new Date(primary.ClosedDate).getTime()
      : (primary.LastModifiedDate ? new Date(primary.LastModifiedDate).getTime() : crTime);

    let effectiveEndTime = eTime > 0 ? eTime : (isResolved ? resolvedFallbackTime : now);

    const isSiteDown = cluster.some(t => Boolean(t.Is_Site_100_Down__c || t.isSiteDown || t.is_site_down));

    // Guard against stale open tickets causing unbounded fake downtime:
    // If a ticket has NO End Time, is NOT resolved, and is NOT marked 100% site down:
    // a floor incident ticket does not run as a continuous site outage for 24-48 hours.
    // If open for > 6 hours without Is_Site_100_Down__c, cap the unverified outage to 4 hours or LastModifiedDate.
    if (!isResolved && eTime === 0 && !isSiteDown) {
      const openDurationHours = (now - crTime) / (3600 * 1000);
      if (openDurationHours > 6) {
        const lMod = primary.LastModifiedDate ? new Date(primary.LastModifiedDate).getTime() : 0;
        if (lMod > crTime && (now - lMod) > 3600 * 1000) {
          effectiveEndTime = Math.min(effectiveEndTime, lMod);
        } else {
          effectiveEndTime = Math.min(effectiveEndTime, crTime + 4 * 3600 * 1000);
        }
      }
    }

    if (effectiveEndTime < timeframeStart && crTime < timeframeStart) {
      continue;
    }
    if (crTime > now) {
      continue;
    }

    // CRITICAL USER BUSINESS RULE:
    // "downtime will only be calculated as per urgent cases no sev 2 high or sev 3 and downtime will be counted as start time and end time and this much downtime is not possible like 48 hours this 1148hrs downtime calculate real downtime"
    const isUrgent = bestSev === 'sev1' || bestSev === 'sev2_urgent' || isSiteDown;
    let durationHours = null;

    if (isUrgent && crTime > 0) {
      const activeStart = Math.max(timeframeStart, crTime);
      const activeEnd = Math.min(now, effectiveEndTime);
      if (activeEnd > activeStart) {
        const diffMs = activeEnd - activeStart;
        const calcHours = Math.round((diffMs / (3600 * 1000)) * 10) / 10;
        // Strictly clamp to timeframe maximum hours (e.g. 48h window cannot exceed 48.0h)
        durationHours = Math.min(tfConfig.hours, calcHours);
      } else {
        durationHours = 0;
      }
    }

    // Preserve real 18-character Salesforce Case Id
    const realId = primary.Id || primary.id || primary.Case_Id__c || primary.caseId || null;

    incidents.push({
      id: realId,
      caseNumber: primary.CaseNumber || primary.caseNumber || 'CASE',
      subject: primary.Subject || primary.subject || 'Operational Incident',
      siteName: matchedSite,
      detailedSeverity: bestSev,
      isSiteDown,
      status: primary.Status || primary.status || (isResolved ? 'Closed' : 'Active'),
      isResolved,
      createdDate: primary.CreatedDate || primary.createdDate,
      createdTime: crTime,
      closedDate: primary.ClosedDate || primary.closedDate || null,
      endTime: endStr,
      durationHours,
      subsystem: categorizeSubsystem(primary.Subject || primary.subject, primary.Description || primary.description),
      description: primary.Description || primary.description || null,
    });
  }

  // 4. Severity Distribution Breakdown
  const severityCounts = {
    sev1: 0,
    sev2_urgent: 0,
    sev2_high: 0,
    sev3: 0,
    sev4: 0,
  };

  for (const inc of incidents) {
    if (severityCounts[inc.detailedSeverity] !== undefined) {
      severityCounts[inc.detailedSeverity]++;
    } else {
      severityCounts.sev3++;
    }
  }

  const totalIncidentsCount = incidents.length;
  const severityBreakdown = {
    sev1: {
      count: severityCounts.sev1,
      pct: totalIncidentsCount > 0 ? Math.round((severityCounts.sev1 / totalIncidentsCount) * 100) : 0,
    },
    sev2_urgent: {
      count: severityCounts.sev2_urgent,
      pct: totalIncidentsCount > 0 ? Math.round((severityCounts.sev2_urgent / totalIncidentsCount) * 100) : 0,
    },
    sev2_high: {
      count: severityCounts.sev2_high,
      pct: totalIncidentsCount > 0 ? Math.round((severityCounts.sev2_high / totalIncidentsCount) * 100) : 0,
    },
    sev3: {
      count: severityCounts.sev3,
      pct: totalIncidentsCount > 0 ? Math.round((severityCounts.sev3 / totalIncidentsCount) * 100) : 0,
    },
    sev4: {
      count: severityCounts.sev4,
      pct: totalIncidentsCount > 0 ? Math.round((severityCounts.sev4 / totalIncidentsCount) * 100) : 0,
    },
    total: totalIncidentsCount,
  };

  // 5. Per-Site Aggregations
  const siteMap = new Map();
  for (const sName of allSiteNames) {
    const sObj = allSites.find(s => s.name?.toLowerCase() === sName.toLowerCase());
    siteMap.set(sName.toLowerCase(), {
      siteName: sName,
      productLine: sObj?.product_line || inferProductLine(sName),
      incidents: [],
      downtimeIntervals: [],
      sev1Count: 0,
      sev2UrgentCount: 0,
      sev2HighCount: 0,
      sev3Count: 0,
      sev4Count: 0,
    });
  }

  for (const inc of incidents) {
    const key = (inc.siteName || '').toLowerCase().trim();
    if (!siteMap.has(key)) {
      // Disregard non-monitored sites (ensures "Unknown Site" is never created)
      continue;
    }
    const sEntry = siteMap.get(key);
    sEntry.incidents.push(inc);

    if (inc.detailedSeverity === 'sev1') sEntry.sev1Count++;
    else if (inc.detailedSeverity === 'sev2_urgent') sEntry.sev2UrgentCount++;
    else if (inc.detailedSeverity === 'sev2_high') sEntry.sev2HighCount++;
    else if (inc.detailedSeverity === 'sev3') sEntry.sev3Count++;
    else if (inc.detailedSeverity === 'sev4') sEntry.sev4Count++;

    // Outage interval ONLY for Sev 1, Sev 2 Urgent, or site down (strictly no Sev 2 High or Sev 3)
    if (
      (inc.detailedSeverity === 'sev1' || inc.detailedSeverity === 'sev2_urgent' || inc.isSiteDown) &&
      inc.createdTime > 0 &&
      typeof inc.durationHours === 'number' &&
      inc.durationHours > 0
    ) {
      const overlapStart = Math.max(timeframeStart, inc.createdTime);
      const overlapEnd = Math.min(now, overlapStart + inc.durationHours * 3600 * 1000);
      if (overlapEnd > overlapStart) {
        sEntry.downtimeIntervals.push([overlapStart, overlapEnd]);
      }
    }
  }

  // Calculate non-overlapping interval union downtime per site (strictly clamped to timeframe window)
  const siteStatsList = [];
  let totalFleetDowntimeHours = 0;
  let resolvedIncidentsCount = 0;
  let sumResolutionHours = 0;

  for (const entry of siteMap.values()) {
    const rawDtHours = calculateIntervalUnionHours(entry.downtimeIntervals);
    // Site downtime cannot exceed total timeframe hours (e.g. max 48h in 48h window)
    const dtHours = Math.min(tfConfig.hours, rawDtHours);
    totalFleetDowntimeHours += dtHours;

    for (const inc of entry.incidents) {
      if (inc.isResolved && typeof inc.durationHours === 'number' && inc.durationHours > 0) {
        resolvedIncidentsCount++;
        sumResolutionHours += inc.durationHours;
      }
    }

    siteStatsList.push({
      siteName: entry.siteName,
      productLine: entry.productLine,
      totalIncidents: entry.incidents.length,
      sev1Count: entry.sev1Count,
      sev2UrgentCount: entry.sev2UrgentCount,
      sev2HighCount: entry.sev2HighCount,
      sev3Count: entry.sev3Count,
      sev4Count: entry.sev4Count,
      downtimeHours: dtHours,
      sharePct: totalIncidentsCount > 0 ? Math.round((entry.incidents.length / totalIncidentsCount) * 100) : 0,
    });
  }

  totalFleetDowntimeHours = Math.round(totalFleetDowntimeHours * 10) / 10;
  const averageResolutionHours = resolvedIncidentsCount > 0
    ? Math.round((sumResolutionHours / resolvedIncidentsCount) * 10) / 10
    : 0;

  // 6. TOP 10 Sites with Incidents (monitored customer sites only)
  const top10IncidentSites = siteStatsList
    .filter(s => s.totalIncidents > 0)
    .sort((a, b) => b.totalIncidents - a.totalIncidents || b.downtimeHours - a.downtimeHours)
    .slice(0, 10)
    .map((s, idx) => ({ rank: idx + 1, ...s }));

  // 7. Sites with Most Downtimes (urgent cases only)
  const sitesWithMostDowntime = siteStatsList
    .filter(s => s.downtimeHours > 0)
    .sort((a, b) => b.downtimeHours - a.downtimeHours || b.totalIncidents - a.totalIncidents)
    .slice(0, 8)
    .map((s, idx) => ({
      rank: idx + 1,
      siteName: s.siteName,
      productLine: s.productLine,
      downtimeHours: s.downtimeHours,
      criticalIncidents: s.sev1Count + s.sev2UrgentCount,
      totalIncidents: s.totalIncidents,
    }));

  // 8. Most Breached Sites (Sev 1 >= 1 or Sev 2 Urgent >= 2 or high downtime)
  const mostBreachedSites = siteStatsList
    .filter(s => s.sev1Count > 0 || s.sev2UrgentCount >= 2 || s.downtimeHours >= 4)
    .sort((a, b) => (b.sev1Count * 3 + b.sev2UrgentCount * 2 + b.downtimeHours) - (a.sev1Count * 3 + a.sev2UrgentCount * 2 + a.downtimeHours))
    .slice(0, 8)
    .map((s, idx) => ({
      rank: idx + 1,
      siteName: s.siteName,
      sev1Count: s.sev1Count,
      sev2UrgentCount: s.sev2UrgentCount,
      downtimeHours: s.downtimeHours,
      breachSeverity: (s.sev1Count >= 1 || s.downtimeHours >= 6) ? 'CRITICAL_BREACH' : 'ELEVATED_RISK',
    }));

  // 9. Stable Sites with No Issues
  const stableSites = siteStatsList
    .filter(s => s.totalIncidents === 0)
    .map(s => ({
      siteName: s.siteName,
      productLine: s.productLine,
    }));

  // 10. Top Most Breached / Critical Tickets
  // Strictly urgent cases only (Sev 1, Sev 2 Urgent, or site down). No Sev 2 High or Sev 3!
  const topCriticalTickets = incidents
    .filter(t => t.detailedSeverity === 'sev1' || t.detailedSeverity === 'sev2_urgent' || t.isSiteDown)
    .sort((a, b) => (b.durationHours || 0) - (a.durationHours || 0) || (b.createdTime || 0) - (a.createdTime || 0))
    .slice(0, 25);

  // 11. Subsystem Incident Breakdown
  const subsystemCounts = {
    'Robotics & Hardware': 0,
    'Software & Database': 0,
    'Workflow & Picking': 0,
    'Network & Connectivity': 0,
    'System Outage': 0,
    'Operational Support': 0,
  };
  for (const inc of incidents) {
    if (subsystemCounts[inc.subsystem] !== undefined) {
      subsystemCounts[inc.subsystem]++;
    } else {
      subsystemCounts['Operational Support']++;
    }
  }

  const subsystemBreakdown = Object.entries(subsystemCounts)
    .map(([subsystem, count]) => ({
      subsystem,
      count,
      pct: totalIncidentsCount > 0 ? Math.round((count / totalIncidentsCount) * 100) : 0,
    }))
    .filter(s => s.count > 0 || s.subsystem === 'Robotics & Hardware' || s.subsystem === 'Software & Database')
    .sort((a, b) => b.count - a.count);

  // 12. Reoccurring Issues Clustering
  const patternMap = new Map();
  for (const inc of incidents) {
    const cleanSub = (inc.subject || '')
      .replace(/^(\[?(?:im|inc|urgent|alert|p[12]|sev[12])\]?[:\s\-_]*)+/i, '')
      .replace(/#\d+/g, '')
      .replace(/\b\d{4,}\b/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanSub.length < 5) continue;
    const tokens = cleanSub.split(' ').slice(0, 4).join(' ');
    patternMap.set(tokens, (patternMap.get(tokens) || 0) + 1);
  }

  const reoccurringPatterns = Array.from(patternMap.entries())
    .filter(([, count]) => count >= 2)
    .map(([signature, count]) => ({ signature, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const result = {
    type: 'cases',
    timeframe: tfConfig.key,
    timeframeLabel: tfConfig.label,
    days: tfConfig.days,
    kpis: {
      totalIncidents: totalIncidentsCount,
      averageResolutionHours,
      totalFleetDowntimeHours,
      activeBreachedSitesCount: mostBreachedSites.length,
      stableSitesCount: stableSites.length,
      monitoredSitesCount: allSiteNames.length,
    },
    severityBreakdown,
    top10IncidentSites,
    sitesWithMostDowntime,
    mostBreachedSites,
    stableSites,
    topCriticalTickets,
    subsystemBreakdown,
    reoccurringPatterns,
    timestamp: new Date().toISOString(),
  };

  _analyticsCache.set(cacheKey, { data: result, cachedAt: now });
  return result;
}

/**
 * Fetch and compute Alerts Analytics for the specified timeframe.
 * Strictly focuses on automated alerts, excluding customer service requests or internal syncs.
 */
export async function getAlertsAnalytics({ timeframe = '7d', forceRefresh = false } = {}) {
  const tfConfig = TIMEFRAMES[timeframe] || TIMEFRAMES['7d'];
  const cacheKey = `alerts_${tfConfig.key}`;
  const now = Date.now();

  if (!forceRefresh) {
    const cached = _analyticsCache.get(cacheKey);
    if (cached && (now - cached.cachedAt < 60000)) {
      return cached.data;
    }
    if (_inFlightAlerts.has(cacheKey)) {
      return _inFlightAlerts.get(cacheKey);
    }
  }

  const fetchPromise = _executeAlertsAnalytics(tfConfig, cacheKey);
  _inFlightAlerts.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    _inFlightAlerts.delete(cacheKey);
  }
}

async function _executeAlertsAnalytics(tfConfig, cacheKey) {
  const now = Date.now();

  let allSites = [];
  try {
    allSites = await SiteRepository.findAll();
  } catch {
    allSites = [];
  }
  let allSiteNames = (allSites || []).map(s => s.name);
  if (allSiteNames.length === 0) {
    allSiteNames = DEFAULT_ALL_SITE_NAMES;
  }
  const compiledSites = compileSiteIndex(allSites.length > 0 ? allSites : allSiteNames);

  const days = tfConfig.days;
  const whereClause = "(Type = 'Alert' OR Snow_Category__c = 'Alert' OR Subject LIKE '%Runbook for%' OR Subject LIKE '%Dashboard for%' OR Subject LIKE '%Ranger Infra%' OR Subject LIKE '%[Alert]%' OR Subject LIKE '%Alert:%' OR Subject LIKE '%[Opsgenie]%' OR Subject LIKE '%Opsgenie:%' OR Subject LIKE '%BotsAvailable%' OR Subject LIKE '%ProcessExecutions%' OR Subject LIKE '%DiskUtil%' OR Subject LIKE '%MemUtil%' OR Subject LIKE '%CpuUtil%' OR Subject LIKE '%PostgresOldData%' OR Subject LIKE '%ChargersOffline%' OR Subject LIKE '%RabbitMQ%')";

  const alertsSoql = [
    'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c,',
    'Alert_Priority__c, Snow_Priority__c, Snow_Urgency__c,',
    'Type, Product_Type__c, CreatedDate, ClosedDate, LastModifiedDate,',
    'End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c,',
    'Description, AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Owner.Name',
    'FROM Case',
    `WHERE ${whereClause} AND (CreatedDate = LAST_N_DAYS:${days} OR CreatedDate = TODAY)`,
    'ORDER BY CreatedDate DESC LIMIT 1200',
  ].join(' ');

  let rawAlerts = [];
  try {
    const soqlPromise = executeSOQL(alertsSoql);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Alerts SOQL query timed out after 8s')), 8000)
    );
    const res = await Promise.race([soqlPromise, timeoutPromise]);
    rawAlerts = res.records || [];
  } catch (err) {
    console.warn(`[Analytics Alerts SOQL] Query notice: ${err.message}. Using live alerts fallback.`);
    try {
      const live = await fetchAllLiveCasesAndAlerts(false);
      rawAlerts = [...(live.alerts || []), ...(live.allAlerts || []), ...(live.closedAlerts || [])];
    } catch {
      rawAlerts = [];
    }
  }

  if (rawAlerts.length === 0) {
    try {
      const live = await fetchAllLiveCasesAndAlerts(false);
      rawAlerts = [...(live.alerts || []), ...(live.allAlerts || []), ...(live.closedAlerts || [])];
    } catch {
      rawAlerts = [];
    }
  }

  const timeframeWindowMs = tfConfig.hours * 60 * 60 * 1000;
  const timeframeStart = now - timeframeWindowMs;

  const validAlerts = [];
  for (const a of rawAlerts) {
    if (!a) continue;
    const isServiceReq =
      /(?:service\s*request|^\[?sr\]?|request)/i.test(a.Type || a.type || '') ||
      /(?:service\s*request|^\[?sr\]?)/i.test(a.Subject || a.subject || '');
    if (isServiceReq) continue;
    if (!isAlertCase(a)) continue;

    const crTime = a.CreatedDate ? new Date(a.CreatedDate).getTime() : 0;
    const endStr = a.End_Time__c || a.ClosedDate || a.ended_at || null;
    const eTime = endStr ? new Date(endStr).getTime() : 0;
    const isResolved = Boolean(
      eTime > 0 ||
      (a.Status && (a.Status.toLowerCase().includes('closed') || a.Status.toLowerCase().includes('resolved') || a.Status.toLowerCase().includes('solved')))
    );
    const isOpen = !isResolved;

    // Matches if created in window OR ended in window OR currently open
    const inWindow = (crTime >= timeframeStart) || (eTime >= timeframeStart) || isOpen;
    if (!inWindow && crTime > 0 && crTime < timeframeStart) {
      continue;
    }

    const matchedSite = a.site_name || findBestSiteForCase(a, compiledSites);
    if (!matchedSite) {
      continue; // Strictly omit alerts not associated with monitored customer sites
    }

    // Priority classification
    const pStr = String(a.Alert_Priority__c || a.Priority || a.Highest_Severity__c || a.priority || '').toUpperCase();
    let priority = 'P3';
    if (pStr.includes('P1') || pStr.includes('1 -') || pStr.includes('CRITICAL') || pStr.includes('SEV 1') || pStr.includes('SEVERITY 1')) {
      priority = 'P1';
    } else if (pStr.includes('P2') || pStr.includes('2 -') || pStr.includes('HIGH') || pStr.includes('SEV 2') || pStr.includes('SEVERITY 2')) {
      priority = 'P2';
    } else if (pStr.includes('P4') || pStr.includes('4 -') || pStr.includes('LOW')) {
      priority = 'P4';
    } else if (pStr.includes('P5') || pStr.includes('5 -') || pStr.includes('INFO')) {
      priority = 'P5';
    } else {
      priority = 'P3';
    }

    const effectiveEndTime = eTime > 0 ? eTime : (isOpen ? now : (crTime || now));

    let durationHours = 0;
    if (crTime > 0) {
      const activeStart = Math.max(timeframeStart, crTime);
      const activeEnd = Math.min(now, effectiveEndTime);
      if (activeEnd >= activeStart) {
        const diffMs = activeEnd - activeStart;
        durationHours = Math.min(tfConfig.hours, Math.round((diffMs / (3600 * 1000)) * 10) / 10);
      }
    }

    // Alert Response & Mitigation SLA thresholds (in hours):
    // P1 Critical: 0.5h (30 min)
    // P2 High: 2.0h (2 hours)
    // P3 Medium: 8.0h (8 hours)
    // P4/P5 Low: 24.0h (24 hours)
    const slaTargetHours = priority === 'P1' ? 0.5 : priority === 'P2' ? 2.0 : priority === 'P3' ? 8.0 : 24.0;
    const isBreached = durationHours > slaTargetHours;
    const breachOverdueHours = isBreached ? Math.round((durationHours - slaTargetHours) * 10) / 10 : 0;
    const isActiveBreach = isOpen && isBreached;

    validAlerts.push({
      id: a.Id || a.id || a.case_id,
      caseNumber: a.CaseNumber || a.case_number || 'ALERT',
      subject: a.Subject || a.subject || 'Automated Alert',
      siteName: matchedSite,
      priority,
      status: a.Status || a.status || (isOpen ? 'Active' : 'Closed'),
      isOpen,
      isResolved,
      createdDate: a.CreatedDate || a.created_at,
      createdTime: crTime,
      closedDate: a.ClosedDate || null,
      endTime: endStr,
      durationHours,
      slaTargetHours,
      isBreached,
      breachOverdueHours,
      isActiveBreach,
      subsystem: categorizeSubsystem(a.Subject || a.subject, a.Description || a.description),
      description: a.Description || a.description || null,
    });
  }

  // Priority Distribution & SLA Breaches Tracking
  const prioCounts = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
  let sumAlertDuration = 0;
  let resolvedAlertsCount = 0;
  let breachedAlertsCount = 0;
  let activeAlertsCount = 0;
  let activeBreachedAlertsCount = 0;
  let p1BreachedCount = 0;
  let p2BreachedCount = 0;
  let p3BreachedCount = 0;

  for (const a of validAlerts) {
    prioCounts[a.priority] = (prioCounts[a.priority] || 0) + 1;
    if (a.isOpen) activeAlertsCount++;
    if (a.isBreached) {
      breachedAlertsCount++;
      if (a.isActiveBreach) activeBreachedAlertsCount++;
      if (a.priority === 'P1') p1BreachedCount++;
      else if (a.priority === 'P2') p2BreachedCount++;
      else if (a.priority === 'P3') p3BreachedCount++;
    }
    if (a.isResolved && typeof a.durationHours === 'number' && a.durationHours > 0) {
      sumAlertDuration += a.durationHours;
      resolvedAlertsCount++;
    }
  }

  const totalAlertsCount = validAlerts.length;
  const breachRatePct = totalAlertsCount > 0 ? Math.round((breachedAlertsCount / totalAlertsCount) * 100) : 0;

  const priorityBreakdown = {
    p1: { count: prioCounts.P1, pct: totalAlertsCount > 0 ? Math.round((prioCounts.P1 / totalAlertsCount) * 100) : 0, breached: p1BreachedCount },
    p2: { count: prioCounts.P2, pct: totalAlertsCount > 0 ? Math.round((prioCounts.P2 / totalAlertsCount) * 100) : 0, breached: p2BreachedCount },
    p3: { count: prioCounts.P3, pct: totalAlertsCount > 0 ? Math.round((prioCounts.P3 / totalAlertsCount) * 100) : 0, breached: p3BreachedCount },
    p4: { count: prioCounts.P4, pct: totalAlertsCount > 0 ? Math.round((prioCounts.P4 / totalAlertsCount) * 100) : 0, breached: 0 },
    p5: { count: prioCounts.P5, pct: totalAlertsCount > 0 ? Math.round((prioCounts.P5 / totalAlertsCount) * 100) : 0, breached: 0 },
    total: totalAlertsCount,
  };

  const averageResolutionHours = resolvedAlertsCount > 0
    ? Math.round((sumAlertDuration / resolvedAlertsCount) * 10) / 10
    : 0;

  // Site Alert Aggregations
  const alertSiteMap = new Map();
  for (const sName of allSiteNames) {
    const sObj = allSites.find(s => s.name?.toLowerCase() === sName.toLowerCase());
    alertSiteMap.set(sName.toLowerCase(), {
      siteName: sName,
      productLine: sObj?.product_line || inferProductLine(sName),
      alerts: [],
      p1Count: 0,
      p2Count: 0,
      p3Count: 0,
      breachedCount: 0,
      p1Breaches: 0,
      p2Breaches: 0,
      activeCount: 0,
      activeBreaches: 0,
    });
  }

  for (const a of validAlerts) {
    const key = (a.siteName || '').toLowerCase().trim();
    if (!alertSiteMap.has(key)) {
      continue;
    }
    const entry = alertSiteMap.get(key);
    entry.alerts.push(a);
    if (a.priority === 'P1') entry.p1Count++;
    else if (a.priority === 'P2') entry.p2Count++;
    else if (a.priority === 'P3') entry.p3Count++;

    if (a.isOpen) entry.activeCount++;
    if (a.isBreached) {
      entry.breachedCount++;
      if (a.priority === 'P1') entry.p1Breaches++;
      else if (a.priority === 'P2') entry.p2Breaches++;
      if (a.isActiveBreach) entry.activeBreaches++;
    }
  }

  const alertSitesList = [];
  for (const entry of alertSiteMap.values()) {
    const totalSiteAlerts = entry.alerts.length;
    alertSitesList.push({
      siteName: entry.siteName,
      productLine: entry.productLine,
      totalAlerts: totalSiteAlerts,
      p1Count: entry.p1Count,
      p2Count: entry.p2Count,
      p3Count: entry.p3Count,
      breachedCount: entry.breachedCount,
      p1Breaches: entry.p1Breaches,
      p2Breaches: entry.p2Breaches,
      activeCount: entry.activeCount,
      activeBreaches: entry.activeBreaches,
      breachRatePct: totalSiteAlerts > 0 ? Math.round((entry.breachedCount / totalSiteAlerts) * 100) : 0,
      sharePct: totalAlertsCount > 0 ? Math.round((totalSiteAlerts / totalAlertsCount) * 100) : 0,
    });
  }

  // TOP 10 Alert Sites
  const top10AlertSites = alertSitesList
    .filter(s => s.totalAlerts > 0)
    .sort((a, b) => b.totalAlerts - a.totalAlerts || b.p1Count - a.p1Count)
    .slice(0, 10)
    .map((s, idx) => ({ rank: idx + 1, ...s }));

  // Most Breached Alert Sites
  const mostBreachedAlertSites = alertSitesList
    .filter(s => s.breachedCount > 0)
    .sort((a, b) => (b.p1Breaches * 3 + b.breachedCount * 1.5 + b.p2Breaches) - (a.p1Breaches * 3 + a.breachedCount * 1.5 + a.p2Breaches) || b.breachedCount - a.breachedCount)
    .slice(0, 8)
    .map((s, idx) => ({
      rank: idx + 1,
      siteName: s.siteName,
      productLine: s.productLine,
      totalAlerts: s.totalAlerts,
      breachedCount: s.breachedCount,
      p1Breaches: s.p1Breaches,
      p2Breaches: s.p2Breaches,
      breachRatePct: s.breachRatePct,
      activeBreaches: s.activeBreaches,
      breachSeverity: (s.p1Breaches >= 1 || s.breachedCount >= 5) ? 'CRITICAL_BREACH' : 'ELEVATED_RISK',
    }));

  // Stable Sites (Zero alerts)
  const stableSites = alertSitesList
    .filter(s => s.totalAlerts === 0)
    .map(s => ({
      siteName: s.siteName,
      productLine: s.productLine,
    }));

  // Top Most Breached Alerts (Longest Running / Critical Overdue Alerts)
  const topBreachedAlerts = validAlerts
    .filter(a => a.isBreached)
    .sort((a, b) => b.breachOverdueHours - a.breachOverdueHours || (b.priority === 'P1' ? 1 : 0) - (a.priority === 'P1' ? 1 : 0) || (b.createdTime || 0) - (a.createdTime || 0))
    .slice(0, 25);

  // Top Fired Alert Signatures enriched with breach counts and impacted sites
  const sigMap = new Map();
  for (const a of validAlerts) {
    let sig = a.subject
      .replace(/^(\[?(?:alert|opsgenie)\]?[:\s\-_]*)+/i, '')
      .replace(/\s+on\s+.*$/i, '')
      .replace(/\s+at\s+.*$/i, '')
      .trim();
    if (sig.length < 5) sig = a.subject;
    const normalizedSig = sig.slice(0, 50);
    if (!sigMap.has(normalizedSig)) {
      sigMap.set(normalizedSig, { signature: normalizedSig, count: 0, breachedCount: 0, p1Count: 0, sites: new Set() });
    }
    const entry = sigMap.get(normalizedSig);
    entry.count++;
    if (a.isBreached) entry.breachedCount++;
    if (a.priority === 'P1') entry.p1Count++;
    if (a.siteName) entry.sites.add(a.siteName);
  }

  const topFiredAlertSignatures = Array.from(sigMap.values())
    .map(item => ({
      signature: item.signature,
      count: item.count,
      breachedCount: item.breachedCount,
      p1Count: item.p1Count,
      impactedSitesCount: item.sites.size,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Subsystem Breakdown for Alerts
  const alertSubsystems = {
    'Robotics & Hardware': 0,
    'Software & Database': 0,
    'Workflow & Picking': 0,
    'Network & Connectivity': 0,
    'System Outage': 0,
    'Operational Support': 0,
  };
  for (const a of validAlerts) {
    if (alertSubsystems[a.subsystem] !== undefined) {
      alertSubsystems[a.subsystem]++;
    } else {
      alertSubsystems['Operational Support']++;
    }
  }

  const subsystemBreakdown = Object.entries(alertSubsystems)
    .map(([subsystem, count]) => ({
      subsystem,
      count,
      pct: totalAlertsCount > 0 ? Math.round((count / totalAlertsCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const topRecentP1P2Alerts = validAlerts
    .filter(a => a.priority === 'P1' || a.priority === 'P2')
    .slice(0, 25);

  const recentAlerts = validAlerts
    .slice()
    .sort((a, b) => (b.createdTime || 0) - (a.createdTime || 0))
    .slice(0, 250);

  const activeAlertSitesCount = alertSitesList.filter(s => s.totalAlerts > 0).length;

  const result = {
    type: 'alerts',
    timeframe: tfConfig.key,
    timeframeLabel: tfConfig.label,
    days: tfConfig.days,
    kpis: {
      totalAlerts: totalAlertsCount,
      breachedAlertsCount,
      breachRatePct,
      activeAlertsCount,
      activeBreachedAlertsCount,
      p1CriticalCount: prioCounts.P1,
      p1BreachedCount,
      p2HighCount: prioCounts.P2,
      p2BreachedCount,
      p3MediumCount: prioCounts.P3,
      averageResolutionHours,
      activeAlertSitesCount,
      stableSitesCount: stableSites.length,
      monitoredSitesCount: allSiteNames.length,
    },
    priorityBreakdown,
    top10AlertSites,
    mostBreachedAlertSites,
    topBreachedAlerts,
    stableSites,
    topFiredAlertSignatures,
    topRecentP1P2Alerts,
    subsystemBreakdown,
    recentAlerts,
    timestamp: new Date().toISOString(),
  };

  _analyticsCache.set(cacheKey, { data: result, cachedAt: now });
  return result;
}

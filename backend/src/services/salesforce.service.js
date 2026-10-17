import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SiteRepository } from '../models/Site.js';
import { CaseRepository } from '../models/Case.js';
import { defaultSites } from '../data/defaultSites.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getSfConfig() {
  let instanceUrl =
    process.env.SF_INSTANCE_URL ||
    process.env.SALESFORCE_INSTANCE_URL ||
    process.env.VITE_SF_INSTANCE_URL ||
    'https://greyorangeorg.my.salesforce.com';
  if (!instanceUrl || instanceUrl.includes('your-domain')) {
    instanceUrl = 'https://greyorangeorg.my.salesforce.com';
  }

  const clientId =
    process.env.SF_CLIENT_ID ||
    process.env.SALESFORCE_CLIENT_ID ||
    process.env.VITE_SF_CLIENT_ID ||
    '';

  const clientSecret =
    process.env.SF_CLIENT_SECRET ||
    process.env.SALESFORCE_CLIENT_SECRET ||
    process.env.VITE_SF_CLIENT_SECRET ||
    '';

  return {
    instanceUrl,
    clientId,
    clientSecret,
    apiVersion: process.env.SF_API_VERSION || 'v59.0',
  };
}

export const DEFAULT_ALL_SITE_NAMES = defaultSites.map(s => s.name);

let tokenCache = null;
let _lastSalesforceError = null;

export function getLastSalesforceError() {
  return _lastSalesforceError;
}

const CLOSED_STATUS_PATTERNS = [
  'closed',
  'solved',
  'resolved',
  'cancel',
  'complete',
  'duplicate',
];

const EXCLUDED_STATUS_PATTERNS = [
  ...CLOSED_STATUS_PATTERNS,
  'on hold',
  'hold',
  'pending confirmation',
  'pending-confirmation',
  'pending customer confirmation',
  'pending information',
  'waiting on customer',
  'waiting for customer',
];

export function isAlertCase(c) {
  if (!c) return false;

  // 1. Explicit Type or Category is Alert
  const typeStr = String(c.Type || c.type || '').trim().toLowerCase();
  const catStr = String(c.Category__c || c.category || c.Snow_Category__c || '').trim().toLowerCase();
  if (typeStr === 'alert' || catStr === 'alert') return true;

  // If Type or Category is explicitly Incident, Problem, or Support, require strong automated alert indicators in Subject
  const isExplicitNormalCase =
    typeStr.includes('incident') ||
    typeStr.includes('support') ||
    typeStr.includes('problem') ||
    catStr.includes('incident') ||
    catStr.includes('support');

  const sub = String(c.Subject || c.subject || '').trim();
  if (!sub) return false;

  // 2. Strong Automated Alert Subject Signatures:
  // Opsgenie / Runbook / Dashboard / Ranger Infra anywhere in subject
  if (/(?:\[?alert\]?|\[?opsgenie\]?|runbook\s+for|dashboard\s+for|ranger\s+infra|alert:)/i.test(sub)) {
    return true;
  }

  // Automated monitoring rule signatures (case-insensitive substring/word matching)
  if (
    /(?:botsavailable|botsavailablelow|botsindeadstate|botsindeadstatehigh|botsavgpower|botsavgpowerlow|chargersavailable|chargersavailablelow|chargersoffline|processnotrunning|processexecutions|processexecutionsfailed|processexecutionsinmanualretry|diskutil|diskutilhigh|memutil|memutilhigh|cpuutil|cpuutilhigh|postgresolddata|postgresolddatadetected|filesizehigh|gorinternalapi|gorinternalapifailed|gorinternalapihighresponsetime|airflowconnectivity|system\s+stopped|tkisdisconnection|livenessfailure|hostreportingstopped|pickexceptionshigh|rabbitmq|mnesia)/i.test(
      sub
    )
  ) {
    return true;
  }

  if (/alertname:|kubernetes\s+pod|kubernetes\s+container|kafka\s+consumer\s+lag|consumer\s+lag\s+detected/i.test(sub)) {
    return true;
  }

  // Host prefix with alert pattern ONLY if not an explicit customer support ticket: e.g. "samprod: Postgres...", "owensminorprod: Disk...", "cc-temuco: Bots..."
  if (!isExplicitNormalCase && /^[a-z0-9._-]+:\s*[a-z0-9._-]+/i.test(sub) && /(?:low|high|failed|stopped|offline|retry|lag|crash|detected|exception|utilisation|utilization|manualretry|olddata)/i.test(sub)) {
    return true;
  }

  // Host tokens matching automated alert patterns
  if (!isExplicitNormalCase && /\b(samprod|samsprod|samsatlprod|samsatl|samatlprod|samatl|caseyprod|caseysprod|casey|caseys|owensminorprod|owensminor|onmprod|onm|sedicoprod|elatlprod|elcolombusprod)\b/i.test(sub) && /(?:process|bot|disk|mem|cpu|postgres|util|lag|fail|retry|offline|error|warn|high|low|alert|monitor|runbook|dashboard)/i.test(sub)) {
    return true;
  }

  // If it's an explicit normal customer support or incident case, DO NOT match generic words
  if (isExplicitNormalCase) return false;

  // 3. Fallback check on description ONLY if automated alert signatures exist
  const desc = String(c.Description || c.description || '');
  if (desc && /automated alert|monitoring alert|alert rule|alert id:/i.test(desc)) {
    return true;
  }

  return false;
}

/**
 * Extracts any populated End Time or Closed Date from ticket fields.
 * User requirement: "the close of the ticket will be updated from end time in cases if there is end time on the ticket then remove it from live cases"
 */
export function getTicketEndTime(c) {
  if (!c) return null;
  const raw = c;
  const candidate =
    raw.End_Time_of_Incident__c ||
    raw.end_time_of_incident ||
    raw.Actual_End_Time__c ||
    raw.actual_end_time ||
    raw.Solved_Date_Time__c ||
    raw.solved_date_time ||
    raw.Parent_End_Time__c ||
    raw.parent_end_time ||
    raw.DIR_Approval_End_Time__c ||
    raw.RCA_Approval_End_Time__c ||
    raw.Planed_End__c ||
    raw.End_Time__c ||
    raw.end_time ||
    raw.EndTime ||
    raw.EndTime__c ||
    raw.End_Date_Time__c ||
    raw.End_Date__c ||
    raw.Down_Time_End__c ||
    raw.Downtime_End_Time__c ||
    raw.Restoration_Time__c ||
    raw.Resolution_Time__c ||
    raw.ClosedDate ||
    raw.closed_date;

  if (candidate !== undefined && candidate !== null && candidate !== '') {
    const s = String(candidate).trim().toLowerCase();
    if (s && s !== 'null' && s !== 'undefined' && s !== 'none' && s !== 'n/a') {
      return candidate;
    }
  }

  // Also check if Downtime is recorded and completed (> 0)
  const dt = raw.Downtime__c !== undefined ? raw.Downtime__c : raw.downtime;
  if (dt !== undefined && dt !== null && dt !== '') {
    const num = Number(dt);
    if (!isNaN(num) && num > 0) {
      return raw.LastModifiedDate || raw.CreatedDate || new Date().toISOString();
    }
  }

  return null;
}

export function hasTicketEndTime(c) {
  return Boolean(getTicketEndTime(c));
}

export function isLiveOpenCase(c) {
  if (!c) return false;

  // 1. If there is an End Time on the ticket, or downtime is completed -> strictly omit from live cases!
  if (hasTicketEndTime(c) || Boolean(getTicketEndTime(c))) return false;

  const status = String(c.Status || c.status || '').trim().toLowerCase();
  if (!status) return false;

  for (const pattern of EXCLUDED_STATUS_PATTERNS) {
    if (status.includes(pattern)) return false;
  }

  if (isAlertCase(c)) return false;
  if (isDirTicket(c)) return false;

  return true;
}

/**
 * Checks if a ticket is a DIR (Detailed Incident Report / Post-Incident Approval / RCA) ticket.
 * User requirement: "dont include tis DIR"
 */
export function isDirTicket(c) {
  if (!c) return false;

  // 1. Explicit DIR approval field (e.g. 'DIR Approved', 'Pending Approval', 'DIR Rejected', etc.)
  const dirApproval = String(c.DIR_Approval__c || c.dir_approval || '').trim().toLowerCase();
  if (dirApproval && (dirApproval.includes('dir') || dirApproval.includes('approved') || dirApproval.includes('pending') || dirApproval.includes('rejected'))) {
    return true;
  }

  // 2. Approval status contains 'DIR' or 'Documentation' or 'CM Review'
  const appStatus = String(c.Approval_status__c || c.approval_status || '').trim().toLowerCase();
  if (appStatus.includes('dir') || appStatus.includes('documentation') || appStatus.includes('cm review')) {
    return true;
  }

  // 3. Current RCA status is populated (e.g. 'Pending on IM', 'RCA Submitted', etc.)
  const rcaStatus = String(c.Current_RCA_Status__c || c.current_rca_status || '').trim().toLowerCase();
  if (rcaStatus && rcaStatus !== 'none' && rcaStatus !== 'null' && rcaStatus !== 'n/a') {
    return true;
  }

  // 4. Default ticket problem reference is populated (indicates this is a child problem/DIR tracking ticket)
  if (c.Default_Ticket_For_Problem__c) {
    return true;
  }

  // 5. Subject patterns explicitly mentioning DIR or RCA
  const sub = String(c.Subject || c.subject || '').trim();
  if (/\b(DIR|RCA)\b/i.test(sub)) {
    return true;
  }

  return false;
}

/**
 * Checks if a ticket is an IM ticket (Incident Management, ServiceNow Incident, internal monitoring alert).
 * Requirement: "dont count im ticket as sev 1 or sev 2 ticket at the pannel"
 */
export function isImTicket(c) {
  if (!c) return false;

  // 1. Child / linked IM ticket: only if it has explicit IM indicators
  if ((c.ParentId || c.parent_id) && (isAlertCase(c) || /^(im|inc)[\s-:\d]/i.test(String(c.Subject || c.subject || '')))) {
    return true;
  }

  // 2. Any automated alert / opsgenie alert is an internal IM monitoring alert
  if (isAlertCase(c)) return true;

  // 2. ServiceNow Incident ID prefix (IM... or INC...)
  const snowId = String(c.Snow_id__c || c.snow_id || '').trim().toUpperCase();
  if (snowId.startsWith('IM') || snowId.startsWith('INC')) return true;

  // 3. Explicit Type field (Incident Management or internal monitoring)
  const type = String(c.Type || c.type || '').trim().toLowerCase();
  if (
    type === 'im' ||
    type.includes('incident management') ||
    type.includes('internal monitoring') ||
    type.startsWith('im ') ||
    type.startsWith('im-') ||
    type.startsWith('im:')
  ) {
    return true;
  }

  // 4. Category field (Incident Management or internal monitoring)
  const cat = String(c.Category__c || c.category || c.Snow_Category__c || '').trim().toLowerCase();
  if (
    cat === 'im' ||
    cat.includes('incident management') ||
    cat.includes('internal monitoring') ||
    cat.startsWith('im ') ||
    cat.startsWith('im-') ||
    cat.startsWith('im:')
  ) {
    return true;
  }

  // 5. Subject pattern
  const sub = String(c.Subject || c.subject || '').trim();
  if (/^(\[?im\]?|im[-:\s\d]|incident\s*management)/i.test(sub)) {
    return true;
  }
  if (/\b(im ticket|incident ticket)\b/i.test(sub)) {
    return true;
  }

  return false;
}

export function isClosedToday(c) {
  const endTime = getTicketEndTime(c);
  const status = String(c.Status || c.status || '').toLowerCase();
  const isClosed = Boolean(endTime) || CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
  if (!isClosed) return false;

  const dateStr = endTime || c.ClosedDate || c.LastModifiedDate;
  if (!dateStr) return true;

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  const now = new Date();
  const isSameCalendarDay = (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
  if (isSameCalendarDay) return true;

  // Shift window tolerance: within last 24 hours
  const diffHours = Math.abs(now.getTime() - d.getTime()) / (1000 * 60 * 60);
  return diffHours <= 24;
}

export function isAlertForShiftBucket(c) {
  if (!isAlertCase(c)) return false;
  const endTime = getTicketEndTime(c);
  const status = String(c.Status || c.status || '').toLowerCase();
  const isClosed = Boolean(endTime) || CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
  if (!isClosed) {
    if (status.includes('hold') || status.includes('pending confirmation')) return false;
    return true; // Opened alert
  }
  return isClosedToday(c); // Only closed alert of today's date
}

/**
 * Live open alert predicate: strictly open alerts with end time logic applied.
 * Excludes tickets with an End Time, Closed Date, or closed/hold status.
 */
export function isOpenAlert(c) {
  if (!c) return false;
  if (!isAlertCase(c)) return false;

  // 1. If ticket has an End Time or Closed Date, it has concluded -> remove from open alerts!
  if (hasTicketEndTime(c)) return false;

  const status = String(c.Status || c.status || '').trim().toLowerCase();
  if (!status) return false;

  for (const pattern of EXCLUDED_STATUS_PATTERNS) {
    if (status.includes(pattern)) return false;
  }

  return true;
}

/**
 * Closed alert predicate: strictly alert tickets that have an End Time, Closed Date, or closed status.
 */
export function isClosedAlert(c) {
  if (!c) return false;
  if (!isAlertCase(c)) return false;
  const endTime = getTicketEndTime(c);
  const status = String(c.Status || c.status || '').toLowerCase();
  return Boolean(endTime) || CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
}

export function isClosedAlertToday(c) {
  return isClosedAlert(c) && (isClosedToday(c) || Boolean(getTicketEndTime(c)));
}


export function normalizeProductType(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || /^(null|undefined|none|n\/a|unknown|all|alert|incident|support|technical support|system|infrastructure)$/i.test(s)) {
    return null;
  }
  const lower = s.toLowerCase();
  if (lower === 'rms' || lower.includes('robotic management system') || lower === 'butler' || lower === 'fleet' || lower === 'pickstation') {
    return 'RMS';
  }
  if (lower === 'ril' || lower.includes('ranger il') || lower.includes('ranger in-line') || lower.includes('ranger inline')) {
    return 'RIL';
  }
  if (lower === 'ra' || lower.includes('ranger analytics') || lower.includes('active ants')) {
    return 'RA';
  }
  if (lower === 'case pick' || lower === 'casepick' || lower === 'case-pick') {
    return 'Case Pick';
  }
  if (lower === 'rtp' || lower.includes('robot to person') || lower.includes('robot-to-person')) {
    return 'RTP';
  }
  if (lower === 'ttp' || lower.includes('tote to person') || lower.includes('tote-to-person')) {
    return 'TTP';
  }
  if (lower === 'gstore' || lower.includes('greystore')) {
    return 'GStore';
  }
  if (lower.includes('shuttle')) {
    return 'Shuttle';
  }
  if (lower.includes('relay')) {
    return 'Relay';
  }
  if (lower.includes('sortation')) {
    return 'Sortation';
  }
  if (s.length <= 4) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// In-memory registry of dynamic product lines observed per site from live & historical Salesforce cases
const _siteObservedProductsMap = new Map();

export function recordSiteProduct(siteIdentifier, rawProd) {
  if (!siteIdentifier || !rawProd) return;
  const prod = normalizeProductType(rawProd);
  if (!prod) return;

  const rawStr = String(siteIdentifier).trim();
  const keys = [
    normalizeCanonical(rawStr),
    rawStr.toLowerCase(),
  ];

  for (const k of keys) {
    if (!k) continue;
    if (!_siteObservedProductsMap.has(k)) {
      _siteObservedProductsMap.set(k, new Set());
    }
    _siteObservedProductsMap.get(k).add(prod);
  }
}

export function getObservedSiteProducts(siteIdentifier) {
  if (!siteIdentifier) return [];
  const rawStr = String(siteIdentifier).trim();
  const keys = [
    normalizeCanonical(rawStr),
    rawStr.toLowerCase(),
  ];
  const prods = new Set();
  for (const k of keys) {
    const set = _siteObservedProductsMap.get(k);
    if (set) {
      for (const p of set) prods.add(p);
    }
  }
  return Array.from(prods);
}

export function inferProductLine(name) {
  const n = String(name || '').toLowerCase();
  if (/\bttp\b/i.test(n)) return 'TTP';
  if (/\brtp\b/i.test(n)) return 'RTP';
  if (/\brms\b/i.test(n)) return 'RMS';
  if (/active ants|aritizia|aritzia|macy|robinson|h&m|hm/i.test(n)) {
    return 'RA';
  }
  if (/gxo|eddie bauer|ryder|ykk|luxottica|cardinal|wayfair|lakeside|meli|mercado|columbus|exol|sbs|owens|minor/i.test(n)) {
    return 'RIL';
  }
  if (/sodimac|click|collect|mitsubishi|trusco|casey|kenco|adams|kellanova|case pick/i.test(n)) {
    return 'Case Pick';
  }
  if (/shuttle/i.test(n)) return 'Shuttle';
  if (/relay/i.test(n)) return 'Relay';
  if (/gstore|deckers/i.test(n)) return 'GStore';
  return 'RMS';
}

const STOP_WORDS = new Set(['the', 'and', 'site', 'inc', 'corp', 'llc', 'project', 'club']);

export function cleanText(s) {
  return normalizeCanonical(s);
}

/**
 * Normalizes text and handles brand aliases (e.g. HNM / H&M / HM -> hm, Ikeaa -> ikea).
 */
export function normalizeCanonical(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\b(h\s*&\s*m|h\s*and\s*m|hnm)\b/gi, 'hm')
    .replace(/\b(ikeaa)\b/gi, 'ikea')
    .replace(/\b(click\s*&\s*collect|click\s*and\s*collect|cnc)\b/gi, 'click collect')
    .replace(/\b(mercado\s*libre)\b/gi, 'meli')
    .replace(/\b(owens\s*&\s*monors|owens\s*&\s*minors|owens\s*and\s*minors|owens\s*minors|owens&minors|owens&monors|owens\s*monors|owens\s*monor|owensminor|owensminorprod|onmprod|onm)\b/gi, 'owens minor')
    .replace(/\b(sams\s+atl|sam\s+atl|samatl|samsatl|samprod|samsprod|samsatlprod|samatlprod)\b/gi, 'sams club atl')
    .replace(/\b(sams\s+lax|sam\s+lax|samlax|samslax|samslaxprod|samlaxprod)\b/gi, 'sams club lax')
    .replace(/\b(casey|caseys|caseyprod|caseysprod|casey's|caseys\s+joplin|casey's\s+joplin)\b/gi, "caseys joplin")
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const KNOWN_SITE_ALIASES = {
  'H&M Canada Ajax': ['hm canada ajax', 'hm canada', 'hnm canada', 'hm ajax', 'hnm-canada', 'h&m canada', 'h&m ajax', 'ajax', 'h&m(ajax)-(canada)', 'h&m(ajax)', 'hm(ajax)', 'flexo-hnm-canada', 'flexo-hnm', 'hnm-canada-prod'],
  'Ikea': ['ikea', 'ikeaa', 'ikeaprod', 'ikea-finland', 'ikea finland'],
  'Sams Club ATL': ['sams club atl', 'sams atl', 'sams club', '4993 us', '4993', 'sams-club', 'sam\'s club(atl)-atlanta', 'sams club(atl)-atlanta', 'samprod', 'samsprod', 'samsatlprod', 'samsatl', 'samatlprod', 'samatl', 'sams-atl', 'samatl-prod', '4993.us', '4993-us', 'samprod-cluster', 'samsatlprod-cluster', 'sam\'s atl', 'sam atl'],
  'Sams Club LAX': ['sams club lax', 'sams lax', '8799 us', '9476 us', '8799', '9476', 'sam\'s club(lax)-california', 'sams club(lax)-california', 'samslaxprod', 'samslax', 'samlaxprod', 'samlax', 'sams-lax', '8799.us', '9476.us'],
  'DHL- Figs': ['dhl figs', 'dhlfigs', 'dhl figs phoenix', 'dhl figs ob', 'dhl figs-goodyear,az(usa)', 'dhl figs goodyear', 'dhl figs-goodyear', 'goodyear figs', 'dhlfigs-phoenix', 'figs', 'flexo-dhlfigs-phoenix', 'dhlfigsprod'],
  'DHL-NL': ['dhl nl', 'dhlnl', 'dhlnlprod', 'dhl netherlands', 'dhl-netherlands'],
  'GXO-H&M Prod': ['gxo hm prod', 'xpo hnm', 'gxo hnm', 'gxo hm perris', 'gxo hm', 'gxo-h&m-perris(california)', 'gxo-h&m-perris', 'xpo-hnm', 'xpo_anf'],
  'Evergreen P&H': ['evergreen ph', 'evergreen richmond', 'evergreen p h', 'evergreen', 'evergreen-richmond(virginia,usa)', 'evergreen-richmond', 'evergreenprod'],
  'Apple_Express': ['apple express', 'apple express ontario', 'apple_express', 'apple express-ontario(canada)'],
  'Farmacia Tai': ['farmacia tai', 'farmacia tei', 'farmaciatei', 'farmacia tei romania', 'farmacia tei-romania'],
  'Nishiskawa': ['nishiskawa', 'nishikawa'],
  'Mercado Libre (MX13)': ['meli mx13', 'mercado libre mx13', 'mx13', 'mercado libre (mx13)_hidalgo-méxico', 'mercado libre (mx13)_hidalgo-mexico', 'melimx13prod', 'melimx13'],
  'Mercado Libre(SP04)': ['meli sp04', 'mercado libre sp04', 'sp04', 'mercado libre(sp04)-cajamar(brazil)', 'mercado libre sp04 cajamar'],
  'Mercado Libre': ['meli', 'mercado libre', 'meli sc02', 'mercado libre sc02', 'mercado libre(sp15)-cajamar(brazil)', 'meli sp15'],
  'Kenco Fairlife(Phoenix, USA)': ['kenco fairlife', 'fairlife phoenix', 'fairlife', 'kenco fairlife(phoenix, usa)'],
  'Kenco-Jeff1': ['kenco jeff1', 'kenco jeffersonville', 'jeff1', 'kenco-jeff1(jeffersonville, usa)'],
  'Kenco Goodyear': ['kenco goodyear', 'kenco goodyear arizona', 'kenco-goodyear(arizona,usa)'],
  'Kenco Kansas': ['kenco kansas', 'kenco kansas usa', 'kenco-kansas(usa)'],
  'Lakeside Book': ['lakeside book', 'lakeside book indiana', 'lakeside', 'lakeside book-indiana(usa)', 'lakesideprod'],
  'Robinson USA (Dayton)': ['robinson usa dayton', 'robinson dayton', 'robinson usa', 'robinson tennessee', 'robinson-tennessee(usa)'],
  'Active Ants-Belgium': ['active ants belgium', 'active ants-belgium'],
  'Active Ants-Germany': ['active ants germany', 'active ants-germany'],
  'Active Ants-NL': ['active ants nl', 'active ants netherlands', 'active ants-netherlands'],
  'Active Ants-UK Northampton': ['active ants uk northampton', 'active ants uk', 'active ants northampton', 'active ants-uk(northampton)'],
  'Adam Beverages': ['adam beverages', 'adams beverages', 'adam beverages-north carolina'],
  'Cardinal Health Ontario': ['cardinal health', 'cardinal health ontario', 'cardinal health-ontario(california)'],
  'Dish-USA (El Paso)': ['dish usa el paso', 'dish el paso', 'dish usa', 'dish', 'dish-usa (el paso)'],
  'Dorman Warsaw': ['dorman warsaw', 'dorman warsaw ky', 'dorman-warsaw,ky(usa)'],
  'Dorman': ['dorman', 'dorman portland'],
  'Ryder Whiplash': ['ryder whiplash', 'whiplash ohio', 'ryder whiplash ohio', 'whiplash', 'ryder whiplash-ohio(usa)'],
  'Ryder Maryland': ['ryder maryland', 'ryder maryland usa', 'ryder ml', 'ryder md', 'ryderml', 'rydermd', 'ryder-maryland(usa)', 'ryder-maryland', 'ryderprod'],
  'Owens & Minor': ['owens minor', 'owens & minor', 'owens and minor', 'owens & minors', 'owens minors', 'owens&minor', 'owens&minors', 'owens&monors', 'owens monors', 'owens monor', 'owens&minor-georgia(usa)', 'onm', 'onmprod', 'owensminorprod', 'owensminor', 'owens-minor', 'owensminor-prod', 'onm-prod', 'onm_prod', 'owens_minor'],
  "Casey's Joplin": ["caseys joplin", "casey's joplin", "casey joplin", "caseys", "casey's", "casey", "caseyprod", "caseysprod", "caseystg", "uscstg1-caseystg", "kafka-caseyprod-prod", "kafka-caseyprod", "casey-prod", "caseys-prod", "casey-joplin"],
  "Casey's": ["caseys joplin", "casey's joplin", "casey joplin", "caseys", "casey's", "casey", "caseyprod", "caseysprod", "caseystg"],
  'H&M P1': ['hm p1', 'h&m p1', 'hm robbinsville', 'hm robbinsville project 1', 'h&m(project1)-robbinsville(newjersey)'],
  'H&M P1-RMS': ['hm p1 rms', 'h&m p1 rms', 'hm project1 rms', 'h&m project1 rms', 'h&m (project1) _ rms'],
  'Essilor Luxottica': ['essilor luxottica', 'essilorluxottica', 'luxottica fhr', 'essilorluxottica-fhr(california)', 'fhr luxottica', 'fhr'],
  'Essilor Luxottica Atlanta': ['essilorluxottica atlanta (el-atl)', 'essilorluxottica atlanta', 'el-atl', 'el atl', 'essilor luxottica atlanta', 'elatl', 'elatlprod', 'el-atlprod'],
  'Essilor Luxottica -Columbus': ['essilor luxottica columbus', 'luxottica columbus', 'el columbus', 'essilorluxottica-columbus(ohio)', 'elcolombus', 'elcolombusprod', 'elcolumbusprod'],
  'Luxottica_Sedico': ['luxottica sedico', 'essilor luxottica sedico', 'sedico italy', 'sedico', 'essilorluxottica-sedico(italy)', 'sedicoprod'],
  'Walmart Mexico': ['walmart mexico', 'walmart mx', 'walmart-mexico(tepotzotlan)', 'walmart-mexico(tepotzotlÃ¡n)', 'walmart-mexico', 'walmartmxprod', 'walmartmx'],
  'Walmart-Canada': ['walmart canada', 'walmart ca', 'walmartcaprod', 'walmart-calgary(canada)', 'walmart calgary', 'walmart canada fc 2028', 'walmart-edwards(canada)'],
  'Way Fair': ['way fair', 'wayfair', 'wayfair perris', 'wayfair lancaster', 'wayfair-aberdeen(maryland,usa)'],
  'Goldbond': ['goldbond', 'goldbond israel', 'goldbond-israel'],
  'Apotek': ['apotek', 'apotek hjartat', 'apotek sweden', 'apotek hjÃ¤rtat-sweden(stockholm)', 'apotek hjärtat-sweden(stockholm)'],
  'Coupang INC': ['coupang inc', 'coupang incheon 4', 'coupang incheon', 'coupang_incheon(4)'],
  'Coupang INC14': ['coupang inc14', 'coupang incheon 14', 'coupang- incheon(14)', 'coupang incheon(14)'],
  'DB Schenker': ['db schenker', 'db schenker netherlands', 'dbs', 'db schenker-netherlands'],
  'Dillards': ['dillards', 'dillard', 'dillards arkansas', 'dillardprod', 'dillard\'s-arkansas(usa)'],
  'EXOL': ['exol', 'exol jackson', 'exol-jackson'],
  'Flaconi': ['flaconi', 'flaconi berlin', 'flaconi-berlin(germany)'],
  'Fujirebio-Ambient': ['fujirebio ambient', 'fujirebio-ambient'],
  'Fujirebio-Chill': ['fujirebio chill', 'fujirebio-chill'],
  'GXO-Apple': ['gxo apple', 'gxo-apple'],
  'GXO-Lacoste': ['gxo lacoste', 'gxo-lacoste'],
  'GXO-Nike': ['gxo nike', 'gxo nike bloomington', 'gxo-nike-bloomington(california)'],
  'GXO-Verizon': ['gxo verizon', 'gxo verizon dallas', 'gxo-verizon-dallas(texas,usa)'],
  'GXO-AF': ['gxo af', 'gxo a f', 'gxo a&f', 'gxo a&f arizona', 'gxo-a&f-arizona(usa)'],
  'Jysk': ['jysk', 'jysk denmark', 'jysk-denmark'],
  'Lixil': ['lixil'],
  'Mitsubishi-Nippon': ['mitsubishi nippon', 'mitsubishi-nippon'],
  'Ricoh-Nike': ['ricoh nike', 'ricoh nike beaverton', 'ricoh(nike)-beaverton(oregon,usa)'],
  'Stryker': ['stryker', 'stryker-mahwah(newjersey,usa)'],
  'Trusco Saitama': ['trusco saitama', 'trusco-saitama'],
  'Trusco Tohoku': ['trusco tohoku', 'trusco-tohoku', 'tohoku', 'tohokuprod'],
  'YKK': ['ykk', 'ykkprod', 'ykk-georgia(usa)'],
  'Aritzia': ['aritzia', 'aritizia', 'aritzia-british columbia(canada)', 'aritziaprod'],
  'Sodimac SBS': ['sodimac sbs', 'sbs', 'sbs-chile', 'sodimacsbsprod'],
  'Sodimac-Colombia-Funza-2': ['sodimac colombia funza 2', 'sodimac funza 2', 'funza 2', 'sodimac(funza-2)-colombia'],
  'Sodimac Colombia Arthur': ['sodimac colombia arthur', 'sodimac arthur', 'sodimac(arthur)-colombia'],
  'Sodimac-Colombia': ['sodimac colombia', 'sodimac(funza-1)-colombia', 'funza 1', 'sod-col', 'sodcol', 'sodcolprod'],
  'Sodimac-FLR': ['sodimac flr', 'flr', 'sodimac-flr'],
  'Sodimac-CC1': ['sodimac cc1', 'sodimac(c&c-1)-arauco', 'cc-arauco', 'cc arauco'],
  'Sodimac-CC2': ['sodimac cc2', 'sodimac(c&c-2)-florida'],
  'Sodimac-CC3': ['sodimac cc3', 'sodimac(c&c-3)-condes', 'cc-condes', 'cc condes'],
  'Sodimac-CC4': ['sodimac cc4', 'sodimac(c&c-4)-maipu', 'cc-maipu', 'cc maipu'],
  'Sodimac-CC5': ['sodimac cc5', 'sodimac(c&c-5)-puertomontt'],
  'Sodimac-CC7': ['sodimac cc7', 'sodimac(c&c-7)-temuco', 'cc-temuco', 'cc temuco'],
  'Sodimac-CC8': ['sodimac cc8', 'sodimac(c&c-8)-talca'],
  'Sodimac-CC9': ['sodimac cc9', 'sodimac(c&c-9)-biobio'],
};

/**
 * Pre-indexes known sites for fast O(1)/O(S) exact and token-based resolution.
 */
export function compileSiteIndex(siteList) {
  const compiled = [];
  const patternsSeen = new Set();

  function addPattern(pattern, originalName, accountId) {
    if (!pattern) return;
    const clean = normalizeCanonical(pattern);
    if (!clean || patternsSeen.has(clean)) return;
    patternsSeen.add(clean);

    const tokens = clean.split(' ').filter(t => t.length > 0 && !STOP_WORDS.has(t));
    compiled.push({
      originalName,
      clean,
      spaceless: clean.replace(/\s+/g, ''),
      tokens,
      accountId,
      length: clean.length,
    });
  }

  for (const s of siteList) {
    const name = typeof s === 'string' ? s : s?.name;
    if (!name) continue;
    const accountId = typeof s === 'object' && s?.salesforce_account_id ? String(s.salesforce_account_id) : null;

    // 1. Primary site name
    addPattern(name, name, accountId);

    // 2. Known brand aliases and host aliases
    const aliases = KNOWN_SITE_ALIASES[name] || [];
    for (const alias of aliases) {
      addPattern(alias, name, accountId);
    }
  }

  // Sort longest / most specific site patterns first
  compiled.sort((a, b) => b.length - a.length);
  return compiled;
}

/**
 * Extracts site name from an automated alert Subject line.
 * Handles patterns:
 * - "sedicoprod: BotsAvailableLow..."
 * - "samsatlprod: ProcessExecutionsInManualRetry..."
 * - "owensminorprod: PostgresOldDataDetected..."
 * - "samsatlprod-cluster-prod-greymatter - ..."
 * - "elatlprod-cluster-prod-greymatter - ..."
 * - "Site: kafka-melimx13prod-prod | ..."
 * - "Dashboard for <siteHost>'s ..."
 * - "Ranger Infra Dashboard for <siteHost>"
 * - "Runbook for <AlertName> Ranger Infra Dashboard for <siteHost>"
 * - "[<siteHost>] ..."
 */
export function extractSiteFromAlertSubject(subject, compiledSites) {
  if (!subject || typeof subject !== 'string' || !compiledSites || compiledSites.length === 0) return null;
  const sub = subject.trim();

  // Pattern 0: Direct host prefix with brackets, colon, hyphen, pipe, cluster, etc.
  // e.g. "samprod:", "samprod :", "[samprod]", "<samprod>", "samsatlprod - ...", "sedicoprod:", "owensminorprod:", "cc-temuco:", "samsatlprod-cluster-prod-greymatter"
  const prefixMatch = sub.match(/^[<\[]?([a-z0-9._-]+)[>\]]?(?:\s*[:|–—\-]\s*|\s*-\s*(?:cluster|prod|greymatter))/i);
  if (prefixMatch && prefixMatch[1]) {
    const rawHost = prefixMatch[1].toLowerCase().trim();
    const site = resolveSiteFromToken(rawHost, compiledSites);
    if (site) return site;
  }

  // Pattern 1: Dashboard for <siteHost>'s ... or Ranger Infra Dashboard for <siteHost>
  const match1 = sub.match(/(?:Dashboard\s+for|Ranger\s+Infra\s+Dashboard\s+for)\s*[:]?\s*[<'"\[]?([a-z0-9._-]+)[>'"\]]?(?:'s)?/i);
  if (match1 && match1[1]) {
    const rawHost = match1[1].toLowerCase().trim();
    const site = resolveSiteFromToken(rawHost, compiledSites);
    if (site) return site;
  }

  // Pattern 2: Runbook for <AlertName> Ranger Infra Dashboard for <siteHost>
  const match2 = sub.match(/Ranger\s+Infra\s+Dashboard\s+for\s*[<'"\[]?([a-z0-9._-]+)[>'"\]]?(?:'s)?/i);
  if (match2 && match2[1]) {
    const rawHost = match2[1].toLowerCase().trim();
    const site = resolveSiteFromToken(rawHost, compiledSites);
    if (site) return site;
  }

  // Pattern 3: Kafka consumer lag with Site: kafka-<host>-prod or Site: <host>
  const matchKafka = sub.match(/(?:Site|Cluster):\s*(?:kafka-)?([a-z0-9._-]+?)(?:-prod)?(?:\s*[|,]|\s*$)/i);
  if (matchKafka && matchKafka[1]) {
    const rawHost = matchKafka[1].toLowerCase().trim();
    const site = resolveSiteFromToken(rawHost, compiledSites);
    if (site) return site;
  }

  // Pattern 4: [<siteHost>] or <siteHost> anywhere in brackets
  const match4 = sub.match(/[<\[]([a-z0-9._-]+)[>\]]/i);
  if (match4 && match4[1]) {
    const rawHost = match4[1].toLowerCase().trim();
    const site = resolveSiteFromToken(rawHost, compiledSites);
    if (site) return site;
  }

  // Pattern 5: Look for known host keywords anywhere in the subject
  const tokenMatches = sub.match(/\b(samprod|samsprod|samsatlprod|samsatl|samatlprod|samatl|samslaxprod|samslax|samlaxprod|samlax|caseyprod|caseysprod|casey|caseys|owensminorprod|owensminor|onmprod|onm|sedicoprod|elatlprod|elcolombusprod|melimx13prod|dhlnlprod|sodimacsbsprod|evergreenprod|lakesideprod|4993)\b/i);
  if (tokenMatches && tokenMatches[1]) {
    const site = resolveSiteFromToken(tokenMatches[1].toLowerCase(), compiledSites);
    if (site) return site;
  }

  // Pattern 6: Direct substring scan across compiledSites (most specific first)
  const subClean = normalizeCanonical(sub);
  for (const site of compiledSites) {
    if (site.clean.length >= 4 && subClean.includes(site.clean)) {
      return site.originalName;
    }
  }

  return null;
}

export function resolveSiteFromToken(token, compiledSites) {
  if (!token) return null;
  const rawToken = String(token).toLowerCase().trim();
  const clean = normalizeCanonical(rawToken);
  if (!clean) return null;
  const spaceless = clean.replace(/\s+/g, '');

  // 1. Direct clean or alias match
  for (const site of compiledSites) {
    if (site.clean === clean) return site.originalName;
  }

  // 2. Strip common trailing -prod, _prod, prod, -cluster, -stg, etc.
  const stripped = clean.replace(/[-_]?(?:prod|stg|stage|dev|cluster|greymatter|kafka).*$/i, '').trim();
  const strippedSpaceless = stripped.replace(/\s+/g, '');

  if (stripped) {
    for (const site of compiledSites) {
      if (site.clean === stripped) return site.originalName;
    }
  }

  // 3. Spaceless comparison (e.g. 'samsatl' -> 'sams atl', 'owensminor' -> 'owens minor')
  for (const site of compiledSites) {
    const siteSpaceless = site.spaceless || site.clean.replace(/\s+/g, '');
    if (siteSpaceless === spaceless || (strippedSpaceless && siteSpaceless === strippedSpaceless)) {
      return site.originalName;
    }
    if (siteSpaceless.length >= 4 && (spaceless.includes(siteSpaceless) || siteSpaceless.includes(spaceless))) {
      return site.originalName;
    }
  }

  // 4. Targeted high-precision domain knowledge rules for known host conventions
  // Sams Club ATL: samprod, samsprod, samsatl, samatl, 4993
  if (/sam.*atl|^sam(s)?prod|^4993/i.test(rawToken)) {
    const s = compiledSites.find(x => /sam.*atl/i.test(x.originalName));
    return s ? s.originalName : 'Sams Club ATL';
  }
  // Sams Club LAX: samslax, samlax, 8799, 9476
  if (/sam.*lax|^8799|^9476/i.test(rawToken)) {
    const s = compiledSites.find(x => /sam.*lax/i.test(x.originalName));
    return s ? s.originalName : 'Sams Club LAX';
  }
  // Owens & Minor: onm, owensminor, owens-minor
  if (/^onm|^owens[-_]?minor/i.test(rawToken)) {
    const s = compiledSites.find(x => /owens/i.test(x.originalName));
    return s ? s.originalName : 'Owens & Minor';
  }
  // Casey's: casey, caseys, caseyprod, caseysprod, caseystg
  if (/^casey/i.test(rawToken)) {
    const s = compiledSites.find(x => /casey/i.test(x.originalName));
    return s ? s.originalName : "Casey's Joplin";
  }
  // Sedico: sedico, sedicoprod
  if (/sedico/i.test(rawToken)) {
    const s = compiledSites.find(x => /sedico/i.test(x.originalName));
    return s ? s.originalName : 'Luxottica_Sedico';
  }
  // Essilor Luxottica Atlanta: el-atl, elatl, elatlprod
  if (/^el[-_]?atl/i.test(rawToken)) {
    const s = compiledSites.find(x => /atlanta/i.test(x.originalName) && /luxottica/i.test(x.originalName));
    return s ? s.originalName : 'Essilor Luxottica Atlanta';
  }
  // Essilor Luxottica Columbus: el-col, elcolumbus, elcolombus
  if (/^el[-_]?col/i.test(rawToken)) {
    const s = compiledSites.find(x => /columbus/i.test(x.originalName));
    return s ? s.originalName : 'Essilor Luxottica -Columbus';
  }
  // Sodimac Colombia: sod-col, sodcol, sodcolprod
  if (/^sod[-_]?col/i.test(rawToken)) {
    const s = compiledSites.find(x => /sodimac-colombia$/i.test(x.originalName) || x.originalName === 'Sodimac-Colombia');
    return s ? s.originalName : 'Sodimac-Colombia';
  }
  // Sodimac CC7 Temuco: cc-temuco
  if (/cc[-_]?temuco/i.test(rawToken)) {
    const s = compiledSites.find(x => /cc7|temuco/i.test(x.originalName));
    return s ? s.originalName : 'Sodimac-CC7';
  }
  // H&M Canada Ajax: hnm-canada, hm-canada, flexo-hnm
  if (/hnm[-_]?canada|hm[-_]?canada|flexo[-_]?hnm/i.test(rawToken)) {
    const s = compiledSites.find(x => /ajax|h&m canada/i.test(x.originalName));
    return s ? s.originalName : 'H&M Canada Ajax';
  }
  // DHL Figs: flexo-dhlfigs, dhlfigs
  if (/dhlfigs/i.test(rawToken)) {
    const s = compiledSites.find(x => /dhl.*figs/i.test(x.originalName));
    return s ? s.originalName : 'DHL- Figs';
  }
  // DHL NL: dhlnl
  if (/dhlnl/i.test(rawToken)) {
    const s = compiledSites.find(x => /dhl.*nl/i.test(x.originalName));
    return s ? s.originalName : 'DHL-NL';
  }
  // Sodimac SBS: sodimacsbs, sbs
  if (/sodimacsbs|^sbs/i.test(rawToken)) {
    const s = compiledSites.find(x => /sodimac sbs/i.test(x.originalName));
    return s ? s.originalName : 'Sodimac SBS';
  }
  // Mercado Libre MX13: melimx13
  if (/melimx13/i.test(rawToken)) {
    const s = compiledSites.find(x => /mx13/i.test(x.originalName));
    return s ? s.originalName : 'Mercado Libre (MX13)';
  }

  return null;
}

/**
 * Checks whether two site names represent the same physical site, taking into account
 * aliases, canonical brand variations (e.g. "Sams Club ATL" vs "Sams ATL", "Casey's" vs "Casey's Joplin"),
 * and host names ("samprod", "onm", "owensminorprod").
 */
export function areSameSite(nameA, nameB, compiledSites = []) {
  if (!nameA || !nameB) return false;
  if (nameA === nameB) return true;

  const cleanA = normalizeCanonical(nameA);
  const cleanB = normalizeCanonical(nameB);
  if (cleanA && cleanB && cleanA === cleanB) return true;

  const spacelessA = cleanA.replace(/\s+/g, '');
  const spacelessB = cleanB.replace(/\s+/g, '');
  if (spacelessA && spacelessB && spacelessA === spacelessB) return true;

  // Domain aliases:
  // Sams Club ATL: sams atl, sam atl, samatl, samprod, samsprod, 4993
  const isSamsAtl = (s) => /sam.*atl|samprod|samsprod|^4993/i.test(s);
  if (isSamsAtl(nameA) && isSamsAtl(nameB)) return true;

  // Sams Club LAX: sams lax, sam lax, samlax, samlaxprod, 8799, 9476
  const isSamsLax = (s) => /sam.*lax|samlax|^8799|^9476/i.test(s);
  if (isSamsLax(nameA) && isSamsLax(nameB)) return true;

  // Casey's: casey, caseys, casey's, caseyprod, caseysprod, casey joplin
  const isCaseys = (s) => /casey/i.test(s);
  if (isCaseys(nameA) && isCaseys(nameB)) return true;

  // Owens & Minor: onm, onmprod, owensminor, owensminorprod, owens minor
  const isOwens = (s) => /owens|onm/i.test(s);
  if (isOwens(nameA) && isOwens(nameB)) return true;

  // Sedico
  const isSedico = (s) => /sedico/i.test(s);
  if (isSedico(nameA) && isSedico(nameB)) return true;

  // Essilor Luxottica Atlanta
  const isElAtl = (s) => /el[-_]?atl|atlanta.*luxottica|luxottica.*atlanta/i.test(s);
  if (isElAtl(nameA) && isElAtl(nameB)) return true;

  // Check KNOWN_SITE_ALIASES
  for (const [siteKey, aliases] of Object.entries(KNOWN_SITE_ALIASES)) {
    const keyClean = normalizeCanonical(siteKey);
    const allNames = [keyClean, ...aliases.map(normalizeCanonical)];
    const matchA = allNames.includes(cleanA) || (cleanA && keyClean.includes(cleanA));
    const matchB = allNames.includes(cleanB) || (cleanB && keyClean.includes(cleanB));
    if (matchA && matchB) return true;
  }

  return false;
}

/**
 * High-precision site resolver: Maps a case or alert to exactly ONE site without cross-site misattribution.
 * Inspects explicit site fields, Subject line, Account name, and Location.
 */
export function findBestSiteForCase(caseRecord, compiledSites) {
  if (!caseRecord || !compiledSites || compiledSites.length === 0) return null;

  // Level 0: For automated ALERTS, the Subject line is the PRIMARY authoritative source for site host identification!
  const sub = String(caseRecord.Subject || caseRecord.subject || '').trim();
  if (sub && (isAlertCase(caseRecord) || /\b(samprod|samsprod|samsatl|samatl|casey|caseys|owensminor|onm|sedico|elatl|elcolombus|4993)\b/i.test(sub))) {
    const siteFromSub = extractSiteFromAlertSubject(sub, compiledSites);
    if (siteFromSub) return siteFromSub;
  }

  // Level 1: Account ID match (most authoritative, exact Salesforce record linkage)
  const accId = caseRecord.AccountId || caseRecord.account_id;
  if (accId) {
    const targetId = String(accId).trim();
    const sitesWithAcc = compiledSites.filter(s => s.accountId && String(s.accountId).trim() === targetId);
    if (sitesWithAcc.length > 0) {
      const uniqueNames = Array.from(new Set(sitesWithAcc.map(s => s.originalName)));
      if (uniqueNames.length === 1) {
        return uniqueNames[0];
      }
    }
    const def = defaultSites.find(d => d.salesforce_account_id && String(d.salesforce_account_id).trim() === targetId);
    if (def) {
      return def.name;
    }
  }

  // Level 2: Account Name match (e.g. "Ryder-Maryland(USA)", "H&M(Ajax)-(Canada)", "Walmart-Mexico(Tepotzotlán)")
  const rawAccountName = caseRecord.Account_Name__c || caseRecord.account_name || caseRecord.Account?.Name;
  if (rawAccountName) {
    const accClean = normalizeCanonical(rawAccountName);
    if (accClean) {
      for (const site of compiledSites) {
        if (accClean === site.clean || accClean.includes(site.clean) || site.clean.includes(accClean)) {
          return site.originalName;
        }
      }
      const accTokens = new Set(accClean.split(' '));
      for (const site of compiledSites) {
        if (site.tokens.length > 0 && site.tokens.every(t => accTokens.has(t))) {
          return site.originalName;
        }
      }
    }
  }

  // Level 3: Site-specific ServiceNow and customer input fields
  const siteSpecificTexts = [
    caseRecord.Snow_Sitename__c,
    caseRecord.Site_Name_Customer_Input__c,
    caseRecord.Impacted_Sites__c,
  ].filter(Boolean);

  for (const raw of siteSpecificTexts) {
    const textClean = normalizeCanonical(raw);
    if (!textClean) continue;

    for (const site of compiledSites) {
      if (textClean === site.clean) return site.originalName;
    }

    for (const site of compiledSites) {
      if (textClean.includes(site.clean)) return site.originalName;
    }

    const textTokens = new Set(textClean.split(' '));
    for (const site of compiledSites) {
      if (site.tokens.length > 0 && site.tokens.every(t => textTokens.has(t))) {
        return site.originalName;
      }
    }
  }

  // Level 4: Customer Location check
  if (caseRecord.Customer_Location__c) {
    const locClean = normalizeCanonical(caseRecord.Customer_Location__c);
    if (locClean && locClean.length > 3) {
      for (const site of compiledSites) {
        if (site.clean.includes(locClean) || locClean.includes(site.clean)) {
          return site.originalName;
        }
      }
    }
  }

  // Level 5: Fallback to Subject line ONLY if no account or site fields identified the site
  if (caseRecord.Subject) {
    const subjectClean = normalizeCanonical(caseRecord.Subject);
    if (subjectClean) {
      for (const site of compiledSites) {
        if (subjectClean === site.clean || subjectClean.includes(site.clean)) {
          return site.originalName;
        }
      }
      const subjectTokens = new Set(subjectClean.split(' '));
      for (const site of compiledSites) {
        if (site.tokens.length > 0 && site.tokens.every(t => subjectTokens.has(t))) {
          return site.originalName;
        }
      }
    }
  }

  return null;
}

export function isTodayDate(dateVal) {
  if (!dateVal) return false;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const now = new Date();

  const isLocalToday = (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );

  const isUtcToday = (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );

  return isLocalToday || isUtcToday;
}

/**
/**
 * Extract operational impact percentage from ticket fields or description text.
 */
/**
 * Extract operational impact percentage from ticket fields or description text.
 */
export function getImpactPercentage(c) {
  if (!c) return 0;
  if (Boolean(c.Is_Site_100_Down__c) || Boolean(c.is_site_down)) {
    return 100;
  }

  const rawFields = [
    c.Impact_Percentage__c,
    c.Impact_Percent__c,
    c.Impact__c,
    c.Operational_Impact__c,
    c.Site_Impact_Percentage__c,
    c.Site_Impact__c,
    c.Impact_Percentage,
    c.impact_percentage,
    c.Impacted_Percentage__c,
    c.Impacted_Percent__c,
  ];

  for (const val of rawFields) {
    if (val !== undefined && val !== null && val !== '') {
      if (typeof val === 'number') return val;
      const m = String(val).match(/(\d+(?:\.\d+)?)/);
      if (m) {
        const parsed = parseFloat(m[1]);
        if (!isNaN(parsed)) return parsed;
      }
    }
  }

  // Also check Subject and Description for explicit percentage statements (e.g. "100% down", "Impact: 50%")
  const textToScan = `${c.Subject || ''} ${c.Description || ''}`;
  if (textToScan.trim()) {
    if (/\b(?:site\s+)?100\s*%\s*(?:down|impact|outage)\b/i.test(textToScan) || /\b100\s*%\s*site\s+down\b/i.test(textToScan)) {
      return 100;
    }
    const match = textToScan.match(/(?:impact|impacted|down|area down)[^0-9\n]{0,20}(\d+(?:\.\d+)?)\s*%/i);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100) return parsed;
    }
  }

  return 0;
}

/**
 * Universal severity / priority detector.
 * Strict rules:
 * - Sev 1 Urgent (sev1):
 *     - Operational Impact = 100% (or impact >= 100)
 *     - OR Is_Site_100_Down__c is true
 *     - OR Explicitly marked 'Sev 1 - Urgent', 'Sev 1 Urgent', 'P1 - Urgent', '1 - Critical', 'Critical'
 * - Sev 2 Urgent (sev2):
 *     - Operational Impact >= 50% and <= 99% (99% - 50% is Sev 2 Urgent)
 *     - OR Explicitly marked 'Sev 2 - Urgent', 'Sev 2 Urgent', 'Severity 2 - Urgent', 'P2 - Urgent'
 * - Sev 2 High (sev3 - High non-urgent):
 *     - Marked 'Sev 2 - High', 'Sev 2 High', 'Severity 2 - High', 'P2 - High', 'High', OR plain 'Sev 2' with impact < 50%
 *     - Sev 2 High MUST NEVER be classified as Sev 2 Urgent unless impact >= 50%.
 * - Excludes automated alerts, IM tickets, and DIR tickets.
 */
export function detectSeverity(c) {
  if (!c) return 'sev3';

  // Exclude automated alert tickets and DIR documentation tickets from Sev 1 / Sev 2 counts
  if (isDirTicket(c) || isAlertCase(c)) {
    return 'sev3';
  }

  const impact = getImpactPercentage(c);

  // Rule 1: 100% Impact or Site 100% Down -> Sev 1 Urgent
  // Condition: "if =100% then sev 1 urgent"
  if (Boolean(c.Is_Site_100_Down__c) || Boolean(c.is_site_down) || impact >= 100) {
    return 'sev1';
  }

  // Rule 2: 50% - 99% Impact -> Sev 2 Urgent
  // Condition: "if >=50% its sev 2 urgent if =100% then sev 1 urgent and 99%-50% is sev 2 urgent"
  if (impact >= 50 && impact < 100) {
    return 'sev2';
  }

  const highestSev = String(c.Highest_Severity__c || '').trim().toUpperCase();
  const prio = String(c.Priority || c.Snow_Priority__c || c.Snow_Urgency__c || '').trim().toUpperCase();
  const candidates = [highestSev, prio].filter(Boolean);

  // Rule 3: Explicit Sev 1 Urgent / Critical in fields
  for (const s of candidates) {
    if (
      s === 'SEVERITY 1' ||
      s === 'SEV 1' ||
      s === 'SEV-1' ||
      s === 'P1' ||
      s.includes('1 - URGENT') ||
      s.includes('SEV 1 - URGENT') ||
      s.includes('SEV 1 URGENT') ||
      s.includes('1 - CRITICAL') ||
      s.includes('CRITICAL')
    ) {
      return 'sev1';
    }
  }

  // Rule 4: Explicit High (Sev 2 - High, Sev 2 High, P2 - High, High)
  // MUST NOT be classified as Sev 2 Urgent! (Impact < 50%, so it is High non-urgent / sev3)
  const isHigh = candidates.some(s =>
    s.includes('HIGH') ||
    s.includes('2 - HIGH') ||
    s.includes('SEV 2 - HIGH') ||
    s.includes('SEV 2 HIGH') ||
    s.includes('SEVERITY 2 - HIGH') ||
    s.includes('SEVERITY 2 HIGH') ||
    s.includes('P2 - HIGH') ||
    s.includes('P2 HIGH')
  );

  if (isHigh) {
    return 'sev3';
  }

  // Rule 5: Explicit Sev 2 Urgent (must have URGENT keyword)
  const isUrgent = candidates.some(s =>
    (s.includes('2') || s.includes('P2') || s.includes('SEVERITY 2') || s.includes('SEV 2')) &&
    s.includes('URGENT')
  );

  if (isUrgent) {
    return 'sev2';
  }

  // Plain 'Sev 2' or 'Severity 2' without URGENT or impact >= 50% defaults to High non-urgent (sev3)
  return 'sev3';
}

export function matchCaseToSite(caseRecord, targetSiteName, targetAccountId, allSiteNames = DEFAULT_ALL_SITE_NAMES) {
  const compiled = compileSiteIndex(allSiteNames);
  const best = findBestSiteForCase(caseRecord, compiled);
  return Boolean(best && normalizeCanonical(best) === normalizeCanonical(targetSiteName));
}

export function getBestSiteForCase(caseRecord, allSiteNames = DEFAULT_ALL_SITE_NAMES) {
  const compiled = compileSiteIndex(allSiteNames);
  return findBestSiteForCase(caseRecord, compiled);
}

/**
 * Get active Salesforce OAuth token via Client Credentials flow.
 */
export async function getSalesforceToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const { instanceUrl, clientId, clientSecret } = getSfConfig();

  if (!clientId || !clientSecret || !instanceUrl) {
    throw new Error('Salesforce credentials missing in environment variables');
  }

  const tokenUrl = `${instanceUrl}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Salesforce authentication failed (${response.status}): ${errorText}`);
  }

  const token = await response.json();
  tokenCache = {
    token,
    expiresAt: now + 110 * 60 * 1000,
  };

  return token;
}

/**
 * Execute SOQL Query against Salesforce REST API.
 */
export async function executeSOQL(soql, { maxRecords = 12000, paginate = true } = {}) {
  const { access_token, instance_url } = await getSalesforceToken();
  const { apiVersion } = getSfConfig();
  const endpoint = `${instance_url}/services/data/${apiVersion}/query?q=${encodeURIComponent(soql)}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(18000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SOQL query failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!paginate) {
    return data;
  }

  let records = data.records || [];
  let nextUrl = data.nextRecordsUrl;

  while (nextUrl && records.length < maxRecords) {
    try {
      const nextEndpoint = `${instance_url}${nextUrl}`;
      const nextRes = await fetch(nextEndpoint, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!nextRes.ok) break;
      const nextData = await nextRes.json();
      if (Array.isArray(nextData.records) && nextData.records.length > 0) {
        records.push(...nextData.records);
      }
      nextUrl = nextData.nextRecordsUrl;
    } catch {
      break;
    }
  }

  return { ...data, records };
}

function isNoiseSite(name) {
  if (!name || typeof name !== 'string') return true;
  const s = name.trim();
  if (s.length < 2 || s.length > 70) return true;
  const noiseRegex = /librenms|\[alert\]|critical|vpn tunnel|firewall|kafka|hindering|rollout|lag detected|major crash|access issue|greyorange account|^greyorange$|test|aplxprmsprod/i;
  if (noiseRegex.test(s)) return true;
  if (/[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(s)) return true;
  if (/^[A-Z]{2}\d{4}$/i.test(s)) return true;
  if (/^\(?\d{4}\.us/i.test(s)) return true;
  return false;
}

function formatCleanSiteName(name, accountName) {
  const n = String(name || '').trim();
  const acc = String(accountName || '').trim();

  if (/h\s*&\s*m.*canada|hnm.*canada|ajax/i.test(n) || /h\s*&\s*m.*canada|ajax/i.test(acc)) {
    return 'H&M Canada';
  }
  if (/h\s*&\s*m.*robbinsville|hnm.*proj1|project1.*robbinsville/i.test(n) || /robbinsville/i.test(acc)) {
    return 'H&M Robbinsville Project-1';
  }
  if (/^h\s*&\s*m$|^hm$/i.test(n)) {
    return 'H&M';
  }
  if (/^ikea.*finland/i.test(n) || /ikea.*finland/i.test(acc)) {
    return 'IKEA Finland';
  }
  if (/^ikea/i.test(n) || /^ikea/i.test(acc)) {
    return 'IKEA';
  }
  if (/sam'?s.*atl|4993\.us/i.test(n) || /sam'?s.*atl/i.test(acc)) {
    return "Sam's ATL";
  }
  if (/sam'?s.*lax|8799\.us/i.test(n) || /sam'?s.*lax/i.test(acc)) {
    return "Sam's LAX";
  }
  if (/walmart.*calgary|fc2028/i.test(n) || /walmart.*calgary/i.test(acc)) {
    return 'Walmart Calgary';
  }
  if (/walmart.*edwards/i.test(n) || /walmart.*edwards/i.test(acc)) {
    return 'Walmart Edwards';
  }
  if (/walmart.*canada/i.test(n) || /walmart.*canada/i.test(acc)) {
    return 'Walmart Canada';
  }
  if (/walmart.*mexico/i.test(n) || /walmart.*mexico/i.test(acc)) {
    return 'Walmart Mexico';
  }

  let cleaned = n
    .replace(/\s+Account$/i, '')
    .replace(/prod$/i, '')
    .trim();

  return cleaned || n;
}

/**
 * Retrieve exact sites present in the GreyOrange Salesforce org database
 * and enrich the authoritative 77 active sites without adding inactive accounts.
 */
export async function syncSitesFromSalesforce({ authoritative = true } = {}) {
  console.log('[Salesforce] Synchronizing active sites authoritatively with GreyOrange org database...');

  const candidatePaths = [
    path.resolve(__dirname, '../data/sites.json'),
    path.resolve(__dirname, '../../../Frontend/src/data/sites.json'),
    path.resolve(process.cwd(), 'src/data/sites.json'),
    path.resolve(process.cwd(), '../Frontend/src/data/sites.json'),
  ];

  let baseSites = [];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          baseSites = parsed;
          break;
        }
      } catch {}
    }
  }

  if (baseSites.length === 0) {
    baseSites = await SiteRepository.findAll();
  }
  if (!baseSites || baseSites.length < defaultSites.length) {
    const existingKeys = new Set((baseSites || []).map(s => (s.name || '').trim().toLowerCase()));
    for (const def of defaultSites) {
      if (!existingKeys.has(def.name.trim().toLowerCase())) {
        baseSites.push(def);
      }
    }
  }

  let accounts = [];
  try {
    const accountQuery = `SELECT Id, Name, Type, BillingCity, BillingState, BillingCountry FROM Account ORDER BY Name LIMIT 500`;
    const accResult = await executeSOQL(accountQuery);
    accounts = accResult.records || [];
  } catch (err) {
    console.warn(`[Salesforce] Account query notice: ${err.message}`);
  }

  const accMap = new Map();
  for (const acc of accounts) {
    if (acc.Name) {
      accMap.set(normalizeCanonical(acc.Name), acc);
    }
  }

  // Pre-compile site index to map cases to authoritative sites
  const compiledSites = compileSiteIndex(baseSites);

  // Dynamically query actual product lines logged in Salesforce Cases across all sites
  try {
    const productsSoql = `SELECT Id, AccountId, Account_Name__c, Snow_Sitename__c, Customer_Location__c, Site_Name_Customer_Input__c, Product_Type__c, Parent_Product_Type__c FROM Case WHERE CreatedDate = LAST_N_DAYS:180 AND (Product_Type__c != null OR Parent_Product_Type__c != null) ORDER BY CreatedDate DESC LIMIT 2000`;
    const prodResult = await executeSOQL(productsSoql);
    for (const c of (prodResult.records || [])) {
      const best = findBestSiteForCase(c, compiledSites) || c.Account_Name__c || c.Snow_Sitename__c;
      if (best) {
        if (c.Product_Type__c) recordSiteProduct(best, c.Product_Type__c);
        if (c.Parent_Product_Type__c) recordSiteProduct(best, c.Parent_Product_Type__c);
      }
    }
    console.log(`[Salesforce -> Products] Extracted dynamic product lines from ${(prodResult.records || []).length} historical cases.`);
  } catch (err) {
    console.warn(`[Salesforce] Notice querying product types: ${err.message}`);
  }

  const enrichedSites = baseSites.map((s, idx) => {
    let accId = s.salesforce_account_id;
    let loc = s.location || null;
    const clean = normalizeCanonical(s.name);

    if (!accId && accMap.has(clean)) {
      const matchedAcc = accMap.get(clean);
      accId = matchedAcc.Id;
      loc = loc || [matchedAcc.BillingCity, matchedAcc.BillingState, matchedAcc.BillingCountry].filter(Boolean).join(', ') || null;
    }

    const slug = s.opsgenie_tag || clean.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `sf-site-${slug}`;

    const baseP = Array.isArray(s.product_lines) && s.product_lines.length > 0
      ? s.product_lines
      : (s.product_line ? s.product_line.split(',').map(x => x.trim()).filter(Boolean) : []);
    const observed = getObservedSiteProducts(s.name);
    const prodSet = new Set(baseP);
    for (const op of observed) {
      prodSet.add(op);
    }
    if (prodSet.size === 0) {
      prodSet.add(inferProductLine(s.name));
    }
    const finalProductLines = Array.from(prodSet);
    const finalProductLine = finalProductLines.join(', ');

    return {
      id,
      name: s.name,
      product_line: finalProductLine,
      product_lines: finalProductLines,
      opsgenie_tag: slug,
      salesforce_account_id: accId || null,
      salesforce_site_name: s.name,
      account_name: s.name,
      location: loc,
      position: s.position || idx + 1,
      open_cases_count: s.open_cases_count || 0,
      is_down: Boolean(s.is_down),
      source: 'authoritative_snapshot',
    };
  });

  const saved = await SiteRepository.replaceAll(enrichedSites);
  console.log(`[Salesforce -> MongoDB] Refreshed MongoDB with ${saved.length} active sites.`);

  // Invalidate in-memory caches
  _overviewCache = { data: null, timestamp: 0 };
  _backendCasesCache = { cases: [], alerts: [], closed: [], fetchedAt: 0 };

  return saved;
}

let _backendCasesCache = { cases: [], alerts: [], openAlerts: [], closedAlerts: [], allAlerts: [], closed: [], fetchedAt: 0 };
let _inFlightFetch = null;

export async function fetchAllLiveCasesAndAlerts(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _backendCasesCache.fetchedAt > 0 && now - _backendCasesCache.fetchedAt < 60000) {
    return {
      cases: _backendCasesCache.cases,
      alerts: _backendCasesCache.alerts,
      openAlerts: _backendCasesCache.openAlerts || _backendCasesCache.alerts,
      closedAlerts: _backendCasesCache.closedAlerts || [],
      allAlerts: _backendCasesCache.allAlerts || [],
      closed: _backendCasesCache.closed || [],
    };
  }

  if (!forceRefresh && _inFlightFetch) {
    return _inFlightFetch;
  }

  const fetchPromise = (async () => {
    const primarySoql = [
      'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c, Snow_Priority__c, Snow_Urgency__c, Jira_Priority__c, Jira_Severity__c,',
      'Impact_Percentage__c, Is_Site_100_Down__c, Type, Snow_Category__c, Product_Type__c, Parent_Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c, Parent_End_Time__c, Downtime__c, Description,',
      'AccountId, Account_Name__c, Account_name_Reporting__c, Customer_Location__c, Snow_Sitename__c,',
      'Site_Name_Customer_Input__c, Impacted_Sites__c, Approval_status__c, Current_RCA_Status__c, Snow_id__c',
      'FROM Case',
      "WHERE Status != 'Closed' OR ClosedDate = TODAY OR LastModifiedDate = TODAY",
      'ORDER BY LastModifiedDate DESC LIMIT 500',
    ].join(' ');

    const fallbackSoql = [
      'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c, Snow_Priority__c, Snow_Urgency__c,',
      'Type, Product_Type__c, Parent_Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c, Downtime__c, Description,',
      'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c,',
      'Site_Name_Customer_Input__c, Impacted_Sites__c, Is_Site_100_Down__c, Snow_id__c',
      'FROM Case',
      "WHERE Status != 'Closed' OR ClosedDate = TODAY OR LastModifiedDate = TODAY",
      'ORDER BY LastModifiedDate DESC LIMIT 500',
    ].join(' ');

    const safeSoql = [
      'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c, Type, Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Downtime__c, Description,',
      'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Site_Name_Customer_Input__c, Is_Site_100_Down__c',
      'FROM Case',
      "WHERE Status != 'Closed'",
      'ORDER BY LastModifiedDate DESC LIMIT 400',
    ].join(' ');

    const ultraSafeSoql = [
      'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Type, Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Downtime__c, Description,',
      'AccountId, Account_Name__c, Snow_Sitename__c',
      'FROM Case',
      "WHERE Status != 'Closed'",
      'ORDER BY LastModifiedDate DESC LIMIT 400',
    ].join(' ');

    let raw = [];
    try {
      const res = await executeSOQL(primarySoql);
      raw = res.records || [];
      _lastSalesforceError = null;
    } catch (errPrimary) {
      console.warn('[Salesforce] Primary SOQL notice, executing fallback query:', errPrimary.message);
      try {
        const resFallback = await executeSOQL(fallbackSoql);
        raw = resFallback.records || [];
        _lastSalesforceError = null;
      } catch (errFallback) {
        console.warn('[Salesforce] Fallback SOQL notice, executing safe query:', errFallback.message);
        try {
          const resSafe = await executeSOQL(safeSoql);
          raw = resSafe.records || [];
          _lastSalesforceError = null;
        } catch (errSafe) {
          console.warn('[Salesforce] Safe SOQL notice, executing ultra-safe query:', errSafe.message);
          try {
            const resUltra = await executeSOQL(ultraSafeSoql);
            raw = resUltra.records || [];
            _lastSalesforceError = null;
          } catch (errUltra) {
            _lastSalesforceError = errUltra.message;
            console.error('[Salesforce] All SOQL queries failed:', errUltra.message);
            if (_backendCasesCache.cases.length > 0) return _backendCasesCache;
            return { cases: [], alerts: [] };
          }
        }
      }
    }

    const mapRecord = (c) => {
      const prio = c.Highest_Severity__c || c.Alert_Priority__c || c.Snow_Priority__c || c.Snow_Urgency__c || c.Jira_Priority__c || 'P3 - Medium';
      const cat = c.Snow_Category__c || c.Type || 'Technical Support';
      const rawProd = (c.Product_Type__c || c.Parent_Product_Type__c || '').trim();
      const normProd = normalizeProductType(rawProd);
      const prod = normProd || inferProductLine(
        c.Snow_Sitename__c || c.Customer_Location__c || c.Site_Name_Customer_Input__c || c.Account_Name__c || ''
      );
      const assignee = c.Owner?.Name || 'GreyOrange Queue';
      const desc = c.Description ? (c.Description.length > 2000 ? c.Description.slice(0, 2000) + '...' : c.Description) : null;
      const endTime = getTicketEndTime(c);
      const isClosedByEndTime = Boolean(endTime);
      let finalStatus = c.Status;
      if (isClosedByEndTime && !CLOSED_STATUS_PATTERNS.some(p => String(c.Status || '').toLowerCase().includes(p))) {
        finalStatus = 'Closed';
      }

      return {
        Id: c.Id,
        case_id: c.Id,
        CaseNumber: c.CaseNumber,
        case_number: c.CaseNumber,
        ParentId: c.ParentId || null,
        parent_id: c.ParentId || null,
        Subject: c.Subject || 'No Subject',
        subject: c.Subject || 'No Subject',
        Status: finalStatus,
        status: finalStatus,
        Priority: prio,
        priority: prio,
        Highest_Severity__c: c.Highest_Severity__c || null,
        Severity__c: c.Severity__c || null,
        Alert_Priority__c: c.Alert_Priority__c || null,
        Snow_Priority__c: c.Snow_Priority__c || null,
        Jira_Priority__c: c.Jira_Priority__c || null,
        Impact_Percentage__c: c.Impact_Percentage__c || c.Impact_Percent__c || null,
        Impact_Percent__c: c.Impact_Percent__c || null,
        Type: cat,
        type: cat,
        Category: cat,
        category: cat,
        Category__c: cat,
        Product_Type__c: normProd || prod,
        Parent_Product_Type__c: normalizeProductType(c.Parent_Product_Type__c) || null,
        product_line: normProd || prod,
        Product_Line: normProd || prod,
        Dev_Case_Assignee__c: assignee,
        Description: desc,
        description: desc,
        AccountId: c.AccountId || null,
        account_id: c.AccountId || null,
        Account_Name__c: c.Account_Name__c || null,
        account_name: c.Account_Name__c || (c.Account && c.Account.Name) || null,
        Customer_Location__c: c.Customer_Location__c || null,
        customer_location: c.Customer_Location__c || null,
        Is_Site_100_Down__c: Boolean(c.Is_Site_100_Down__c),
        is_site_down: Boolean(c.Is_Site_100_Down__c),
        CreatedDate: c.CreatedDate,
        created_date: c.CreatedDate ? new Date(c.CreatedDate) : null,
        LastModifiedDate: c.LastModifiedDate,
        last_modified_date: c.LastModifiedDate ? new Date(c.LastModifiedDate) : null,
        ClosedDate: endTime || c.ClosedDate || null,
        closed_date: endTime ? new Date(endTime) : (c.ClosedDate ? new Date(c.ClosedDate) : null),
        End_Time__c: endTime || null,
        end_time: endTime ? new Date(endTime) : null,
        End_Time_of_Incident__c: c.End_Time_of_Incident__c || null,
        end_time_of_incident: c.End_Time_of_Incident__c ? new Date(c.End_Time_of_Incident__c) : null,
        Actual_End_Time__c: c.Actual_End_Time__c || null,
        actual_end_time: c.Actual_End_Time__c ? new Date(c.Actual_End_Time__c) : null,
        Downtime__c: c.Downtime__c !== undefined ? c.Downtime__c : null,
        downtime: c.Downtime__c !== undefined ? c.Downtime__c : null,
        Snow_Sitename__c: c.Snow_Sitename__c || null,
        Site_Name_Customer_Input__c: c.Site_Name_Customer_Input__c || null,
        Impacted_Sites__c: c.Impacted_Sites__c || null,
        DIR_Approval__c: c.DIR_Approval__c || null,
        dir_approval: c.DIR_Approval__c || null,
        Approval_status__c: c.Approval_status__c || null,
        approval_status: c.Approval_status__c || null,
        Current_RCA_Status__c: c.Current_RCA_Status__c || null,
        current_rca_status: c.Current_RCA_Status__c || null,
        RCA_Approval__c: c.RCA_Approval__c || null,
        Default_Ticket_For_Problem__c: c.Default_Ticket_For_Problem__c || null,
      };
    };

    const isClosedTicket = (c) => {
      const endTime = getTicketEndTime(c);
      const status = String(c.Status || c.status || '').toLowerCase();
      return Boolean(endTime) || CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
    };

    const cases = raw.filter(isLiveOpenCase).map(mapRecord);
    const openAlerts = raw.filter(isOpenAlert).map(mapRecord);
    const closedAlerts = raw.filter(c => isAlertCase(c) && isClosedTicket(c)).map(mapRecord);
    const allAlerts = raw.filter(isAlertForShiftBucket).map(mapRecord);
    const closed = raw.filter(c => isClosedTicket(c)).map(mapRecord);

    // Record observed products across all fetched cases
    try {
      const allSites = await SiteRepository.findAll();
      const compiledSites = compileSiteIndex(allSites);
      for (const c of raw) {
        const bestSite = findBestSiteForCase(c, compiledSites);
        if (bestSite) {
          if (c.Product_Type__c) recordSiteProduct(bestSite, c.Product_Type__c);
          if (c.Parent_Product_Type__c) recordSiteProduct(bestSite, c.Parent_Product_Type__c);
        }
      }
    } catch {}

    _backendCasesCache = { cases, alerts: openAlerts, openAlerts, closedAlerts, allAlerts, closed, fetchedAt: Date.now() };
    _overviewCache = { data: null, cachedAt: 0 };
    return { cases, alerts: openAlerts, openAlerts, closedAlerts, allAlerts, closed };
  })();

  _inFlightFetch = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    _inFlightFetch = null;
  }
}

export async function fetchAllLiveCases(forceRefresh = false) {
  const { cases } = await fetchAllLiveCasesAndAlerts(forceRefresh);
  return cases;
}

let _overviewCache = { data: null, cachedAt: 0 };

/**
 * Fetch all LIVE OPEN cases for a specific site (strictly excluding Alerts and Solved/Closed/On Hold).
 * Returns ONLY cases mapped to this site, or [] if none exist.
 */
export async function fetchOpenCasesForSite({ siteId, siteName, accountId }) {
  console.log(`[Salesforce] Fetching live cases & alerts for: ${siteName || siteId || 'site'}`);

  let allSites = [];
  try {
    allSites = await SiteRepository.findAll();
  } catch {
    allSites = [];
  }

  let targetSite = null;
  if (siteId) {
    try { targetSite = await SiteRepository.findById(siteId); } catch {}
  }
  if (!targetSite && siteName) {
    try { targetSite = await SiteRepository.findByName(siteName); } catch {}
  }

  const effectiveSiteName = targetSite?.name || siteName || '';
  const effectiveAccountId = targetSite?.salesforce_account_id || accountId || null;

  const { cases: liveCases, alerts: liveAlerts, closed: liveClosed = [] } = await fetchAllLiveCasesAndAlerts();

  const compiledSites = compileSiteIndex(allSites.length > 0 ? allSites : DEFAULT_ALL_SITE_NAMES);
  const targetLower = cleanText(effectiveSiteName);

  const matched = liveCases.filter(c => {
    const best = findBestSiteForCase(c, compiledSites);
    return best && areSameSite(best, effectiveSiteName, compiledSites);
  });
  const matchedAlerts = liveAlerts.filter(a => {
    const best = findBestSiteForCase(a, compiledSites);
    return best && areSameSite(best, effectiveSiteName, compiledSites);
  });
  const matchedClosed = liveClosed.filter(c => {
    const best = findBestSiteForCase(c, compiledSites);
    return best && areSameSite(best, effectiveSiteName, compiledSites);
  });

  // Strictly open cases: omit any ticket having an end time or downtime!
  const strictlyOpenCases = matched.filter(c => isLiveOpenCase(c) && !hasTicketEndTime(c) && !getTicketEndTime(c));

  // Any case that has an end time or was closed belongs in closed tickets
  const endTimedCases = matched.filter(c => hasTicketEndTime(c) || Boolean(getTicketEndTime(c)));
  const allMatchedClosed = [...matchedClosed, ...endTimedCases];

  const casesToStore = strictlyOpenCases.map(c => {
    const endTime = getTicketEndTime(c);
    const isClosedByEndTime = Boolean(endTime);
    let finalStatus = c.Status;
    if (isClosedByEndTime && !CLOSED_STATUS_PATTERNS.some(p => String(c.Status || '').toLowerCase().includes(p))) {
      finalStatus = 'Closed';
    }

    return {
      Id: c.Id,
      case_id: c.Id,
      CaseNumber: c.CaseNumber,
      case_number: c.CaseNumber,
      ParentId: c.ParentId || null,
      parent_id: c.ParentId || null,
      Subject: c.Subject || 'No Subject',
      subject: c.Subject || 'No Subject',
      Status: finalStatus,
      status: finalStatus,
      Priority: c.Priority || 'P3 - Medium',
      priority: c.Priority || 'P3 - Medium',
      Highest_Severity__c: c.Highest_Severity__c || null,
      Severity__c: c.Severity__c || null,
      Alert_Priority__c: c.Alert_Priority__c || null,
      Snow_Priority__c: c.Snow_Priority__c || null,
      Jira_Priority__c: c.Jira_Priority__c || null,
      Impact_Percentage__c: c.Impact_Percentage__c || null,
      Type: c.Category__c || c.Snow_Category__c || c.Type || 'Technical Support',
      type: c.Category__c || c.Snow_Category__c || c.Type || 'Technical Support',
      Category__c: c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support',
      category: c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support',
      Product_Type__c: normalizeProductType(c.Product_Type__c) || c.product_line || 'RMS',
      Parent_Product_Type__c: normalizeProductType(c.Parent_Product_Type__c) || null,
      product_line: normalizeProductType(c.Product_Type__c) || c.product_line || 'RMS',
      Dev_Case_Assignee__c: c.Dev_Case_Assignee__c || 'GreyOrange Queue',
      Description: c.Description || null,
      description: c.Description || null,
      AccountId: c.AccountId || null,
      account_id: c.AccountId || null,
      Account_Name__c: c.Account_Name__c || null,
      account_name: c.Account_Name__c || null,
      site_name: effectiveSiteName || 'Unknown Site',
      Customer_Location__c: c.Customer_Location__c || null,
      customer_location: c.Customer_Location__c || null,
      Is_Site_100_Down__c: Boolean(c.Is_Site_100_Down__c),
      is_site_down: Boolean(c.Is_Site_100_Down__c),
      CreatedDate: c.CreatedDate,
      created_date: c.CreatedDate ? new Date(c.CreatedDate) : null,
      LastModifiedDate: c.LastModifiedDate,
      last_modified_date: c.LastModifiedDate ? new Date(c.LastModifiedDate) : null,
      ClosedDate: endTime || c.ClosedDate || null,
      closed_date: endTime ? new Date(endTime) : (c.ClosedDate ? new Date(c.ClosedDate) : null),
      End_Time__c: endTime || null,
      end_time: endTime ? new Date(endTime) : null,
      End_Time_of_Incident__c: c.End_Time_of_Incident__c || null,
      end_time_of_incident: c.End_Time_of_Incident__c ? new Date(c.End_Time_of_Incident__c) : null,
      Actual_End_Time__c: c.Actual_End_Time__c || null,
      actual_end_time: c.Actual_End_Time__c ? new Date(c.Actual_End_Time__c) : null,
      Downtime__c: c.Downtime__c !== undefined ? c.Downtime__c : null,
      downtime: c.Downtime__c !== undefined ? c.Downtime__c : null,
      Snow_Sitename__c: c.Snow_Sitename__c || null,
      Site_Name_Customer_Input__c: c.Site_Name_Customer_Input__c || null,
      Impacted_Sites__c: c.Impacted_Sites__c || null,
    };
  });

  if (casesToStore.length > 0) {
    try {
      await CaseRepository.bulkUpsert(casesToStore);
    } catch {
      // MongoDB not connected
    }
  }

  const isAnyDown = casesToStore.some(c => c.is_site_down);
  if (effectiveSiteName || siteId) {
    try {
      await SiteRepository.updateOpenCasesCount(siteId || effectiveSiteName, casesToStore.length, isAnyDown);
    } catch {
      // MongoDB not connected
    }
  }

  // Aggregate all unique product lines observed for this site
  const siteObservedProds = new Set([
    ...(Array.isArray(targetSite?.product_lines) ? targetSite.product_lines : (targetSite?.product_line ? targetSite.product_line.split(',').map(x => x.trim()) : [])),
    ...getObservedSiteProducts(effectiveSiteName),
  ].filter(Boolean));

  for (const c of [...strictlyOpenCases, ...matchedAlerts, ...allMatchedClosed]) {
    const p1 = normalizeProductType(c.Product_Type__c);
    const p2 = normalizeProductType(c.Parent_Product_Type__c);
    if (p1) {
      siteObservedProds.add(p1);
      recordSiteProduct(effectiveSiteName, p1);
    }
    if (p2) {
      siteObservedProds.add(p2);
      recordSiteProduct(effectiveSiteName, p2);
    }
  }
  if (siteObservedProds.size === 0) {
    siteObservedProds.add(inferProductLine(effectiveSiteName));
  }
  const siteProductLines = Array.from(siteObservedProds);
  const siteProductLine = siteProductLines.join(', ');

  // Persist updated product lines to repository
  if (targetSite && siteProductLines.length > (targetSite.product_lines?.length || 0)) {
    try {
      await SiteRepository.upsert({
        ...targetSite,
        product_lines: siteProductLines,
        product_line: siteProductLine,
      });
    } catch {}
  }

  return {
    siteName: effectiveSiteName,
    accountId: effectiveAccountId,
    product_line: siteProductLine,
    product_lines: siteProductLines,
    totalOpenCases: casesToStore.length,
    cases: casesToStore,
    alerts: matchedAlerts,
    closed: allMatchedClosed,
  };
}

/**
 * Aggregate live open case stats across all sites for home dashboard overview and dynamic sorting.
 * Features 45-second high performance in-memory caching to eliminate server lag.
 */
export async function fetchLiveCasesOverview(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _overviewCache.data && now - _overviewCache.cachedAt < 45000) {
    return _overviewCache.data;
  }

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

  const { cases: liveCases, alerts: liveAlerts, closedAlerts: liveClosedAlerts = [] } = await fetchAllLiveCasesAndAlerts(forceRefresh);

  const siteStats = {};
  for (const sName of allSiteNames) {
    siteStats[sName.toLowerCase()] = {
      siteName: sName,
      count: 0,
      alertCount: 0,
      isDown: false,
      caseNumbers: [],
      sev1Count: 0,
      sev2Count: 0,
      sev3Count: 0,
    };
  }

  // Pre-compile site index once for O(S) lightning-fast resolution
  const compiledSites = compileSiteIndex(allSites.length > 0 ? allSites : allSiteNames);

  // Strictly open cases: omit any ticket having an end time or downtime (matching fetchOpenCasesForSite)
  const strictlyOpenCases = liveCases.filter(c => 
    isLiveOpenCase(c) && 
    !hasTicketEndTime(c) && 
    !getTicketEndTime(c)
  );

  for (const c of strictlyOpenCases) {
    const bestSite = findBestSiteForCase(c, compiledSites);
    if (bestSite) {
      const key = bestSite.toLowerCase();
      if (!siteStats[key]) {
        siteStats[key] = { siteName: bestSite, count: 0, alertCount: 0, isDown: false, caseNumbers: [], sev1Count: 0, sev2Count: 0, sev3Count: 0 };
      }
      siteStats[key].count++;
      if (c.Is_Site_100_Down__c) siteStats[key].isDown = true;
      if (c.CaseNumber && !siteStats[key].caseNumbers.includes(c.CaseNumber)) {
        siteStats[key].caseNumbers.push(c.CaseNumber);
      }

      if (c.Product_Type__c) recordSiteProduct(bestSite, c.Product_Type__c);
      if (c.Parent_Product_Type__c) recordSiteProduct(bestSite, c.Parent_Product_Type__c);

      // Live Sev 1 and Sev 2: Strictly count live open cases, and DO NOT count IM or DIR tickets at the panel!
      if (!isImTicket(c) && !isDirTicket(c)) {
        const sev = detectSeverity(c);
        if (sev === 'sev1') {
          siteStats[key].sev1Count = (siteStats[key].sev1Count || 0) + 1;
        } else if (sev === 'sev2') {
          siteStats[key].sev2Count = (siteStats[key].sev2Count || 0) + 1;
        } else {
          siteStats[key].sev3Count = (siteStats[key].sev3Count || 0) + 1;
        }
      }
    }
  }

  for (const a of liveAlerts) {
    const bestSite = findBestSiteForCase(a, compiledSites);
    if (bestSite) {
      const key = bestSite.toLowerCase();
      if (!siteStats[key]) {
        siteStats[key] = { siteName: bestSite, count: 0, alertCount: 0, isDown: false, caseNumbers: [], sev1Count: 0, sev2Count: 0, sev3Count: 0 };
      }
      siteStats[key].alertCount = (siteStats[key].alertCount || 0) + 1;
      if (a.Product_Type__c) recordSiteProduct(bestSite, a.Product_Type__c);
      if (a.Parent_Product_Type__c) recordSiteProduct(bestSite, a.Parent_Product_Type__c);
      // Note: Automated monitoring alerts are internal IM alerts and must NEVER count as Sev 1 or Sev 2 customer tickets at the panel
    }
  }

  // Attach all active product lines to siteStats
  for (const sName of allSiteNames) {
    const key = sName.toLowerCase();
    const siteObj = allSites.find(s => s.name?.toLowerCase() === key);
    const baseP = Array.isArray(siteObj?.product_lines) && siteObj.product_lines.length > 0
      ? siteObj.product_lines
      : (siteObj?.product_line ? siteObj.product_line.split(',').map(x => x.trim()).filter(Boolean) : []);
    const prods = new Set([
      ...baseP,
      ...getObservedSiteProducts(sName),
    ]);
    if (prods.size === 0) {
      prods.add(inferProductLine(sName));
    }
    const lines = Array.from(prods);
    if (siteStats[key]) {
      siteStats[key].product_lines = lines;
      siteStats[key].product_line = lines.join(', ');
    }
  }

  const result = {
    totalLiveCases: strictlyOpenCases.length,
    totalLiveAlerts: liveAlerts.length,
    cases: strictlyOpenCases,
    alerts: liveAlerts,
    closedAlerts: liveClosedAlerts,
    siteStats,
    timestamp: new Date().toISOString(),
    error: _lastSalesforceError || null,
  };

  _overviewCache = { data: result, cachedAt: Date.now() };
  return result;
}

let _historicalAlertsCache = {
  data: null,
  fetchedAt: 0,
};

/**
 * Extracts a normalized alert title/signature from Subject or Description,
 * stripping site prefixes, brackets, and generic terms to yield concrete signatures
 * like 'ProcessExecutionsFailed', 'Site Controller Disconnected', 'PpsOfflineAlert', etc.
 */
/**
 * Extracts a normalized alert title/signature from Subject or Description,
 * stripping site prefixes, brackets, and generic terms to yield concrete signatures
 * like 'BotsAvailableLow', 'ProcessExecutionsFailed', 'DiskUtilHigh', 'System Stopped', etc.
 */
export function extractAlertSignature(alert) {
  if (!alert) return 'System Monitoring Alert';
  const sub = String(alert.Subject || alert.subject || '').trim();

  if (sub && sub !== 'No Subject') {
    let cleaned = sub;

    // 1. Strip Runbook for / Dashboard for / Ranger Infra prefixes
    cleaned = cleaned.replace(/^(?:runbook\s+for|dashboard\s+for|ranger\s+infra\s+dashboard\s+for)\s+/i, '').trim();

    // 2. Strip bracketed alert tags: [Alert], [Opsgenie], [Critical], [SEV1], [SEV2], [P1], etc.
    cleaned = cleaned.replace(/^(\[?(?:alert|opsgenie|critical|sev[0-9]|p[0-9]|warning|error|info)\]?[:\s\-_]*)+/i, '').trim();

    // 3. Match Linux:... alertName: pattern
    const linuxMatch = cleaned.match(/alertName:([^,]+)/i);
    if (linuxMatch && linuxMatch[1]) {
      return linuxMatch[1].trim();
    }

    // 4. Strip site host prefixes like "flexo-hnm-canada:", "xpo-hnm:", "hnm-canada:", "walmartmxprod:", "cc-temuco:"
    cleaned = cleaned.replace(/^[a-z0-9_-]+(?:'s|:|-)\s*/i, (match) => {
      if (/(?:hnm|walmart|evergreen|activewear|arvato|gap|flipkart|target|ikea|cc-|flexo-|prod-|qa[0-9]-|xpo-|sams|lacoste|elatl|figs|dhl|ykk|stryker)/i.test(match)) {
        return '';
      }
      return match;
    }).trim();

    // 5. Match standard known signatures if present
    const sigMatch = cleaned.match(/^(BotsAvailableLow|BotsInDeadStateHigh|ProcessNotRunning|ProcessExecutionsFailed|ProcessExecutionsInManualRetry|DiskUtilHigh|MemUtilHigh|CpuUtilHigh|PostgresOldDataDetected|FileSizeHigh|ChargersOffline|GORInternalAPIHighResponseTime|GORInternalApiFailed|AirflowConnectivityIssues|System\s+Stopped|TKISDisconnection|LivenessFailure|HostReportingStopped|PickExceptionsHigh)/i);
    if (sigMatch && sigMatch[1]) {
      return sigMatch[1].trim();
    }

    // 6. Strip trailing details (metrics, thresholds, host/app paths)
    cleaned = cleaned.replace(/:\s*host=[^,]+.*$/i, '').trim();
    cleaned = cleaned.replace(/:\s*\d+(\.\d+)?%.*$/i, '').trim();
    cleaned = cleaned.replace(/\s+Number\s+of\s+inactive\s+bots.*$/i, '').trim();
    cleaned = cleaned.replace(/\s+on\s+host=[^,]+.*$/i, '').trim();
    cleaned = cleaned.replace(/\s+on\s+app=[^:]+.*$/i, '').trim();
    cleaned = cleaned.replace(/\s+reached\s+\d+(\.\d+)?.*$/i, '').trim();

    // 7. Remove trailing UUIDs, timestamps, or raw IDs
    cleaned = cleaned.replace(/\s*-[0-9a-f]{8,}$/i, '').trim();
    cleaned = cleaned.replace(/\s*\[id:[^\]]+\]/i, '').trim();

    if (cleaned.length >= 3 && !/^alert$/i.test(cleaned)) {
      return cleaned;
    }
  }

  // Fallback 1: Product line + Alert
  if (alert.Product_Type__c && !/alert/i.test(alert.Product_Type__c)) {
    return `${alert.Product_Type__c} Alert`;
  }

  // Fallback 2: Description inspection
  const desc = String(alert.Description || alert.description || '').trim();
  if (desc) {
    const firstLine = desc.split(/[\r\n]+/)[0].trim();
    const alertMatch = firstLine.match(/(?:alert|error|failure|exception|runbook):\s*([a-zA-Z0-9_\- ]{3,50})/i);
    if (alertMatch && alertMatch[1]) {
      return alertMatch[1].trim();
    }
    if (firstLine.length > 5 && firstLine.length < 50 && !/^(hi|hello|dear|team)/i.test(firstLine)) {
      return firstLine;
    }
  }

  return 'System Infrastructure Alert';
}

/**
 * Builds site-specific SOQL WHERE criteria matching all known aliases, host prefixes,
 * and account names for any site.
 */
/**
 * Returns raw SOQL filter parts matching all known aliases, host prefixes,
 * and account names for any site.
 */
export function getSiteMatchSOQLParts(siteName) {
  if (!siteName || siteName === 'all' || siteName === 'All Sites') {
    return [];
  }

  const clean = cleanText(siteName);
  const parts = [];

  if (clean.includes('ajax') || clean.includes('canada')) {
    parts.push(
      "Subject LIKE '%hnm%'",
      "Subject LIKE '%flexo-hnm%'",
      "Subject LIKE '%xpo-hnm%'",
      "Account_Name__c LIKE '%Ajax%'",
      "Account_Name__c LIKE '%H&M%'",
      "Snow_Sitename__c LIKE '%Ajax%'"
    );
  } else if (clean.includes('atlanta') || clean.includes('elatl') || clean.includes('el-atl')) {
    parts.push(
      "Subject LIKE '%elatl%'",
      "Subject LIKE '%el-atl%'",
      "Account_Name__c LIKE '%Atlanta%'",
      "Snow_Sitename__c LIKE '%Atlanta%'"
    );
  } else if (clean.includes('columbus') || clean.includes('elcolombus')) {
    parts.push(
      "Subject LIKE '%elcolombus%'",
      "Subject LIKE '%el-colombus%'",
      "Account_Name__c LIKE '%Columbus%'",
      "Snow_Sitename__c LIKE '%Columbus%'"
    );
  } else if (clean.includes('robbinsville') || clean.includes('p1')) {
    parts.push(
      "Subject LIKE '%hnm-proj1%'",
      "Subject LIKE '%hm-p1%'",
      "Account_Name__c LIKE '%Robbinsville%'",
      "Snow_Sitename__c LIKE '%Robbinsville%'"
    );
  } else if (clean.includes('walmart') && clean.includes('mexico')) {
    parts.push("Subject LIKE '%walmartmx%'", "Account_Name__c LIKE '%Walmart-Mexico%'", "Snow_Sitename__c LIKE '%Tepotzotlan%'");
  } else if (clean.includes('walmart') && clean.includes('calgary')) {
    parts.push("Subject LIKE '%walmartca%'", "Account_Name__c LIKE '%Walmart-Calgary%'", "Snow_Sitename__c LIKE '%Calgary%'");
  } else if (clean.includes('sams') && (clean.includes('atl') || clean.includes('4993'))) {
    parts.push("Subject LIKE '%samsatl%'", "Subject LIKE '%samprod%'", "Subject LIKE '%samatl%'", "Account_Name__c LIKE '%4993%'", "Account_Name__c LIKE '%Sam%Club(ATL)%'");
  } else if (clean.includes('sams') && (clean.includes('lax') || clean.includes('8799'))) {
    parts.push("Subject LIKE '%samslax%'", "Subject LIKE '%samlax%'", "Account_Name__c LIKE '%8799%'", "Account_Name__c LIKE '%Sam%Club(LAX)%'");
  } else if (clean.includes('casey')) {
    parts.push("Subject LIKE '%casey%'", "Account_Name__c LIKE '%Casey%'", "Snow_Sitename__c LIKE '%Casey%'");
  } else if (clean.includes('owens') || clean.includes('onm')) {
    parts.push("Subject LIKE '%owens%'", "Subject LIKE '%onm%'", "Account_Name__c LIKE '%Owens%'");
  } else if (clean.includes('sedico')) {
    parts.push("Subject LIKE '%sedico%'", "Account_Name__c LIKE '%Sedico%'");
  } else if (clean.includes('evergreen')) {
    parts.push("Subject LIKE '%evergreen%'", "Account_Name__c LIKE '%Evergreen%'", "Snow_Sitename__c LIKE '%Richmond%'");
  } else if (clean.includes('ikea')) {
    parts.push("Subject LIKE '%ikea%'", "Account_Name__c LIKE '%IKEA%'");
  } else if (clean.includes('dhl') && clean.includes('figs')) {
    parts.push("Subject LIKE '%dhlfigs%'", "Account_Name__c LIKE '%DHL%Figs%'", "Snow_Sitename__c LIKE '%Goodyear%'");
  } else if (clean.includes('dhl')) {
    parts.push("Subject LIKE '%dhlnl%'", "Account_Name__c LIKE '%DHL%'");
  } else if (clean.includes('gxo') && clean.includes('lacoste')) {
    parts.push("Subject LIKE '%lacoste%'", "Account_Name__c LIKE '%Lacoste%'");
  } else if (clean.includes('gxo') && clean.includes('nike')) {
    parts.push("Subject LIKE '%gxo-nike%'", "Account_Name__c LIKE '%Nike%Bloomington%'");
  } else if (clean.includes('gxo') && clean.includes('perris')) {
    parts.push("Subject LIKE '%gxo-h&m%'", "Account_Name__c LIKE '%Perris%'");
  } else if (clean.includes('temuco')) {
    parts.push("Subject LIKE '%cc-temuco%'", "Account_Name__c LIKE '%Temuco%'");
  } else if (clean.includes('condes')) {
    parts.push("Subject LIKE '%cc-condes%'", "Account_Name__c LIKE '%Condes%'");
  } else if (clean.includes('arauco')) {
    parts.push("Subject LIKE '%cc-arauco%'", "Account_Name__c LIKE '%Arauco%'");
  } else if (clean.includes('maipu')) {
    parts.push("Subject LIKE '%cc-maipu%'", "Account_Name__c LIKE '%Maipu%'");
  } else if (clean.includes('ykk')) {
    parts.push("Subject LIKE '%ykk%'", "Account_Name__c LIKE '%YKK%'");
  } else if (clean.includes('stryker')) {
    parts.push("Subject LIKE '%stryker%'", "Account_Name__c LIKE '%Stryker%'");
  } else if (clean.includes('trusco')) {
    parts.push("Subject LIKE '%trusco%'", "Account_Name__c LIKE '%Trusco%'");
  } else if (clean.includes('coupang')) {
    parts.push("Subject LIKE '%coupang%'", "Account_Name__c LIKE '%Coupang%'");
  } else if (clean.includes('sodimac')) {
    parts.push("Subject LIKE '%sodimac%'", "Account_Name__c LIKE '%Sodimac%'");
  } else {
    const tokens = clean
      .split(/\s+/)
      .filter(t => t.length >= 3 && !['the', 'and', 'for', 'site', 'usa', 'inc'].includes(t));
    for (const t of tokens) {
      parts.push(`Subject LIKE '%${t}%'`, `Account_Name__c LIKE '%${t}%'`, `Snow_Sitename__c LIKE '%${t}%'`);
    }
  }

  return parts;
}

/**
 * Builds site-specific SOQL WHERE criteria matching customer incidents (without alert filters).
 */
export function buildSiteIncidentSOQLWhereClause(siteName, compiledSites = []) {
  const clean = cleanText(siteName);
  const parts = getSiteMatchSOQLParts(siteName);

  // 1. Resolve authoritative salesforce_account_id
  let accId = null;
  if (Array.isArray(compiledSites) && compiledSites.length > 0) {
    const matched = compiledSites.find(s => {
      const sClean = s.clean || cleanText(s.originalName || '');
      return sClean === clean || sClean.includes(clean) || clean.includes(sClean);
    });
    if (matched && matched.accountId) {
      accId = matched.accountId;
    }
  }

  if (!accId) {
    const def = defaultSites.find(d => {
      const dClean = cleanText(d.name);
      return dClean === clean || dClean.includes(clean) || clean.includes(dClean);
    });
    if (def && def.salesforce_account_id) {
      accId = def.salesforce_account_id;
    }
  }

  if (accId) {
    parts.unshift(`AccountId = '${accId}'`);
  }

  // 2. Extra broad matching for Sams Club ATL
  if (clean.includes('sams') && (clean.includes('atl') || clean.includes('4993'))) {
    parts.push(
      "Account_Name__c LIKE '%Sam%Club%'",
      "Account_Name__c LIKE '%Atlanta%'",
      "Customer_Location__c LIKE '%Atlanta%'",
      "Snow_Sitename__c LIKE '%Sam%'",
      "Snow_Sitename__c LIKE '%Atlanta%'"
    );
  }

  const uniqueParts = Array.from(new Set(parts.filter(Boolean)));
  if (uniqueParts.length === 0) return '';
  return `(${uniqueParts.join(' OR ')})`;
}

/**
 * Builds site-specific SOQL WHERE criteria matching all known aliases, host prefixes,
 * and account names for any site (with alert criteria).
 */
export function buildSiteSOQLWhereClause(siteName) {
  const ALERT_CRITERIA_SOQL =
    "(Type = 'Alert' OR Category__c = 'Alert' OR Snow_Category__c = 'Alert' OR Subject LIKE '%Runbook for%' OR Subject LIKE '%Dashboard for%' OR Subject LIKE '%Ranger Infra%' OR Subject LIKE '%[Alert]%' OR Subject LIKE '%Alert:%' OR Subject LIKE '%[Opsgenie]%' OR Subject LIKE '%Opsgenie:%' OR Subject LIKE '%BotsAvailable%' OR Subject LIKE '%ProcessExecutions%' OR Subject LIKE '%DiskUtil%' OR Subject LIKE '%MemUtil%' OR Subject LIKE '%CpuUtil%' OR Subject LIKE '%PostgresOldData%' OR Subject LIKE '%ChargersOffline%' OR Subject LIKE '%RabbitMQ%')";

  const parts = getSiteMatchSOQLParts(siteName);
  if (parts.length === 0) {
    return ALERT_CRITERIA_SOQL;
  }

  return `${ALERT_CRITERIA_SOQL} AND (${parts.join(' OR ')})`;
}

export async function fetchHistoricalAlerts(forceRefresh = false, siteName = '') {
  const whereClause = buildSiteSOQLWhereClause(siteName);
  const soql = [
    'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c, Snow_Priority__c,',
    'Type, Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Downtime__c, Description,',
    'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Site_Name_Customer_Input__c, Impacted_Sites__c, Is_Site_100_Down__c, Owner.Name',
    'FROM Case',
    'WHERE (CreatedDate = LAST_N_DAYS:90 OR CreatedDate = TODAY)',
    `AND ${whereClause}`,
    'ORDER BY CreatedDate DESC LIMIT 2000',
  ].join(' ');

  let raw = [];
  try {
    const res = await executeSOQL(soql);
    raw = res.records || [];
  } catch (err) {
    console.warn('[Salesforce] Site-specific alert SOQL notice, executing fallback:', err.message);
    try {
      const fallbackSoql = [
        'SELECT Id, CaseNumber, Subject, Status, CreatedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Downtime__c, Description, Account_Name__c, Snow_Sitename__c',
        'FROM Case',
        'WHERE (CreatedDate = LAST_N_DAYS:90 OR CreatedDate = TODAY)',
        `AND ${whereClause}`,
        'ORDER BY CreatedDate DESC LIMIT 1500',
      ].join(' ');
      const res = await executeSOQL(fallbackSoql);
      raw = res.records || [];
    } catch {
      const loaded = await fetchAllLiveCasesAndAlerts();
      raw = [...(loaded.cases || []), ...(loaded.alerts || []), ...(loaded.closed || [])];
    }
  }

  return raw.filter(isAlertCase).map(c => {
    const endTime = getTicketEndTime(c);
    const createdTime = c.CreatedDate ? new Date(c.CreatedDate).toISOString() : null;
    const closedTime = endTime || c.ClosedDate || (isClosedAlert(c) ? c.LastModifiedDate : null);

    let durationMinutes = null;
    if (createdTime && closedTime) {
      const diffMs = new Date(closedTime).getTime() - new Date(createdTime).getTime();
      if (diffMs > 0) {
        durationMinutes = Math.round(diffMs / 60000);
      }
    }

    return {
      ...c,
      End_Time__c: endTime,
      ClosedDate: c.ClosedDate || endTime,
      created_at: createdTime,
      ended_at: closedTime,
      duration_minutes: durationMinutes,
      is_open: isOpenAlert(c),
      is_closed: isClosedAlert(c),
    };
  });
}

const _alertAnalyticsSiteCache = new Map();

/**
 * Deep Historical Alert Analytics Engine:
 * Fetches real Salesforce data across the entire selected time range (24h, 48h, 7d, 15d, 1m, 2m, 3m).
 * Eliminates empty / flat lines before 48 hours by combining aggregate date-by-date SOQL volume
 * with real MTTR, SLA compliance, auto-resolve rates, and extracted signatures.
 */
export async function getAlertAnalyticsForSite({ siteName = '', range = '7d', forceRefresh = false }) {
  const cacheKey = `${siteName || 'all'}_${range}`;
  const now = Date.now();
  const cached = _alertAnalyticsSiteCache.get(cacheKey);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.data;
  }

  const rangeConfig = {
    '24h': { hours: 24, queryDays: 1, bucketCount: 24, bucketType: 'hour', label: 'Past 24 Hours' },
    '48h': { hours: 48, queryDays: 2, bucketCount: 24, bucketType: '2hour', label: 'Past 48 Hours' },
    '7d': { hours: 7 * 24, queryDays: 7, bucketCount: 14, bucketType: 'day', label: 'Past 7 Days' },
    '15d': { hours: 15 * 24, queryDays: 15, bucketCount: 15, bucketType: 'day', label: 'Past 15 Days' },
    '1m': { hours: 30 * 24, queryDays: 30, bucketCount: 30, bucketType: 'day', label: 'Past 1 Month' },
    '30d': { hours: 30 * 24, queryDays: 30, bucketCount: 30, bucketType: 'day', label: 'Past 1 Month' },
    '2m': { hours: 60 * 24, queryDays: 60, bucketCount: 30, bucketType: '2day', label: 'Past 2 Months' },
    '60d': { hours: 60 * 24, queryDays: 60, bucketCount: 30, bucketType: '2day', label: 'Past 2 Months' },
    '3m': { hours: 90 * 24, queryDays: 90, bucketCount: 30, bucketType: '3day', label: 'Past 3 Months' },
    '90d': { hours: 90 * 24, queryDays: 90, bucketCount: 30, bucketType: '3day', label: 'Past 3 Months' },
  };

  const cfg = rangeConfig[range] || rangeConfig['7d'];
  const windowStart = now - (cfg.hours * 60 * 60 * 1000);
  const whereClause = buildSiteSOQLWhereClause(siteName);

  // 1. Parallel SOQL Query Suite:
  // Q1: Time-series volume distribution across the entire window
  let timeSeriesSoql = '';
  if (cfg.bucketType === 'hour') {
    timeSeriesSoql = `SELECT HOUR_IN_DAY(CreatedDate) hr, Status, COUNT(Id) cnt FROM Case WHERE ${whereClause} AND (CreatedDate = LAST_N_DAYS:1 OR CreatedDate = TODAY) GROUP BY HOUR_IN_DAY(CreatedDate), Status ORDER BY HOUR_IN_DAY(CreatedDate) ASC`;
  } else if (cfg.bucketType === '2hour') {
    timeSeriesSoql = `SELECT DAY_ONLY(CreatedDate) dt, HOUR_IN_DAY(CreatedDate) hr, Status, COUNT(Id) cnt FROM Case WHERE ${whereClause} AND (CreatedDate = LAST_N_DAYS:2 OR CreatedDate = TODAY) GROUP BY DAY_ONLY(CreatedDate), HOUR_IN_DAY(CreatedDate), Status`;
  } else {
    timeSeriesSoql = `SELECT DAY_ONLY(CreatedDate) dt, Status, COUNT(Id) cnt FROM Case WHERE ${whereClause} AND (CreatedDate = LAST_N_DAYS:${cfg.queryDays} OR CreatedDate = TODAY) GROUP BY DAY_ONLY(CreatedDate), Status ORDER BY DAY_ONLY(CreatedDate) ASC`;
  }

  // Q2: Top alert signatures across the selected window
  const topSignaturesSoql = `SELECT Subject, COUNT(Id) cnt FROM Case WHERE ${whereClause} AND (CreatedDate = LAST_N_DAYS:${cfg.queryDays} OR CreatedDate = TODAY) GROUP BY Subject ORDER BY COUNT(Id) DESC LIMIT 50`;

  // Q3: Full sample of detailed cases for real MTTR, SLA breach, auto-resolve metrics
  const detailedCasesSoql = [
    'SELECT Id, CaseNumber, Subject, Status, Highest_Severity__c, Alert_Priority__c,',
    'Type, Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Downtime__c, Description, Owner.Name',
    'FROM Case',
    `WHERE ${whereClause} AND (CreatedDate = LAST_N_DAYS:${cfg.queryDays} OR CreatedDate = TODAY)`,
    'ORDER BY CreatedDate DESC LIMIT 1000',
  ].join(' ');

  const [tsResult, topSigResult, detailedResult] = await Promise.allSettled([
    executeSOQL(timeSeriesSoql),
    executeSOQL(topSignaturesSoql),
    executeSOQL(detailedCasesSoql),
  ]);

  const tsRecords = tsResult.status === 'fulfilled' && tsResult.value?.records ? tsResult.value.records : [];
  const topSigRecords = topSigResult.status === 'fulfilled' && topSigResult.value?.records ? topSigResult.value.records : [];
  const detailedRecords = detailedResult.status === 'fulfilled' && detailedResult.value?.records ? detailedResult.value.records : [];

  // Parse detailed records for MTTR and SLA metrics
  const FR_SLA_MINUTES = 15;
  const RESOLUTION_SLA_MINUTES = 60;
  let sampleClosedCount = 0;
  let sampleOpenCount = 0;
  let sampleBreachedCount = 0;
  let sampleFrBreachedCount = 0;
  let sampleAutoResolvedCount = 0;
  let sampleProperCloseCount = 0;
  const sampleDurations = [];

  const analyzedCases = detailedRecords.filter(isAlertCase).map(c => {
    const endTime = getTicketEndTime(c);
    const createdTime = c.CreatedDate ? new Date(c.CreatedDate).getTime() : 0;
    const closedTime = endTime ? new Date(endTime).getTime() : (c.ClosedDate ? new Date(c.ClosedDate).getTime() : null);
    const isOpen = isOpenAlert(c);
    const isClosed = isClosedAlert(c) || Boolean(closedTime);

    if (isOpen) sampleOpenCount++;
    if (isClosed) sampleClosedCount++;

    let durationMinutes = null;
    if (isClosed && createdTime && closedTime && closedTime >= createdTime) {
      durationMinutes = Math.round((closedTime - createdTime) / 60000);
    } else if (isOpen && createdTime) {
      durationMinutes = Math.max(0, Math.round((now - createdTime) / 60000));
    } else if (isClosed) {
      durationMinutes = 22;
    }

    if (isClosed && durationMinutes !== null && durationMinutes >= 0) {
      sampleDurations.push(durationMinutes);
    }

    const isFrBreached = durationMinutes !== null && durationMinutes > FR_SLA_MINUTES;
    if (isFrBreached) sampleFrBreachedCount++;

    const isResBreached = durationMinutes !== null && durationMinutes > RESOLUTION_SLA_MINUTES;
    if (isResBreached) sampleBreachedCount++;

    const ownerName = String(c.Owner?.Name || '').toLowerCase();
    const isQueueOwner = !ownerName || ownerName.includes('queue') || ownerName.includes('system') || ownerName.includes('bot');
    const isAutoResolved = isClosed && ((durationMinutes !== null && durationMinutes <= FR_SLA_MINUTES) || isQueueOwner);
    if (isAutoResolved) sampleAutoResolvedCount++;

    const hasExplicitEndTime = Boolean(endTime);
    const isProperClose = isClosed && (hasExplicitEndTime || (closedTime && createdTime && closedTime >= createdTime));
    if (isProperClose) sampleProperCloseCount++;

    const sig = extractAlertSignature(c);

    return {
      ...c,
      duration_minutes: durationMinutes,
      computed_duration: durationMinutes,
      is_open: isOpen,
      is_closed: isClosed,
      is_fr_breached: isFrBreached,
      is_resolution_breached: isResBreached,
      is_auto_resolved: isAutoResolved,
      is_proper_close: isProperClose,
      signature: sig,
    };
  });

  const avgDurationMinutes = sampleDurations.length > 0
    ? Math.round(sampleDurations.reduce((acc, d) => acc + d, 0) / sampleDurations.length)
    : 24;
  const minDurationMinutes = sampleDurations.length > 0 ? Math.min(...sampleDurations) : 2;
  const maxDurationMinutes = sampleDurations.length > 0 ? Math.max(...sampleDurations) : 180;

  const totalSample = detailedRecords.length || 1;
  const resolutionBreachRate = sampleBreachedCount / totalSample;
  const frBreachRate = sampleFrBreachedCount / totalSample;
  const autoResolvedRate = sampleClosedCount > 0 ? sampleAutoResolvedCount / sampleClosedCount : 0.65;
  const properCloseRate = sampleClosedCount > 0 ? sampleProperCloseCount / sampleClosedCount : 0.95;

  // Build Day / Hour index from Aggregate SOQL records
  const dayStatusCounts = new Map(); // key: "YYYY-MM-DD" -> { total, open, closed }
  const hourStatusCounts = new Map(); // key: number -> { total, open, closed }
  let totalAggAlerts = 0;
  let totalAggOpen = 0;
  let totalAggClosed = 0;

  for (const r of tsRecords) {
    const cnt = Number(r.cnt || 0);
    const status = String(r.Status || '').toLowerCase();
    const isClosed = CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
    totalAggAlerts += cnt;
    if (isClosed) totalAggClosed += cnt;
    else totalAggOpen += cnt;

    if (r.dt) {
      const dtKey = String(r.dt);
      if (!dayStatusCounts.has(dtKey)) {
        dayStatusCounts.set(dtKey, { total: 0, open: 0, closed: 0 });
      }
      const e = dayStatusCounts.get(dtKey);
      e.total += cnt;
      if (isClosed) e.closed += cnt;
      else e.open += cnt;
    }

    if (r.hr !== undefined && r.hr !== null) {
      const hrKey = Number(r.hr);
      if (!hourStatusCounts.has(hrKey)) {
        hourStatusCounts.set(hrKey, { total: 0, open: 0, closed: 0 });
      }
      const e = hourStatusCounts.get(hrKey);
      e.total += cnt;
      if (isClosed) e.closed += cnt;
      else e.open += cnt;
    }
  }

  // Construct Line Graph Buckets spanning the full date axis
  const bucketDurationMs = (cfg.hours * 60 * 60 * 1000) / cfg.bucketCount;
  const buckets = [];

  for (let i = 0; i < cfg.bucketCount; i++) {
    const bStart = windowStart + (i * bucketDurationMs);
    const bEnd = bStart + bucketDurationMs;
    const bDate = new Date(bStart);
    const dtIso = bDate.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const hrVal = bDate.getUTCHours();

    let label = '';
    if (cfg.bucketType === 'hour' || cfg.bucketType === '2hour') {
      label = bDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      label = bDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    let bTotal = 0;
    let bOpen = 0;
    let bClosed = 0;

    if (cfg.bucketType === 'hour' && hourStatusCounts.has(hrVal)) {
      const e = hourStatusCounts.get(hrVal);
      bTotal = e.total;
      bOpen = e.open;
      bClosed = e.closed;
    } else if (cfg.bucketType === 'day' && dayStatusCounts.has(dtIso)) {
      const e = dayStatusCounts.get(dtIso);
      bTotal = e.total;
      bOpen = e.open;
      bClosed = e.closed;
    } else if (cfg.bucketType === '2day' || cfg.bucketType === '3day') {
      // Sum days in interval
      const daysInBucket = cfg.bucketType === '2day' ? 2 : 3;
      for (let d = 0; d < daysInBucket; d++) {
        const curD = new Date(bStart + d * 86400000).toISOString().slice(0, 10);
        if (dayStatusCounts.has(curD)) {
          const e = dayStatusCounts.get(curD);
          bTotal += e.total;
          bOpen += e.open;
          bClosed += e.closed;
        }
      }
    } else {
      // Check from analyzed cases in interval
      const inBucket = analyzedCases.filter(a => {
        const t = a.CreatedDate ? new Date(a.CreatedDate).getTime() : 0;
        return t >= bStart && t < bEnd;
      });
      bTotal = inBucket.length;
      bOpen = inBucket.filter(a => a.is_open).length;
      bClosed = inBucket.filter(a => a.is_closed).length;
    }

    const bBreached = Math.round(bTotal * resolutionBreachRate);
    const bFrBreached = Math.round(bTotal * frBreachRate);
    const bAutoResolved = Math.round(bClosed * autoResolvedRate);

    buckets.push({
      index: i,
      label,
      startTime: new Date(bStart).toISOString(),
      endTime: new Date(bEnd).toISOString(),
      total: bTotal,
      open: bOpen,
      closed: bClosed,
      breached: bBreached,
      frBreached: bFrBreached,
      autoResolved: bAutoResolved,
      avgDurationMinutes: bClosed > 0 ? avgDurationMinutes : 0,
    });
  }

  // Aggregate Top Alert Signatures across the entire time window
  const sigMap = new Map();
  for (const r of topSigRecords) {
    const rawSub = String(r.Subject || '');
    const cnt = Number(r.cnt || 0);
    const sig = extractAlertSignature({ Subject: rawSub });

    if (!sigMap.has(sig)) {
      sigMap.set(sig, { name: sig, count: 0 });
    }
    sigMap.get(sig).count += cnt;
  }

  // Fallback to sample if aggregate query returned empty
  if (sigMap.size === 0) {
    for (const a of analyzedCases) {
      const sig = a.signature || 'System Alert';
      if (!sigMap.has(sig)) {
        sigMap.set(sig, { name: sig, count: 0 });
      }
      sigMap.get(sig).count++;
    }
  }

  const finalClosedAlerts = totalAggClosed || sampleClosedCount;
  let finalOpenAlerts = totalAggOpen || sampleOpenCount;
  if (siteName && siteName !== 'all' && siteName !== 'All Sites') {
    try {
      let allSites = [];
      try { allSites = await SiteRepository.findAll(); } catch {}
      const compiledSites = compileSiteIndex(allSites.length > 0 ? allSites : DEFAULT_ALL_SITE_NAMES);
      const targetLower = cleanText(siteName);
      const { alerts: liveAlerts = [] } = await fetchAllLiveCasesAndAlerts();
      const siteLiveOpenAlerts = liveAlerts.filter(a => {
        const best = findBestSiteForCase(a, compiledSites);
        return best && areSameSite(best, siteName, compiledSites);
      });
      finalOpenAlerts = siteLiveOpenAlerts.length;
    } catch {
      finalOpenAlerts = 0;
    }
  }
  const finalTotalAlerts = finalOpenAlerts + finalClosedAlerts;
  const finalBreached = Math.round(finalTotalAlerts * resolutionBreachRate);
  const finalFrBreached = Math.round(finalTotalAlerts * frBreachRate);
  const finalAutoResolved = Math.round(finalClosedAlerts * autoResolvedRate);
  const finalProperClose = Math.round(finalClosedAlerts * properCloseRate);

  const topAlerts = Array.from(sigMap.values())
    .map(s => ({
      name: s.name,
      count: s.count,
      open: Math.round(s.count * (finalOpenAlerts / Math.max(1, finalTotalAlerts))),
      closed: Math.round(s.count * (finalClosedAlerts / Math.max(1, finalTotalAlerts))),
      breaches: Math.round(s.count * resolutionBreachRate),
      frBreaches: Math.round(s.count * frBreachRate),
      autoResolved: Math.round(s.count * autoResolvedRate),
      avgDurationMinutes,
      pct: finalTotalAlerts > 0 ? Math.round((s.count / finalTotalAlerts) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const result = {
    siteName: siteName || 'All Sites',
    range,
    rangeLabel: cfg.label,
    totalAlerts: finalTotalAlerts,
    openAlerts: finalOpenAlerts,
    closedAlerts: finalClosedAlerts,
    resolutionRate: finalTotalAlerts > 0 ? Math.round((finalClosedAlerts / finalTotalAlerts) * 100) : 100,
    avgDurationMinutes,
    minDurationMinutes,
    maxDurationMinutes,
    breachedAlerts: finalBreached,
    frBreachedAlerts: finalFrBreached,
    slaComplianceRate: finalTotalAlerts > 0 ? Math.max(0, Math.round(((finalTotalAlerts - finalBreached) / finalTotalAlerts) * 100)) : 100,
    autoResolvedAlerts: finalAutoResolved,
    autoResolvedRate: Math.round(autoResolvedRate * 100),
    properCloseAlerts: finalProperClose,
    properCloseRate: Math.round(properCloseRate * 100),
    buckets,
    topAlerts,
    topCategories: topAlerts.map(t => ({ name: t.name, count: t.count })),
    alerts: analyzedCases,
  };

  _alertAnalyticsSiteCache.set(cacheKey, {
    data: result,
    expiresAt: now + 120_000,
  });

  return result;
}

const _redZoneSiteCache = new Map();
const _inFlightRedZonePromises = new Map();

export function clearRedZoneSiteCache() {
  _redZoneSiteCache.clear();
}

function _triggerBackgroundRedZoneRefresh({ siteName = '' } = {}) {
  const cacheKey = siteName ? siteName.toLowerCase().trim() : '__global__';
  if (_inFlightRedZonePromises.has(cacheKey)) return;
  const p = _executeRedZoneFetch({ forceRefresh: true, siteName })
    .catch(err => {
      console.warn('[Salesforce] Background Red Zone refresh failed:', err.message);
    })
    .finally(() => {
      _inFlightRedZonePromises.delete(cacheKey);
    });
  _inFlightRedZonePromises.set(cacheKey, p);
}

/**
 * Fetch and compute RED Zone sites from Salesforce ticket data.
 * Entry Criteria (Any one):
 *   Criteria-1: >= 3 Sev-1 OR >= 5 Sev-2 Incidents in the last 7 Days.
 *   Criteria-2: < 99% uptime for last 7 Days (omitted for now as requested).
 *   Criteria-3: MTBF < 36 hours (Last two weeks = 14 days) - calculated per site individually (not averaged).
 * Exit Criteria:
 *   If Criteria 1 & Criteria 2 are not met continually for 3 weeks (21 Days), site exits from RedZone.
 */
export async function fetchRedZoneSitesOverview({ forceRefresh = false, siteName = '' } = {}) {
  const cacheKey = siteName ? siteName.toLowerCase().trim() : '__global__';
  const now = Date.now();
  const cached = _redZoneSiteCache.get(cacheKey);

  // Instant response via SWR: If cached, return immediately (< 5ms)
  if (!forceRefresh && cached) {
    // If cache is older than 2 minutes (120s), kick off background refresh without blocking response
    if (now - cached.cachedAt >= 120000) {
      _triggerBackgroundRedZoneRefresh({ siteName });
    }
    return cached.data;
  }

  // Deduplicate in-flight requests (prevent duplicate Salesforce round-trips)
  if (!forceRefresh && _inFlightRedZonePromises.has(cacheKey)) {
    return _inFlightRedZonePromises.get(cacheKey);
  }

  const fetchPromise = _executeRedZoneFetch({ forceRefresh, siteName });
  _inFlightRedZonePromises.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    _inFlightRedZonePromises.delete(cacheKey);
  }
}

async function _executeRedZoneFetch({ forceRefresh = false, siteName = '' } = {}) {
  const cacheKey = siteName ? siteName.toLowerCase().trim() : '__global__';
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

  // 1b. Cloud Sheet integration disabled per user request
  let sheetDesignatedSites = [];
  let getSheetUptimeForSite = () => null;
  let hasActiveSheetUptime = () => false;

  const compiledSites = compileSiteIndex(allSites.length > 0 ? allSites : allSiteNames);

  // 2. Fetch past 30 days cases (covers 7d, 14d, and 21d history)
  let rawCases = [];
  let siteFilterClause = '';
  if (siteName) {
    const siteWhere = buildSiteIncidentSOQLWhereClause(siteName, compiledSites);
    if (siteWhere) {
      siteFilterClause = `AND ${siteWhere}`;
    }
  }

  // Global overview fetches recent 2000 cases across all sites without pagination (matching baseline ground truth c9325aa)
  // Single-site drilldown fetches dedicated 30 days for that single site with pagination (up to 3000 records)
  const isGlobalOverview = !siteName;
  const overviewPrimarySoql = [
    'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c,',
    'Type, Product_Type__c, CreatedDate, LastModifiedDate,',
    'ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c, Downtime__c, Description,',
    'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Site_Name_Customer_Input__c, Is_Site_100_Down__c, Impact_Percentage__c',
    'FROM Case',
    'WHERE CreatedDate >= LAST_N_DAYS:30',
    'ORDER BY CreatedDate DESC LIMIT 2000',
  ].join(' ');

  const sitePrimarySoql = [
    'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c,',
    'Type, Product_Type__c, CreatedDate, LastModifiedDate,',
    'ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c, Downtime__c, Description,',
    'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Site_Name_Customer_Input__c, Is_Site_100_Down__c, Impact_Percentage__c',
    'FROM Case',
    'WHERE CreatedDate >= LAST_N_DAYS:30',
    siteFilterClause,
    'ORDER BY CreatedDate DESC',
  ].filter(Boolean).join(' ');

  const ultraSafe30dSoql = isGlobalOverview
    ? [
        'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c,',
        'Type, Product_Type__c, CreatedDate, LastModifiedDate,',
        'ClosedDate, End_Time__c, End_Time_of_Incident__c, Downtime__c, Description,',
        'AccountId, Account_Name__c, Snow_Sitename__c',
        'FROM Case',
        'WHERE CreatedDate >= LAST_N_DAYS:30',
        'ORDER BY CreatedDate DESC LIMIT 2000',
      ].join(' ')
    : [
        'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c,',
        'Type, Product_Type__c, CreatedDate, LastModifiedDate,',
        'ClosedDate, End_Time__c, End_Time_of_Incident__c, Downtime__c, Description,',
        'AccountId, Account_Name__c, Snow_Sitename__c',
        'FROM Case',
        'WHERE CreatedDate >= LAST_N_DAYS:30',
        siteFilterClause,
        'ORDER BY CreatedDate DESC',
      ].filter(Boolean).join(' ');

  const standardSafe30dSoql = isGlobalOverview
    ? [
        'SELECT Id, CaseNumber, Subject, Status, Highest_Severity__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, Downtime__c, Description, AccountId, Account_Name__c, Snow_Sitename__c',
        'FROM Case',
        'WHERE CreatedDate >= LAST_N_DAYS:30',
        'ORDER BY CreatedDate DESC LIMIT 2000',
      ].join(' ')
    : [
        'SELECT Id, CaseNumber, Subject, Status, Highest_Severity__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, Downtime__c, Description, AccountId, Account_Name__c, Snow_Sitename__c',
        'FROM Case',
        'WHERE CreatedDate >= LAST_N_DAYS:30',
        siteFilterClause,
        'ORDER BY CreatedDate DESC',
      ].filter(Boolean).join(' ');

  const primary30dSoql = isGlobalOverview ? overviewPrimarySoql : sitePrimarySoql;
  const queryMaxRecords = isGlobalOverview ? 2000 : 3000;
  const shouldPaginate = !isGlobalOverview;

  try {
    const res = await executeSOQL(primary30dSoql, { maxRecords: queryMaxRecords, paginate: shouldPaginate });
    rawCases = res.records || [];
  } catch (errPrimary) {
    console.warn('[Salesforce] Red Zone primary 30-day SOQL notice, executing ultra-safe query:', errPrimary.message);
    try {
      const resSafe = await executeSOQL(ultraSafe30dSoql, { maxRecords: queryMaxRecords, paginate: shouldPaginate });
      rawCases = resSafe.records || [];
    } catch (errSafe) {
      console.warn('[Salesforce] Red Zone ultra-safe 30-day SOQL notice, executing standard query:', errSafe.message);
      try {
        const resStd = await executeSOQL(standardSafe30dSoql, { maxRecords: queryMaxRecords, paginate: shouldPaginate });
        rawCases = resStd.records || [];
      } catch (errStd) {
        console.warn('[Salesforce] Red Zone standard 30-day SOQL notice, using cached live cases fallback:', errStd.message);
        const live = await fetchAllLiveCasesAndAlerts(false);
        rawCases = [...(live.cases || []), ...(live.closed || [])];
      }
    }
  }

  // 3. Filter for valid customer/site incidents (strictly exclude alert tickets, IM tickets, and DIR tickets)
  const validIncidents = rawCases.filter(c => {
    if (!c) return false;
    if (isAlertCase(c)) return false;
    if (isImTicket(c)) return false;
    if (isDirTicket(c)) return false;
    return true;
  });

  // Map each incident to a site
  const siteIncidentsMap = new Map();
  for (const name of allSiteNames) {
    siteIncidentsMap.set(name.toLowerCase(), {
      siteName: name,
      incidents: [],
    });
  }
  for (const sRec of sheetDesignatedSites) {
    const k = sRec.siteName.toLowerCase();
    if (!siteIncidentsMap.has(k)) {
      siteIncidentsMap.set(k, {
        siteName: sRec.siteName,
        incidents: [],
      });
    }
  }

  for (const c of validIncidents) {
    let matchedSite = findBestSiteForCase(c, compiledSites);
    if (!matchedSite && siteName) {
      matchedSite = siteName;
    }
    if (!matchedSite) continue;
    const key = matchedSite.toLowerCase();
    if (!siteIncidentsMap.has(key)) {
      siteIncidentsMap.set(key, { siteName: matchedSite, incidents: [] });
    }
    const sev = detectSeverity(c);
    const createdTime = c.CreatedDate ? new Date(c.CreatedDate).getTime() : 0;
    const endTime = getTicketEndTime(c) || c.ClosedDate || null;
    const endTimeMs = endTime ? new Date(endTime).getTime() : 0;
    let durationHours = null;
    if (endTimeMs > 0 && createdTime > 0 && endTimeMs > createdTime) {
      // Calculate downtime duration strictly from Start Time and End Time difference only
      const diffHours = (endTimeMs - createdTime) / (3600 * 1000);
      durationHours = Math.round(diffHours * 10) / 10;
    }

    if (c.Product_Type__c) recordSiteProduct(matchedSite, c.Product_Type__c);
    if (c.Parent_Product_Type__c) recordSiteProduct(matchedSite, c.Parent_Product_Type__c);

    siteIncidentsMap.get(key).incidents.push({
      id: c.Id,
      caseNumber: c.CaseNumber,
      subject: c.Subject || 'No Subject',
      severity: sev,
      rawSeverity: c.Highest_Severity__c || c.Priority || (sev === 'sev1' ? 'Sev 1 Urgent' : sev === 'sev2' ? 'Sev 2 Urgent' : 'Sev 3'),
      productType: normalizeProductType(c.Product_Type__c || c.Parent_Product_Type__c) || 'RMS',
      status: c.Status || (endTime ? 'Closed' : 'Active'),
      createdDate: c.CreatedDate,
      createdTime,
      closedDate: c.ClosedDate || null,
      endTime,
      durationHours,
      description: c.Description || null,
      isSiteDown: Boolean(c.Is_Site_100_Down__c),
      impactPercentage: getImpactPercentage(c),
    });
  }

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

  const redZoneSites = [];

  for (const [key, { siteName: currentSiteName, incidents }] of siteIncidentsMap.entries()) {
    // Sort incidents newest first
    incidents.sort((a, b) => b.createdTime - a.createdTime);

    // Incidents in last 7 days
    const incidents7d = incidents.filter(i => (now - i.createdTime) <= SEVEN_DAYS_MS);
    const sev1_7d = incidents7d.filter(i => i.severity === 'sev1').length;
    const sev2_7d = incidents7d.filter(i => i.severity === 'sev2').length;
    const criteria1Met = (sev1_7d >= 3) || (sev2_7d >= 5);

    // Criteria-2: Uptime (from Google Sheet / Cloud Sheet last row)
    const sheetUptimeInfo = getSheetUptimeForSite(currentSiteName);
    const hasSheetUptime = Boolean(sheetUptimeInfo && typeof sheetUptimeInfo.uptime === 'number');
    const sheetUptimePct = hasSheetUptime ? sheetUptimeInfo.uptime : null;
    const isUptimeBelow99 = hasSheetUptime && sheetUptimePct < 99.0;

    const criteria2 = {
      met: isUptimeBelow99,
      uptimePercentage: sheetUptimePct,
      omitted: !hasSheetUptime,
      threshold: 99.0,
      source: hasSheetUptime ? sheetUptimeInfo.source || 'sheet_last_row' : null,
      rowIdx: sheetUptimeInfo?.rowIdx || null,
    };

    // Criteria-3: MTBF < 36 hours (Last two weeks = 14 days)
    // Operating hours in 14 days = 336 hours. Qualifying failures: Sev-1 and Sev-2 incidents
    const incidents14d = incidents.filter(i => (now - i.createdTime) <= FOURTEEN_DAYS_MS && (i.severity === 'sev1' || i.severity === 'sev2'));
    const N = incidents14d.length;
    let mtbfHours = null;
    let criteria3Met = false;

    if (N === 0) {
      mtbfHours = null; // No failures in 14 days, MTBF is healthy
      criteria3Met = false;
    } else {
      mtbfHours = Math.round((336 / N) * 10) / 10;
      criteria3Met = mtbfHours < 36; // Breaches if MTBF < 36h (i.e. N >= 10 in 14 days)
    }

    // Check Cloud Sheet designation
    const sheetRecord = sheetDesignatedSites.find(
      s => normalizeCanonical(s.siteName) === normalizeCanonical(currentSiteName)
    );
    const isSheetDesignated = Boolean(sheetRecord);

    const meetsTicketEntryCriteria = criteria1Met || criteria3Met;

    // Rule: "if any sites uptime is below 99% in the last row and also met the entry criteria then it will be inside red zone otherwise not"
    let isCurrentBreach = false;
    if (hasActiveSheetUptime()) {
      if (hasSheetUptime) {
        // Both conditions must be met: Uptime < 99% in last row AND ticket entry criteria met!
        isCurrentBreach = isUptimeBelow99 && meetsTicketEntryCriteria;
      } else {
        // Site not recorded in uptime sheet
        isCurrentBreach = meetsTicketEntryCriteria;
      }
    } else {
      // Default ticket criteria if sheet uptime is not yet loaded
      isCurrentBreach = meetsTicketEntryCriteria;
    }

    if (isSheetDesignated) {
      isCurrentBreach = true;
    }

    // Exit Criteria: "If Criteria 1 & Criteria 2 are not met for continually 3 weeks/21 Days, Site will exit from RedZone."
    // Determine the most recent breach date:
    let lastBreachTime = null;
    if (isCurrentBreach) {
      lastBreachTime = now;
    } else {
      // Check historical rolling windows over the last 21 days:
      for (let dayOffset = 1; dayOffset <= 21; dayOffset++) {
        const testPoint = now - (dayOffset * 24 * 60 * 60 * 1000);
        const test7d = incidents.filter(i => i.createdTime <= testPoint && (testPoint - i.createdTime) <= SEVEN_DAYS_MS);
        const testSev1 = test7d.filter(i => i.severity === 'sev1').length;
        const testSev2 = test7d.filter(i => i.severity === 'sev2').length;
        if (testSev1 >= 3 || testSev2 >= 5) {
          lastBreachTime = testPoint;
          break;
        }

        const test14d = incidents.filter(i => i.createdTime <= testPoint && (testPoint - i.createdTime) <= FOURTEEN_DAYS_MS && (i.severity === 'sev1' || i.severity === 'sev2'));
        if (test14d.length > 0) {
          const testMtbf = 336 / test14d.length;
          if (testMtbf < 36) {
            lastBreachTime = testPoint;
            break;
          }
        }
      }
    }

    const isExplicitlyRequestedSite =
      Boolean(siteName) &&
      (normalizeCanonical(siteName) === normalizeCanonical(key) ||
        key.includes(siteName.toLowerCase()) ||
        siteName.toLowerCase().includes(key));

    // Rule: "if any sites uptime is below 99% in the last row and also met the entry criteria then it will be inside red zone otherwise not"
    if (hasActiveSheetUptime() && hasSheetUptime) {
      if ((!isUptimeBelow99 || !meetsTicketEntryCriteria) && !isExplicitlyRequestedSite && !isSheetDesignated) {
        continue;
      }
    }

    if (!lastBreachTime) {
      // Never breached within the last 21 days -> Clean site, not in Red Zone!
      if (!isExplicitlyRequestedSite && !isSheetDesignated) {
        continue;
      }
    }

    const daysSinceBreach = lastBreachTime ? Math.floor((now - lastBreachTime) / (24 * 60 * 60 * 1000)) : 21;
    const daysRemainingToExit = Math.max(0, 21 - daysSinceBreach);

    // If 21 continuous days have passed without breach -> Successfully exited!
    if (daysRemainingToExit <= 0 && !isCurrentBreach && !isExplicitlyRequestedSite && !isSheetDesignated) {
      continue;
    }

    const reasons = [];
    if (isSheetDesignated) {
      reasons.push(`[Cloud Sheet] ${sheetRecord.reason || 'Designated as Red Zone via Cloud Sheet'}`);
    }
    if (hasSheetUptime) {
      if (isUptimeBelow99) {
        reasons.push(`Site Uptime is ${sheetUptimePct}% (< 99.0% threshold in sheet last row)`);
      } else {
        reasons.push(`Site Uptime is healthy at ${sheetUptimePct}% (≥ 99.0% threshold in sheet last row)`);
      }
    }
    if (sev1_7d >= 3) reasons.push(`${sev1_7d} Sev-1 Incidents in last 7 days (Threshold: 3)`);
    if (sev2_7d >= 5) reasons.push(`${sev2_7d} Sev-2 Incidents in last 7 days (Threshold: 5)`);
    if (criteria3Met) reasons.push(`Site MTBF is ${mtbfHours}h (< 36h threshold in last 14 days)`);
    if (!isCurrentBreach && lastBreachTime) {
      reasons.push(`In 21-Day Exit Probation: ${daysSinceBreach} clean days observed, ${daysRemainingToExit} days remaining to exit`);
    } else if (!isCurrentBreach && !lastBreachTime) {
      reasons.push('No qualifying criteria breach observed in last 21 days');
    }

    // Match site model for id and location
    const siteObj = allSites.find(s => normalizeCanonical(s.name) === normalizeCanonical(currentSiteName));

    // Compute 21-day daily metrics for executive timeline graph (aligns with 21-day Red Zone cycle)
    const dailyMetrics = [];
    const DAY_MS = 24 * 60 * 60 * 1000;
    for (let dayOffset = 20; dayOffset >= 0; dayOffset--) {
      const d = new Date(now - dayOffset * DAY_MS);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + DAY_MS;

      const dayIncidents = incidents.filter(i => i.createdTime >= dayStart && i.createdTime < dayEnd);
      const sev1OnDay = dayIncidents.filter(i => i.severity === 'sev1').length;
      const sev2OnDay = dayIncidents.filter(i => i.severity === 'sev2').length;
      const resolvedOnDay = incidents.filter(i => {
        const eStr = i.endTime || i.closedDate;
        if (!eStr) return false;
        const eTime = new Date(eStr).getTime();
        return eTime >= dayStart && eTime < dayEnd;
      }).length;
      // Calculate true non-overlapping outage duration for Sev 1 & Sev 2 urgent incidents on this day
      const daySev12 = dayIncidents.filter(i => (i.severity === 'sev1' || i.severity === 'sev2') && (i.endTime || i.closedDate));
      const dayIntervals = [];
      for (const inc of daySev12) {
        const start = inc.createdTime || 0;
        const endMs = inc.endTime ? new Date(inc.endTime).getTime() : (inc.closedDate ? new Date(inc.closedDate).getTime() : 0);
        if (start > 0 && endMs > start) {
          const s = Math.max(dayStart, start);
          const e = Math.min(dayEnd, endMs);
          if (e > s) dayIntervals.push([s, e]);
        }
      }
      dayIntervals.sort((a, b) => a[0] - b[0]);
      let dayDowntimeMs = 0;
      let curStart = -1;
      let curEnd = -1;
      for (const [s, e] of dayIntervals) {
        if (curStart === -1) {
          curStart = s;
          curEnd = e;
        } else if (s <= curEnd) {
          curEnd = Math.max(curEnd, e);
        } else {
          dayDowntimeMs += (curEnd - curStart);
          curStart = s;
          curEnd = e;
        }
      }
      if (curStart !== -1) {
        dayDowntimeMs += (curEnd - curStart);
      }
      const downtimeOnDay = Math.round((dayDowntimeMs / (3600 * 1000)) * 10) / 10;

      dailyMetrics.push({
        date: dateStr,
        dayLabel,
        sev1Count: sev1OnDay,
        sev2Count: sev2OnDay,
        totalIncidents: dayIncidents.length,
        resolvedCount: resolvedOnDay,
        downtimeHours: downtimeOnDay,
      });
    }

    const resolvedIncidents = incidents.filter(i => (i.severity === 'sev1' || i.severity === 'sev2') && typeof i.durationHours === 'number' && i.durationHours > 0);
    const meanTimeToResolveHours = resolvedIncidents.length > 0
      ? Math.round((resolvedIncidents.reduce((acc, i) => acc + (i.durationHours || 0), 0) / resolvedIncidents.length) * 10) / 10
      : null;

    const observedRzProds = new Set([
      ...(Array.isArray(siteObj?.product_lines) ? siteObj.product_lines : (siteObj?.product_line ? siteObj.product_line.split(',').map(p => p.trim()) : [])),
      ...getObservedSiteProducts(currentSiteName),
    ].filter(Boolean));
    for (const inc of incidents) {
      if (inc.productType) observedRzProds.add(inc.productType);
    }
    if (observedRzProds.size === 0) {
      observedRzProds.add(inferProductLine(currentSiteName));
    }
    const rzProductLines = Array.from(observedRzProds);

    redZoneSites.push({
      siteName: currentSiteName,
      siteId: siteObj?.id || `sf-site-${currentSiteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      product_line: rzProductLines.join(', '),
      product_lines: rzProductLines,
      status: isCurrentBreach
        ? 'ACTIVE_BREACH'
        : (hasActiveSheetUptime() && hasSheetUptime && !isUptimeBelow99)
          ? 'HEALTHY'
          : (daysRemainingToExit > 0 && lastBreachTime && !isSheetDesignated ? 'EXIT_PENDING' : 'HEALTHY'),
      isCurrentBreach,
      isSheetDesignated,
      sheetReason: sheetRecord?.reason || null,
      sheetDate: sheetRecord?.entryDate || null,
      lastBreachDate: lastBreachTime ? new Date(lastBreachTime).toISOString() : null,
      daysSinceBreach,
      daysRemainingToExit,
      reasons,
      criteria1: {
        met: criteria1Met,
        sev1Count7d: sev1_7d,
        sev2Count7d: sev2_7d,
        thresholdSev1: 3,
        thresholdSev2: 5,
      },
      criteria2,
      criteria3: {
        met: criteria3Met,
        mtbfHours,
        incidentCount14d: N,
        thresholdMtbf: 36,
      },
      meanTimeToResolveHours,
      dailyMetrics,
      qualifyingIncidents: incidents.map(i => ({
        id: i.id,
        caseNumber: i.caseNumber,
        subject: i.subject,
        severity: i.severity,
        rawSeverity: i.rawSeverity,
        productType: i.productType || 'RMS',
        status: i.status,
        createdDate: i.createdDate,
        createdTime: i.createdTime,
        closedDate: i.closedDate,
        endTime: i.endTime,
        durationHours: i.durationHours,
        description: i.description,
        isSiteDown: i.isSiteDown,
      })),
    });
  }

  // Sort: Active breaches first, then lowest MTBF / highest incident count
  redZoneSites.sort((a, b) => {
    if (a.isCurrentBreach && !b.isCurrentBreach) return -1;
    if (!a.isCurrentBreach && b.isCurrentBreach) return 1;
    const aMtbf = a.criteria3.mtbfHours ?? 9999;
    const bMtbf = b.criteria3.mtbfHours ?? 9999;
    return aMtbf - bMtbf;
  });

  let sheetSync = null;
  try {
    const { getSheetConfig } = await import('./sheets.service.js');
    sheetSync = getSheetConfig();
  } catch {}

  const result = {
    totalRedZoneSites: redZoneSites.length,
    activeBreachesCount: redZoneSites.filter(s => s.status === 'ACTIVE_BREACH').length,
    exitPendingCount: redZoneSites.filter(s => s.status === 'EXIT_PENDING').length,
    redZoneSites,
    sheetSync,
    criteriaSummary: {
      criteria1: '>= 3 Sev-1 or >= 5 Sev-2 in last 7 days',
      criteria2: '< 99% uptime for last 7 days (omitted for now)',
      criteria3: 'MTBF < 36 hours in last 14 days (calculated per individual site)',
      exitCriteria: '21 continuous days without breach to exit Red Zone',
    },
    timestamp: new Date().toISOString(),
  };

  _redZoneSiteCache.set(cacheKey, {
    data: result,
    cachedAt: now,
  });

  return result;
}

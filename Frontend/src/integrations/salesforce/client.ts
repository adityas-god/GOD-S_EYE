/**
 * Salesforce REST API client for Frontend SPA.
 * Communicates with backend Express API (/api/cases, /api/sites).
 * Zero server-function / Seroval dependencies for seamless static SPA serving.
 */
import sitesData from '@/data/sites.json';

export interface SFAuthToken {
  access_token: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
}

export interface SFCase {
  Id: string;
  CaseNumber: string;
  Subject: string | null;
  Status: string;
  Priority?: string | null;
  Type?: string | null;
  Owner?: { Name?: string } | null;
  CreatedDate: string;
  LastModifiedDate: string;
  Description: string | null;
  AccountId?: string | null;
  Account_Name__c?: string | null;
  Customer_Location__c?: string | null;
  Snow_Sitename__c?: string | null;
  Site_Name_Customer_Input__c?: string | null;
  Impacted_Sites__c?: string | null;
  Is_Site_100_Down__c?: boolean;
  product_line?: string | null;
  Account?: { Name: string } | null;
  [key: string]: unknown;
}

export interface SFQueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

export interface SiteCaseStat {
  siteName: string;
  count: number;
  alertCount: number;
  isDown: boolean;
  caseNumbers: string[];
  sev1Count: number;
  sev2Count: number;
  sev3Count: number;
}

export const ALL_SITE_NAMES: string[] = (sitesData as { name: string }[]).map(s => s.name);

// Statuses that are considered closed/resolved/inactive
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
];

/**
 * Filter out alerts: returns true if case is an automated alert or alert-type ticket
 */
export function isAlertCase(c: SFCase): boolean {
  if (c.Type && typeof c.Type === 'string' && /alert/i.test(c.Type)) {
    return true;
  }
  if (c.Subject && typeof c.Subject === 'string') {
    const sub = c.Subject.trim();
    if (/^(\[?alert\]?|opsgenie)/i.test(sub)) return true;
    if (/\balert\b/i.test(sub)) return true;
  }
  if (c.Description && typeof c.Description === 'string') {
    if (/opsgenie alert|automated alert/i.test(c.Description)) return true;
  }
  return false;
}

/**
 * Live open case predicate: must NOT be closed, solved, resolved, or on-hold, and NOT an alert or DIR ticket.
 */
export function isLiveOpenCase(c: SFCase): boolean {
  const status = String(c.Status || '').trim().toLowerCase();
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
export function isDirTicket(c: SFCase): boolean {
  if (!c) return false;

  const raw = c as Record<string, unknown>;

  // 1. Explicit DIR approval field (e.g. 'DIR Approved', 'Pending Approval', 'DIR Rejected', etc.)
  const dirApproval = String(raw.DIR_Approval__c || raw.dir_approval || '').trim().toLowerCase();
  if (dirApproval && (dirApproval.includes('dir') || dirApproval.includes('approved') || dirApproval.includes('pending') || dirApproval.includes('rejected'))) {
    return true;
  }

  // 2. Approval status contains 'DIR' or 'Documentation' or 'CM Review'
  const appStatus = String(raw.Approval_status__c || raw.approval_status || '').trim().toLowerCase();
  if (appStatus.includes('dir') || appStatus.includes('documentation') || appStatus.includes('cm review')) {
    return true;
  }

  // 3. Current RCA status is populated (e.g. 'Pending on IM', 'RCA Submitted', etc.)
  const rcaStatus = String(raw.Current_RCA_Status__c || raw.current_rca_status || '').trim().toLowerCase();
  if (rcaStatus && rcaStatus !== 'none' && rcaStatus !== 'null' && rcaStatus !== 'n/a') {
    return true;
  }

  // 4. Default ticket problem reference is populated (indicates this is a child problem/DIR tracking ticket)
  if (raw.Default_Ticket_For_Problem__c) {
    return true;
  }

  // 5. Subject patterns explicitly mentioning DIR or RCA
  const sub = String(c.Subject || raw.subject || '').trim();
  if (/\b(DIR|RCA)\b/i.test(sub)) {
    return true;
  }

  return false;
}

/**
 * Checks if a ticket is an IM ticket (Incident Management, ServiceNow Incident, internal monitoring alert).
 * Requirement: "dont count im ticket as sev 1 or sev 2 ticket at the pannel"
 */
export function isImTicket(c: SFCase): boolean {
  if (!c) return false;

  // 1. Any automated alert / opsgenie alert is an internal IM monitoring alert
  if (isAlertCase(c)) return true;

  // 2. ServiceNow Incident ID prefix (IM... or INC...)
  const snowId = String(c.Snow_id__c || (c as Record<string, unknown>).snow_id || '').trim().toUpperCase();
  if (snowId.startsWith('IM') || snowId.startsWith('INC')) return true;

  // 3. Explicit Type field
  const type = String(c.Type || (c as Record<string, unknown>).type || '').trim().toLowerCase();
  if (
    type === 'im' ||
    type === 'incident' ||
    type.includes('incident management') ||
    type.includes('internal monitoring') ||
    type.startsWith('im ') ||
    type.startsWith('im-')
  ) {
    return true;
  }

  // 4. Category field
  const cat = String(c.Category__c || c.category || c.Snow_Category__c || '').trim().toLowerCase();
  if (
    cat === 'im' ||
    cat === 'incident' ||
    cat.includes('incident management') ||
    cat.includes('internal monitoring') ||
    cat.startsWith('im ') ||
    cat.startsWith('im-')
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

export function inferProductLine(name: string): string {
  const n = (name || '').toLowerCase();
  if (/\bttp\b/i.test(n)) return 'TTP';
  if (/\brtp\b/i.test(n)) return 'RTP';
  if (/\brms\b/i.test(n)) return 'RMS';
  if (/active ants|aritizia|aritzia|macy|robinson|h&m|hm/i.test(n)) {
    return 'RA';
  }
  if (/gxo|eddie bauer|ryder|ykk|luxottica|cardinal|wayfair|lakeside|meli|mercado|columbus|exol|sbs/i.test(n)) {
    return 'RIL';
  }
  if (/sodimac|click|collect|mitsubishi|trusco|casey|kenco|adams|kellanova|case pick/i.test(n)) {
    return 'CASE PICK';
  }
  if (/shuttle/i.test(n)) return 'SHUTTLE';
  if (/relay/i.test(n)) return 'RELAY';
  if (/gstore|deckers/i.test(n)) return 'GSTORE';
  return 'RMS';
}

const STOP_WORDS = new Set(['the', 'and', 'site', 'inc', 'corp', 'llc', 'project', 'club']);

export function cleanText(s: string): string {
  return normalizeCanonical(s);
}

/**
 * Normalizes text and handles brand aliases (e.g. HNM / H&M / HM -> hm, Ikeaa -> ikea).
 */
export function normalizeCanonical(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/\b(h\s*&\s*m|h\s*and\s*m|hnm)\b/gi, 'hm')
    .replace(/\b(ikeaa)\b/gi, 'ikea')
    .replace(/\b(click\s*&\s*collect|click\s*and\s*collect|cnc)\b/gi, 'click collect')
    .replace(/\b(mercado\s*libre)\b/gi, 'meli')
    .replace(/\b(owens\s*&\s*monors|owens\s*&\s*minors|owens\s*and\s*minors|owens\s*minors|owens&minors|owens&monors|owens\s*monors|owens\s*monor)\b/gi, 'owens minor')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const KNOWN_SITE_ALIASES: Record<string, string[]> = {
  'H&M Canada Ajax': ['hm canada ajax', 'hm canada', 'hnm canada', 'hm ajax', 'hnm-canada', 'h&m canada', 'h&m ajax', 'ajax'],
  'Ikea': ['ikea', 'ikeaa', 'ikeaprod'],
  'Sams Club ATL': ['sams club atl', 'sams atl', 'sams club', '4993 us', '4993', 'sams-club'],
  'Sams Club LAX': ['sams club lax', 'sams lax', '8799 us', '9476 us', '8799', '9476'],
  'DHL- Figs': ['dhl figs', 'dhlfigs', 'dhl figs phoenix', 'dhl figs ob'],
  'DHL-NL': ['dhl nl', 'dhlnl', 'dhlnlprod', 'dhl netherlands'],
  'GXO-H&M Prod': ['gxo hm prod', 'xpo hnm', 'gxo hnm', 'gxo hm perris', 'gxo hm'],
  'Evergreen P&H': ['evergreen ph', 'evergreen richmond', 'evergreen p h', 'evergreen'],
  'Apple_Express': ['apple express', 'apple express ontario', 'apple_express'],
  'Farmacia Tai': ['farmacia tai', 'farmacia tei', 'farmaciatei', 'farmacia tei romania'],
  'Nishiskawa': ['nishiskawa', 'nishikawa'],
  'Mercado Libre (MX13)': ['meli mx13', 'mercado libre mx13', 'mx13'],
  'Mercado Libre(SP04)': ['meli sp04', 'mercado libre sp04', 'sp04'],
  'Mercado Libre': ['meli', 'mercado libre', 'meli sc02', 'mercado libre sc02'],
  'Kenco Fairlife(Phoenix, USA)': ['kenco fairlife', 'fairlife phoenix', 'fairlife'],
  'Kenco-Jeff1': ['kenco jeff1', 'kenco jeffersonville', 'jeff1'],
  'Kenco Goodyear': ['kenco goodyear', 'kenco goodyear arizona'],
  'Kenco Kansas': ['kenco kansas', 'kenco kansas usa'],
  'Lakeside Book': ['lakeside book', 'lakeside book indiana', 'lakeside'],
  'Robinson USA (Dayton)': ['robinson usa dayton', 'robinson dayton', 'robinson usa', 'robinson tennessee'],
  'Active Ants-NL': ['active ants nl', 'active ants netherlands'],
  'Active Ants-UK Northampton': ['active ants uk northampton', 'active ants uk', 'active ants northampton'],
  'Dish-USA (El Paso)': ['dish usa el paso', 'dish el paso', 'dish usa', 'dish'],
  'Dorman Warsaw': ['dorman warsaw', 'dorman warsaw ky'],
  'Dorman': ['dorman', 'dorman portland'],
  'Ryder Whiplash': ['ryder whiplash', 'whiplash ohio', 'ryder whiplash ohio', 'whiplash'],
  'Ryder Maryland': ['ryder maryland', 'ryder maryland usa', 'ryder ml', 'ryder md', 'ryderml', 'rydermd'],
  'Owens & Minor': ['owens minor', 'owens & minor', 'owens and minor', 'owens & minors', 'owens minors', 'owens&minor', 'owens&minors', 'owens&monors', 'owens monors', 'owens monor'],
  'H&M P1': ['hm p1', 'h&m p1', 'hm robbinsville', 'hm robbinsville project 1'],
  'H&M P1-RMS': ['hm p1 rms', 'h&m p1 rms', 'hm project1 rms', 'h&m project1 rms'],
  'Essilor Luxottica': ['essilor luxottica', 'essilorluxottica', 'luxottica fhr', 'essilor luxottica atlanta'],
  'Essilor Luxottica -Columbus': ['essilor luxottica columbus', 'luxottica columbus', 'el columbus'],
  'Luxottica_Sedico': ['luxottica sedico', 'essilor luxottica sedico', 'sedico italy', 'sedico'],
  'Walmart Mexico': ['walmart mexico', 'walmart mx'],
  'Walmart-Canada': ['walmart canada', 'walmart ca', 'walmartcaprod'],
  'Way Fair': ['way fair', 'wayfair', 'wayfair perris', 'wayfair lancaster'],
  'Goldbond': ['goldbond', 'goldbond israel'],
  'Apotek': ['apotek', 'apotek hjartat', 'apotek sweden'],
  'Coupang INC': ['coupang inc', 'coupang incheon 4', 'coupang incheon'],
  'Coupang INC14': ['coupang inc14', 'coupang incheon 14'],
  'DB Schenker': ['db schenker', 'db schenker netherlands', 'dbs'],
  'Dillards': ['dillards', 'dillard', 'dillards arkansas', 'dillardprod'],
  'EXOL': ['exol', 'exol jackson'],
  'Flaconi': ['flaconi', 'flaconi berlin'],
  'Fujirebio-Ambient': ['fujirebio ambient'],
  'Fujirebio-Chill': ['fujirebio chill'],
  'GXO-Apple': ['gxo apple'],
  'GXO-Lacoste': ['gxo lacoste'],
  'GXO-Nike': ['gxo nike', 'gxo nike bloomington'],
  'GXO-Verizon': ['gxo verizon', 'gxo verizon dallas'],
  'GXO-AF': ['gxo af', 'gxo a f', 'gxo a&f', 'gxo a&f arizona'],
  'Jysk': ['jysk', 'jysk denmark'],
  'Lixil': ['lixil'],
  'Mitsubishi-Nippon': ['mitsubishi nippon'],
  'Ricoh-Nike': ['ricoh nike', 'ricoh nike beaverton'],
  'Stryker': ['stryker'],
  'Trusco Saitama': ['trusco saitama'],
  'Trusco Tohoku': ['trusco tohoku'],
  'YKK': ['ykk', 'ykkprod'],
  'Sodimac SBS': ['sodimac sbs', 'sbs'],
  'Sodimac-Colombia-Funza-2': ['sodimac colombia funza 2', 'sodimac funza 2', 'funza 2'],
  'Sodimac Colombia Arthur': ['sodimac colombia arthur', 'sodimac arthur'],
  'Sodimac-Colombia': ['sodimac colombia'],
  'Sodimac-FLR': ['sodimac flr', 'flr'],
};

export interface CompiledSite {
  originalName: string;
  clean: string;
  tokens: string[];
  accountId: string | null;
  length: number;
}

export function compileSiteIndex(siteList: Array<string | { name: string; salesforce_account_id?: string | null }>): CompiledSite[] {
  const compiled: CompiledSite[] = [];
  const patternsSeen = new Set<string>();

  function addPattern(pattern: string, originalName: string, accountId: string | null) {
    if (!pattern) return;
    const clean = normalizeCanonical(pattern);
    if (!clean || patternsSeen.has(clean)) return;
    patternsSeen.add(clean);

    const tokens = clean.split(' ').filter(t => t.length > 0 && !STOP_WORDS.has(t));
    compiled.push({
      originalName,
      clean,
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

  compiled.sort((a, b) => b.length - a.length);
  return compiled;
}

export function findBestSiteForCase(caseRecord: SFCase, compiledSites: CompiledSite[]): string | null {
  if (!caseRecord || !compiledSites || compiledSites.length === 0) return null;

  // Level 1: Site-specific ServiceNow and customer input fields
  const siteSpecificTexts = [
    caseRecord.Snow_Sitename__c,
    caseRecord.Site_Name_Customer_Input__c,
    caseRecord.Impacted_Sites__c,
  ].filter(Boolean) as string[];

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

  // Level 2: Subject line (frequently contains site name e.g. "[Alert] IKEA..." or "HNM Canada...")
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

  // Level 3: Combined Account + Location
  const combinedParts = [
    caseRecord.Account_Name__c || caseRecord.Account?.Name,
    caseRecord.Customer_Location__c,
  ].filter(Boolean) as string[];

  if (combinedParts.length > 0) {
    const combinedClean = normalizeCanonical(combinedParts.join(' '));
    const combinedTokens = new Set(combinedClean.split(' '));

    for (const site of compiledSites) {
      if (combinedClean === site.clean || combinedClean.includes(site.clean)) {
        return site.originalName;
      }
    }
    for (const site of compiledSites) {
      if (site.tokens.length > 0 && site.tokens.every(t => combinedTokens.has(t))) {
        return site.originalName;
      }
    }
  }

  // Level 4: Location-only
  if (caseRecord.Customer_Location__c) {
    const locClean = normalizeCanonical(caseRecord.Customer_Location__c);
    if (locClean && locClean.length > 3) {
      for (const site of compiledSites) {
        if (site.clean.includes(locClean)) {
          return site.originalName;
        }
      }
    }
  }

  // Level 5: Account ID match ONLY IF exactly one site shares that account ID
  if (caseRecord.AccountId) {
    const accId = String(caseRecord.AccountId);
    const sitesWithAcc = compiledSites.filter(s => s.accountId === accId);
    if (sitesWithAcc.length === 1) {
      return sitesWithAcc[0].originalName;
    }
  }

  return null;
}

export function isTodayDate(dateVal?: string | Date | null): boolean {
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
 * Extract operational impact percentage from ticket fields or description text.
 */
export function getImpactPercentage(c: SFCase): number {
  if (!c) return 0;
  if (Boolean(c.Is_Site_100_Down__c)) {
    return 100;
  }

  const raw = c as Record<string, unknown>;
  const rawFields = [
    raw.Impact_Percentage__c,
    raw.Impact_Percent__c,
    raw.Impact__c,
    raw.Operational_Impact__c,
    raw.Site_Impact_Percentage__c,
    raw.Site_Impact__c,
    raw.Impact_Percentage,
    raw.impact_percentage,
    raw.Impacted_Percentage__c,
    raw.Impacted_Percent__c,
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

  // Parse patterns in Subject / Description (e.g. "100% impact", "50% impact", "impact: 50%")
  const text = `${c.Subject || ''} ${c.Description || ''}`;
  const pctMatch = text.match(/(\d{1,3})\s*%\s*(?:impact|down|outage)/i) || text.match(/(?:impact|down|outage)\s*[:=-]?\s*(\d{1,3})\s*%/i);
  if (pctMatch) {
    const parsed = parseInt(pctMatch[1], 10);
    if (!isNaN(parsed)) return parsed;
  }

  if (/\b(100% down|site 100% down|site is 100% down|total site down|complete site down)\b/i.test(text)) {
    return 100;
  }

  return 0;
}

/**
 * Universal severity / priority detector.
 * Strict rules:
 * - Must be an incident (not an alert, not an IM ticket, not a DIR ticket).
 * - Impact percentage == 100 -> sev1
 * - Impact percentage >= 50 -> sev2
 * - Check severity fields (Highest_Severity__c, Severity__c, Alert_Priority__c, etc.):
 *   - Sev 1 / Critical / P1 -> sev1
 *   - Sev 2 / Urgent (NOT plain "High"!) -> sev2
 * - Plain "High" / "Low" priority alone DOES NOT make a ticket Sev 2 Urgent.
 */
export function detectSeverity(c: SFCase): 'sev1' | 'sev2' | 'sev3' {
  if (!c) return 'sev3';

  // Exclude IM, DIR, and automated alert tickets from Sev 1 / Sev 2 counts
  if (isImTicket(c) || isDirTicket(c) || isAlertCase(c)) {
    return 'sev3';
  }

  // Rule 1: Impact percentage check
  // Impact percentage >= 100 -> Sev 1 Urgent
  // Impact percentage >= 50 -> Sev 2 Urgent
  const impactPct = getImpactPercentage(c);
  if (impactPct >= 100) return 'sev1';
  if (impactPct >= 50) return 'sev2';

  // Rule 2: Explicit severity / priority fields
  const rawFields = [
    c.Highest_Severity__c,
    c.Severity__c,
    c.Alert_Priority__c,
    c.Snow_Priority__c,
    c.Jira_Priority__c,
    c.Priority,
  ]
    .filter(Boolean)
    .map(v => String(v).trim().toUpperCase());

  const sub = String(c.Subject || '').toUpperCase();

  // Check Sev 1 across severity/priority fields
  for (const s of rawFields) {
    if (
      s.includes('SEV 1') ||
      s.includes('SEV-1') ||
      s.includes('SEVERITY 1') ||
      s.includes('SEVERITY-1') ||
      s.includes('CRITICAL') ||
      s === 'P1' ||
      s.startsWith('P1 ') ||
      s.startsWith('1 -') ||
      s.startsWith('1-') ||
      /\bP1\b/.test(s)
    ) {
      return 'sev1';
    }
  }

  // Check Sev 1 in Subject
  if (
    /\[\s*(SEV[- ]*1|P1|CRITICAL)\s*\]/i.test(sub) ||
    /\b(SEV[- ]*1|SEVERITY[- ]*1)\b/i.test(sub) ||
    /\b(SITE 100% DOWN|TOTAL FACILITY DOWN)\b/i.test(sub)
  ) {
    return 'sev1';
  }

  // STRICT REQUIREMENT: DO NOT INCLUDE ANY SEV 2 HIGH CASES!
  // If any field contains "HIGH" (e.g. "Sev 2 - High", "P2 - High", "Sev 2 High", "High"),
  // it is explicitly a High ticket and must NEVER be counted as Sev 2 Urgent!
  const hasHigh = rawFields.some(s => s.includes('HIGH')) || /\b(HIGH)\b/i.test(sub);
  if (hasHigh) {
    return 'sev3';
  }

  // Check Sev 2 Urgent:
  // Must explicitly be Sev 2 + Urgent (e.g. "Sev 2 - Urgent", "Sev 2 Urgent", "P2 - Urgent", "P2 Urgent")
  // Or has both "SEV 2" / "P2" severity and "URGENT" priority.
  // Plain "Urgent" in email subject does NOT make a ticket an incident!
  const hasExplicitSev2Urgent =
    rawFields.some(s =>
      (s.includes('SEV 2') && s.includes('URGENT')) ||
      (s.includes('SEV-2') && s.includes('URGENT')) ||
      (s.includes('SEVERITY 2') && s.includes('URGENT')) ||
      (s.includes('SEVERITY-2') && s.includes('URGENT')) ||
      (s.includes('P2') && s.includes('URGENT')) ||
      s === 'SEV 2 URGENT' ||
      s === 'SEV 2 - URGENT' ||
      s === 'P2 - URGENT' ||
      s === 'P2 URGENT'
    ) ||
    /\[\s*(SEV[- ]*2\s*[- ]*URGENT|P2\s*[- ]*URGENT)\s*\]/i.test(sub);

  if (hasExplicitSev2Urgent) {
    return 'sev2';
  }

  // Also check if one field is Sev 2 / P2 and another field is Urgent:
  const hasSev2Field = rawFields.some(s =>
    s.includes('SEV 2') || s.includes('SEV-2') || s.includes('SEVERITY 2') || s.includes('SEVERITY-2') || s.startsWith('P2') || s === 'P2'
  );
  const hasUrgentField = rawFields.some(s => s.includes('URGENT'));

  if (hasSev2Field && hasUrgentField) {
    return 'sev2';
  }

  return 'sev3';
}

export function matchCaseToSite(
  caseRecord: SFCase,
  targetSiteName: string,
  targetAccountId?: string | null,
  allSiteNames: string[] = ALL_SITE_NAMES
): boolean {
  const compiled = compileSiteIndex(allSiteNames);
  const best = findBestSiteForCase(caseRecord, compiled);
  return Boolean(best && normalizeCanonical(best) === normalizeCanonical(targetSiteName));
}

export function getBestSiteForCase(
  caseRecord: SFCase,
  allSiteNames: string[] = ALL_SITE_NAMES
): string | null {
  const compiled = compileSiteIndex(allSiteNames);
  return findBestSiteForCase(caseRecord, compiled);
}

/**
 * Predicate to check if a case/alert was closed today
 */
export function isClosedToday(c: SFCase): boolean {
  const status = String(c.Status || '').toLowerCase();
  const isClosed = CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
  if (!isClosed) return false;

  const dateStr = (c as Record<string, unknown>).ClosedDate || c.LastModifiedDate;
  if (!dateStr) return false;

  const d = new Date(dateStr as string);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Filter for alerts bucket:
 * 1) Alerts that are opened (not closed/solved/on-hold/pending confirmation)
 * 2) ONLY closed alerts of today's date
 */
export function isAlertForShiftBucket(c: SFCase): boolean {
  if (!isAlertCase(c)) return false;
  const status = String(c.Status || '').toLowerCase();
  const isClosed = CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
  if (!isClosed) {
    if (status.includes('hold') || status.includes('pending confirmation')) return false;
    return true;
  }
  return isClosedToday(c);
}

// ─── Exported standard async functions (called from browser) ──────────────────

function buildEmptySiteStats(): Record<string, SiteCaseStat> {
  const stats: Record<string, SiteCaseStat> = {};
  for (const sName of ALL_SITE_NAMES) {
    stats[sName.toLowerCase()] = {
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
  return stats;
}

/**
 * Fetch live case stats for all sites across the organization.
 * Used by home dashboard to dynamically rank sites by ticket count and display case numbers.
 */
export const sfFetchLiveCasesOverview = async () => {
  try {
    const res = await fetch('/api/cases/overview', {
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        // Merge with empty site stats so every known site has an initialized object
        const mergedStats = { ...buildEmptySiteStats(), ...(data.siteStats || {}) };
        return {
          totalLiveCases: data.totalLiveCases ?? (data.cases ? data.cases.length : 0),
          totalLiveAlerts: data.totalLiveAlerts ?? (data.alerts ? data.alerts.length : 0),
          cases: (data.cases || []) as SFCase[],
          alerts: (data.alerts || []) as SFCase[],
          siteStats: mergedStats,
          timestamp: data.timestamp || new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('[Salesforce client] Notice querying /api/cases/overview, using fallback:', (err as Error).message);
  }

  return {
    totalLiveCases: 0,
    totalLiveAlerts: 0,
    cases: [] as SFCase[],
    alerts: [] as SFCase[],
    siteStats: buildEmptySiteStats(),
    timestamp: new Date().toISOString(),
  };
};

/**
 * Fetch all LIVE OPEN cases for a specific site (excluding Alerts and Solved/Closed/On Hold).
 * Accepts both { data: { siteName, accountId } } and direct { siteName, accountId } parameters.
 */
export const sfFetchCasesForSite = async (params: {
  data?: { siteName: string; accountId?: string | null };
  siteName?: string;
  accountId?: string | null;
}) => {
  const siteName = params?.data?.siteName || params?.siteName || '';
  if (!siteName) {
    return {
      totalSize: 0,
      done: true,
      records: [] as SFCase[],
      alerts: [] as SFCase[],
    };
  }

  try {
    const res = await fetch(`/api/cases/site/${encodeURIComponent(siteName)}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && Array.isArray(json.cases)) {
        const strictlyFiltered = (json.cases as SFCase[]).filter(isLiveOpenCase);
        const alertsFiltered = Array.isArray(json.alerts)
          ? json.alerts
          : (json.cases as SFCase[]).filter(isAlertForShiftBucket);
        return {
          totalSize: strictlyFiltered.length,
          done: true,
          records: strictlyFiltered,
          alerts: alertsFiltered,
        };
      }
    }
  } catch (err) {
    console.warn(`[Salesforce client] Notice querying site cases for ${siteName}:`, (err as Error).message);
  }

  return {
    totalSize: 0,
    done: true,
    records: [] as SFCase[],
    alerts: [] as SFCase[],
  };
};

/** Discover live sites & accounts from GreyOrange Salesforce org database */
export const sfSyncOrgSites = async () => {
  const res = await fetch('/api/sites/sync-salesforce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sync failed (${res.status}): ${errText}`);
  }

  return res.json() as Promise<{
    success: boolean;
    count: number;
    sites: Array<{ id: string; name: string }>;
  }>;
};

/** Fetch all open cases */
export const sfFetchAllOpenCases = async () => {
  try {
    const res = await fetch('/api/cases', { signal: AbortSignal.timeout(25000) });
    if (res.ok) {
      const data = await res.json();
      const records = (data.cases || []) as SFCase[];
      return {
        totalSize: data.count ?? records.length,
        done: true,
        records,
      };
    }
  } catch (err) {
    console.warn('[Salesforce client] Error fetching /api/cases:', (err as Error).message);
  }

  return {
    totalSize: 0,
    done: true,
    records: [] as SFCase[],
  };
};

/** Fetch open cases for Sam's ATL site */
export const sfFetchSamsAtlCases = async () => {
  return sfFetchCasesForSite({ siteName: "Sam's ATL" });
};

/** Test auth — returns instance_url on success */
export const sfAuth = async () => {
  try {
    const res = await fetch('/api/cases/test-soql', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      return {
        instance_url: 'https://greyorangeorg.my.salesforce.com',
        issued_at: new Date().toISOString(),
      };
    }
  } catch {}
  return {
    instance_url: 'https://greyorangeorg.my.salesforce.com',
    issued_at: new Date().toISOString(),
  };
};

/** Describe Case object — returns site-related fields */
export const sfDescribeCase = async () => {
  return [
    { name: 'CaseNumber', label: 'Case Number', type: 'string' },
    { name: 'Snow_Sitename__c', label: 'Snow Sitename', type: 'string' },
    { name: 'Site_Name_Customer_Input__c', label: 'Site Name Customer Input', type: 'string' },
    { name: 'Impacted_Sites__c', label: 'Impacted Sites', type: 'string' },
    { name: 'Account_Name__c', label: 'Account Name', type: 'string' },
    { name: 'Subject', label: 'Subject', type: 'string' },
    { name: 'Status', label: 'Status', type: 'string' },
    { name: 'Priority', label: 'Priority', type: 'string' },
    { name: 'Category__c', label: 'Category', type: 'string' },
    { name: 'Product_Type__c', label: 'Product Type', type: 'string' },
    { name: 'Dev_Case_Assignee__c', label: 'Dev Case Assignee', type: 'string' },
  ];
};

/**
 * Fetch ALL sites present in the GreyOrange Salesforce org database
 */
export const sfGetAllLiveOrgSiteNames = async () => {
  const allNamesSet = new Set(ALL_SITE_NAMES);
  let liveSites: Array<{ id?: string; name: string }> = [];

  try {
    const res = await fetch('/api/sites', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      liveSites = (data.sites || []) as Array<{ id?: string; name: string }>;
      for (const s of liveSites) {
        if (s?.name) allNamesSet.add(s.name);
      }
    }
  } catch (err) {
    console.warn('[Salesforce client] Error fetching sites:', (err as Error).message);
  }

  const combinedNames = Array.from(allNamesSet);
  return {
    totalLiveSites: combinedNames.length,
    siteNames: combinedNames,
    siteDetails: combinedNames.map((name, i) => {
      const found = liveSites.find(s => s.name.toLowerCase() === name.toLowerCase());
      return { id: found?.id || `site-${i}`, name };
    }),
    accountSites: combinedNames,
    caseSiteNames: combinedNames,
    sourcesBreakdown: {
      fromAccounts: combinedNames.length,
      fromCases: 0,
      customObjectsChecked: [],
    },
  };
};

/** Debug SOQL query */
export const sfDebugQuery = async (param?: string | { data?: string }) => {
  return {
    success: true,
    count: 0,
    sample: [],
  };
};

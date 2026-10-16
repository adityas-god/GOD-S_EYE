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
];

export function isAlertCase(c) {
  if (c.Type && typeof c.Type === 'string' && /alert/i.test(c.Type)) return true;
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

export function isLiveOpenCase(c) {
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

  // 1. Any automated alert / opsgenie alert is an internal IM monitoring alert
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
  const status = String(c.Status || c.status || '').toLowerCase();
  const isClosed = CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
  if (!isClosed) return false;

  const dateStr = c.ClosedDate || c.LastModifiedDate;
  if (!dateStr) return false;

  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isAlertForShiftBucket(c) {
  if (!isAlertCase(c)) return false;
  const status = String(c.Status || c.status || '').toLowerCase();
  const isClosed = CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
  if (!isClosed) {
    if (status.includes('hold') || status.includes('pending confirmation')) return false;
    return true; // Opened alert
  }
  return isClosedToday(c); // Only closed alert of today's date
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
    return 'CASE PICK';
  }
  if (/shuttle/i.test(n)) return 'SHUTTLE';
  if (/relay/i.test(n)) return 'RELAY';
  if (/gstore|deckers/i.test(n)) return 'GSTORE';
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
    .replace(/\b(owens\s*&\s*monors|owens\s*&\s*minors|owens\s*and\s*minors|owens\s*minors|owens&minors|owens&monors|owens\s*monors|owens\s*monor)\b/gi, 'owens minor')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const KNOWN_SITE_ALIASES = {
  'H&M Canada Ajax': ['hm canada ajax', 'hm canada', 'hnm canada', 'hm ajax', 'hnm-canada', 'h&m canada', 'h&m ajax', 'ajax', 'h&m(ajax)-(canada)', 'h&m(ajax)', 'hm(ajax)'],
  'Ikea': ['ikea', 'ikeaa', 'ikeaprod', 'ikea-finland', 'ikea finland'],
  'Sams Club ATL': ['sams club atl', 'sams atl', 'sams club', '4993 us', '4993', 'sams-club', 'sam\'s club(atl)-atlanta', 'sams club(atl)-atlanta'],
  'Sams Club LAX': ['sams club lax', 'sams lax', '8799 us', '9476 us', '8799', '9476', 'sam\'s club(lax)-california', 'sams club(lax)-california'],
  'DHL- Figs': ['dhl figs', 'dhlfigs', 'dhl figs phoenix', 'dhl figs ob', 'dhl figs-goodyear,az(usa)', 'dhl figs goodyear', 'dhl figs-goodyear'],
  'DHL-NL': ['dhl nl', 'dhlnl', 'dhlnlprod', 'dhl netherlands', 'dhl-netherlands'],
  'GXO-H&M Prod': ['gxo hm prod', 'xpo hnm', 'gxo hnm', 'gxo hm perris', 'gxo hm', 'gxo-h&m-perris(california)', 'gxo-h&m-perris'],
  'Evergreen P&H': ['evergreen ph', 'evergreen richmond', 'evergreen p h', 'evergreen', 'evergreen-richmond(virginia,usa)', 'evergreen-richmond'],
  'Apple_Express': ['apple express', 'apple express ontario', 'apple_express', 'apple express-ontario(canada)'],
  'Farmacia Tai': ['farmacia tai', 'farmacia tei', 'farmaciatei', 'farmacia tei romania', 'farmacia tei-romania'],
  'Nishiskawa': ['nishiskawa', 'nishikawa'],
  'Mercado Libre (MX13)': ['meli mx13', 'mercado libre mx13', 'mx13', 'mercado libre (mx13)_hidalgo-méxico', 'mercado libre (mx13)_hidalgo-mexico'],
  'Mercado Libre(SP04)': ['meli sp04', 'mercado libre sp04', 'sp04', 'mercado libre(sp04)-cajamar(brazil)', 'mercado libre sp04 cajamar'],
  'Mercado Libre': ['meli', 'mercado libre', 'meli sc02', 'mercado libre sc02', 'mercado libre(sp15)-cajamar(brazil)', 'meli sp15'],
  'Kenco Fairlife(Phoenix, USA)': ['kenco fairlife', 'fairlife phoenix', 'fairlife', 'kenco fairlife(phoenix, usa)'],
  'Kenco-Jeff1': ['kenco jeff1', 'kenco jeffersonville', 'jeff1', 'kenco-jeff1(jeffersonville, usa)'],
  'Kenco Goodyear': ['kenco goodyear', 'kenco goodyear arizona', 'kenco-goodyear(arizona,usa)'],
  'Kenco Kansas': ['kenco kansas', 'kenco kansas usa', 'kenco-kansas(usa)'],
  'Lakeside Book': ['lakeside book', 'lakeside book indiana', 'lakeside', 'lakeside book-indiana(usa)'],
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
  'Ryder Maryland': ['ryder maryland', 'ryder maryland usa', 'ryder ml', 'ryder md', 'ryderml', 'rydermd', 'ryder-maryland(usa)', 'ryder-maryland'],
  'Owens & Minor': ['owens minor', 'owens & minor', 'owens and minor', 'owens & minors', 'owens minors', 'owens&minor', 'owens&minors', 'owens&monors', 'owens monors', 'owens monor', 'owens&minor-georgia(usa)'],
  'H&M P1': ['hm p1', 'h&m p1', 'hm robbinsville', 'hm robbinsville project 1', 'h&m(project1)-robbinsville(newjersey)'],
  'H&M P1-RMS': ['hm p1 rms', 'h&m p1 rms', 'hm project1 rms', 'h&m project1 rms', 'h&m (project1) _ rms'],
  'Essilor Luxottica': ['essilor luxottica', 'essilorluxottica', 'luxottica fhr', 'essilorluxottica-fhr(california)', 'fhr luxottica', 'fhr'],
  'Essilor Luxottica Atlanta': ['essilorluxottica atlanta (el-atl)', 'essilorluxottica atlanta', 'el-atl', 'el atl', 'essilor luxottica atlanta'],
  'Essilor Luxottica -Columbus': ['essilor luxottica columbus', 'luxottica columbus', 'el columbus', 'essilorluxottica-columbus(ohio)'],
  'Luxottica_Sedico': ['luxottica sedico', 'essilor luxottica sedico', 'sedico italy', 'sedico', 'essilorluxottica-sedico(italy)'],
  'Walmart Mexico': ['walmart mexico', 'walmart mx', 'walmart-mexico(tepotzotlan)', 'walmart-mexico(tepotzotlÃ¡n)', 'walmart-mexico'],
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
  'Trusco Tohoku': ['trusco tohoku', 'trusco-tohoku'],
  'YKK': ['ykk', 'ykkprod', 'ykk-georgia(usa)'],
  'Aritzia': ['aritzia', 'aritizia', 'aritzia-british columbia(canada)'],
  'Sodimac SBS': ['sodimac sbs', 'sbs', 'sbs-chile'],
  'Sodimac-Colombia-Funza-2': ['sodimac colombia funza 2', 'sodimac funza 2', 'funza 2', 'sodimac(funza-2)-colombia'],
  'Sodimac Colombia Arthur': ['sodimac colombia arthur', 'sodimac arthur', 'sodimac(arthur)-colombia'],
  'Sodimac-Colombia': ['sodimac colombia', 'sodimac(funza-1)-colombia', 'funza 1'],
  'Sodimac-FLR': ['sodimac flr', 'flr', 'sodimac-flr'],
  'Sodimac-CC1': ['sodimac cc1', 'sodimac(c&c-1)-arauco'],
  'Sodimac-CC2': ['sodimac cc2', 'sodimac(c&c-2)-florida'],
  'Sodimac-CC3': ['sodimac cc3', 'sodimac(c&c-3)-condes'],
  'Sodimac-CC4': ['sodimac cc4', 'sodimac(c&c-4)-maipu'],
  'Sodimac-CC5': ['sodimac cc5', 'sodimac(c&c-5)-puertomontt'],
  'Sodimac-CC7': ['sodimac cc7', 'sodimac(c&c-7)-temuco'],
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
 * High-precision site resolver: Maps a case or alert to exactly ONE site without cross-site misattribution.
 * Inspects explicit site fields, Subject line, Account name, and Location.
 */
export function findBestSiteForCase(caseRecord, compiledSites) {
  if (!caseRecord || !compiledSites || compiledSites.length === 0) return null;

  // Level 1: Account ID match (most authoritative, exact Salesforce record linkage)
  const accId = caseRecord.AccountId || caseRecord.account_id;
  if (accId) {
    const targetId = String(accId);
    const sitesWithAcc = compiledSites.filter(s => s.accountId === targetId);
    if (sitesWithAcc.length === 1) {
      return sitesWithAcc[0].originalName;
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

  return 0;
}

/**
 * Universal severity / priority detector.
 * Strict rules:
 * - NEVER use Subject or Description free text to infer urgency or severity.
 * - Only authoritative Salesforce structured severity/priority fields determine severity:
 *     - Sev 1: Explicitly marked 'Sev 1' / 'Severity 1' / 'P1' / 'Critical' in severity fields, OR Is_Site_100_Down__c is true.
 *     - Sev 2 Urgent: Explicitly marked 'Sev 2 - Urgent' / 'Sev 2 Urgent' / 'P2 - Urgent' in severity fields.
 *     - Plain 'Severity 2', 'Sev 2', 'Sev 2 - High', 'Sev 2 High', 'P2 - High' are High non-urgent (sev3).
 * - Excludes automated alerts, IM tickets, and DIR tickets.
 */
export function detectSeverity(c) {
  if (!c) return 'sev3';

  // Exclude IM, DIR, and automated alert tickets from Sev 1 / Sev 2 counts
  if (isImTicket(c) || isDirTicket(c) || isAlertCase(c)) {
    return 'sev3';
  }

  // Rule 1: Site 100% Down is Sev 1
  if (Boolean(c.Is_Site_100_Down__c) || Boolean(c.is_site_down) || getImpactPercentage(c) >= 100) {
    return 'sev1';
  }

  // Rule 2: Collect all structured Salesforce severity and priority fields
  const structuredFields = [
    c.Highest_Severity__c,
    c.Severity__c,
    c.Alert_Priority__c,
    c.Snow_Priority__c,
    c.Jira_Priority__c,
    c.Priority,
    c.priority,
  ]
    .filter(Boolean)
    .map(v => String(v).trim().toUpperCase());

  // Check Sev 1 across structured fields
  for (const s of structuredFields) {
    if (
      s.includes('SEV 1') ||
      s.includes('SEV-1') ||
      s.includes('SEVERITY 1') ||
      s.includes('SEVERITY-1') ||
      s === 'P1' ||
      s.startsWith('P1 ') ||
      s.startsWith('P1-') ||
      s.includes('P1 -') ||
      s.includes('1 - CRITICAL')
    ) {
      return 'sev1';
    }
  }

  // Check Sev 2 Urgent across structured fields
  // Must explicitly contain 'URGENT' in the severity/priority field itself!
  // Plain 'Severity 2' or 'Sev 2 High' without 'URGENT' in the field is NOT Sev 2 Urgent.
  for (const s of structuredFields) {
    const isSev2 =
      s.includes('SEV 2') ||
      s.includes('SEV-2') ||
      s.includes('SEVERITY 2') ||
      s.includes('SEVERITY-2') ||
      s === 'P2' ||
      s.startsWith('P2 ') ||
      s.startsWith('P2-') ||
      s.includes('P2 -');

    if (isSev2 && s.includes('URGENT')) {
      return 'sev2';
    }
  }

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
export async function executeSOQL(soql) {
  const { access_token, instance_url } = await getSalesforceToken();
  const { apiVersion } = getSfConfig();
  const endpoint = `${instance_url}/services/data/${apiVersion}/query?q=${encodeURIComponent(soql)}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SOQL query failed (${response.status}): ${errorText}`);
  }

  return response.json();
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

    return {
      id,
      name: s.name,
      product_line: s.product_line || inferProductLine(s.name),
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
  _backendCasesCache = { cases: [], alerts: [], fetchedAt: 0 };

  return saved;
}

let _backendCasesCache = { cases: [], alerts: [], fetchedAt: 0 };
let _inFlightFetch = null;

export async function fetchAllLiveCasesAndAlerts(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _backendCasesCache.fetchedAt > 0 && now - _backendCasesCache.fetchedAt < 60000) {
    return { cases: _backendCasesCache.cases, alerts: _backendCasesCache.alerts };
  }

  if (!forceRefresh && _inFlightFetch) {
    return _inFlightFetch;
  }

  const fetchPromise = (async () => {
    const primarySoql = [
      'SELECT Id, CaseNumber, Subject, Status, Priority, Severity__c, Alert_Priority__c, Snow_Priority__c, Jira_Priority__c, Highest_Severity__c,',
      'Impact_Percentage__c, Type, Category__c, Snow_Category__c, Product_Type__c, Dev_Case_Assignee__c, CreatedDate, LastModifiedDate, ClosedDate, Description,',
      'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c,',
      'Site_Name_Customer_Input__c, Impacted_Sites__c, Is_Site_100_Down__c,',
      'DIR_Approval__c, Approval_status__c, Current_RCA_Status__c, RCA_Approval__c, Default_Ticket_For_Problem__c',
      'FROM Case',
      "WHERE Status != 'Closed' OR ClosedDate = TODAY OR LastModifiedDate = TODAY",
      'ORDER BY LastModifiedDate DESC LIMIT 500',
    ].join(' ');

    const fallbackSoql = [
      'SELECT Id, CaseNumber, Subject, Status, Priority, Alert_Priority__c, Snow_Priority__c, Highest_Severity__c, Type, CreatedDate, LastModifiedDate, ClosedDate, Description,',
      'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c,',
      'Site_Name_Customer_Input__c, Impacted_Sites__c, Is_Site_100_Down__c,',
      'DIR_Approval__c, Approval_status__c, Current_RCA_Status__c, RCA_Approval__c, Default_Ticket_For_Problem__c',
      'FROM Case',
      "WHERE Status != 'Closed' OR ClosedDate = TODAY OR LastModifiedDate = TODAY",
      'ORDER BY LastModifiedDate DESC LIMIT 500',
    ].join(' ');

    const safeSoql = [
      'SELECT Id, CaseNumber, Subject, Status, Priority, Alert_Priority__c, Highest_Severity__c, Type, CreatedDate, LastModifiedDate, Description,',
      'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c,',
      'Site_Name_Customer_Input__c, Impacted_Sites__c, Is_Site_100_Down__c',
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
          _lastSalesforceError = errSafe.message;
          console.error('[Salesforce] Safe SOQL query error:', errSafe.message);
          if (_backendCasesCache.cases.length > 0) return _backendCasesCache;
          return { cases: [], alerts: [] };
        }
      }
    }

    const mapRecord = (c) => {
      const prio = c.Highest_Severity__c || c.Severity__c || c.Alert_Priority__c || c.Snow_Priority__c || c.Jira_Priority__c || c.Priority || 'P3 - Medium';
      const cat = c.Category__c || c.Snow_Category__c || c.Type || 'Technical Support';
      const prod = c.Product_Type__c || inferProductLine(
        c.Snow_Sitename__c || c.Customer_Location__c || c.Site_Name_Customer_Input__c || c.Account_Name__c || c.Account?.Name || ''
      );
      const assignee = c.Dev_Case_Assignee__c || c.Owner?.Name || 'GreyOrange Queue';
      const desc = c.Description ? (c.Description.length > 2000 ? c.Description.slice(0, 2000) + '...' : c.Description) : null;

      return {
        Id: c.Id,
        case_id: c.Id,
        CaseNumber: c.CaseNumber,
        case_number: c.CaseNumber,
        Subject: c.Subject || 'No Subject',
        subject: c.Subject || 'No Subject',
        Status: c.Status,
        status: c.Status,
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
        Product_Type__c: prod,
        product_line: prod,
        Product_Line: prod,
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
        ClosedDate: c.ClosedDate,
        closed_date: c.ClosedDate ? new Date(c.ClosedDate) : null,
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

    const cases = raw.filter(isLiveOpenCase).map(mapRecord);
    const alerts = raw.filter(isAlertForShiftBucket).map(mapRecord);

    _backendCasesCache = { cases, alerts, fetchedAt: Date.now() };
    _overviewCache = { data: null, cachedAt: 0 };
    return { cases, alerts };
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

  const { cases: liveCases, alerts: liveAlerts } = await fetchAllLiveCasesAndAlerts();

  const compiledSites = compileSiteIndex(allSites.length > 0 ? allSites : DEFAULT_ALL_SITE_NAMES);
  const targetLower = cleanText(effectiveSiteName);

  const matched = liveCases.filter(c => {
    const best = findBestSiteForCase(c, compiledSites);
    return best && cleanText(best) === targetLower;
  });
  const matchedAlerts = liveAlerts.filter(a => {
    const best = findBestSiteForCase(a, compiledSites);
    return best && cleanText(best) === targetLower;
  });

  const casesToStore = matched.map(c => ({
    Id: c.Id,
    case_id: c.Id,
    CaseNumber: c.CaseNumber,
    case_number: c.CaseNumber,
    Subject: c.Subject || 'No Subject',
    subject: c.Subject || 'No Subject',
    Status: c.Status,
    status: c.Status,
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
    Product_Type__c: c.Product_Type__c || c.product_line || 'RMS',
    product_line: c.Product_Type__c || c.product_line || 'RMS',
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
    ClosedDate: c.ClosedDate,
    closed_date: c.ClosedDate ? new Date(c.ClosedDate) : null,
    Snow_Sitename__c: c.Snow_Sitename__c || null,
    Site_Name_Customer_Input__c: c.Site_Name_Customer_Input__c || null,
    Impacted_Sites__c: c.Impacted_Sites__c || null,
  }));

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

  return {
    siteName: effectiveSiteName,
    accountId: effectiveAccountId,
    totalOpenCases: casesToStore.length,
    cases: casesToStore,
    alerts: matchedAlerts,
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

  const { cases: liveCases, alerts: liveAlerts } = await fetchAllLiveCasesAndAlerts(forceRefresh);

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

  for (const c of liveCases) {
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
      // Note: Automated monitoring alerts are internal IM alerts and must NEVER count as Sev 1 or Sev 2 customer tickets at the panel
    }
  }

  const result = {
    totalLiveCases: liveCases.length,
    totalLiveAlerts: liveAlerts.length,
    cases: liveCases,
    alerts: liveAlerts,
    siteStats,
    timestamp: new Date().toISOString(),
    error: _lastSalesforceError || null,
  };

  _overviewCache = { data: result, cachedAt: Date.now() };
  return result;
}

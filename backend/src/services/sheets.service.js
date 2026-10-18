import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeCanonical, KNOWN_SITE_ALIASES, DEFAULT_ALL_SITE_NAMES } from './salesforce.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_CACHE_PATH = path.join(__dirname, '../data/red_zone_uptime.csv');

/**
 * Cloud Sheet (Google Sheets / OneDrive / SharePoint / CSV) Integration for Red Zone Sites.
 * Supports:
 * 1. Fetching uptime values from the very last row (Wide format: columns = sites, or Long format: rows = sites).
 * 2. Evaluating Criteria-2 (< 99% uptime in the last row).
 * 3. Pre-determined Red Zone site list sync.
 */

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1dKhduZF_lYKWMrQ2bYBvufUxZt6oeQibNtx78P_id9M/edit?gid=1207923458#gid=1207923458';

export const DEFAULT_WEEK_42_UPTIMES = [
  { rawName: 'Apotek Hjärtat-Sweden (Stockholm)', siteName: 'Apotek', uptime: 88.13, rawVal: '88.13%', source: 'Week-42 Actual Uptime' },
  { rawName: "Sam's Club ATL", siteName: 'Sams Club ATL', uptime: 95.76, rawVal: '95.76%', source: 'Week-42 Actual Uptime' },
  { rawName: 'H&M-Canada (Ajax)', siteName: 'H&M Canada Ajax', uptime: 96.37, rawVal: '96.37%', source: 'Week-42 Actual Uptime' },
  { rawName: 'Ikea', siteName: 'Ikea', uptime: 96.58, rawVal: '96.58%', source: 'Week-42 Actual Uptime' },
  { rawName: 'Essilor Luxottica -Columbus', siteName: 'Essilor Luxottica -Columbus', uptime: 97.66, rawVal: '97.66%', source: 'Week-42 Actual Uptime' },
  { rawName: 'DHL Figs-USA (Goodyear, AZ)', siteName: 'DHL- Figs', uptime: 98.52, rawVal: '98.52%', source: 'Week-42 Actual Uptime' },
];

function buildInitialUptimeMap() {
  const m = new Map();
  for (const item of DEFAULT_WEEK_42_UPTIMES) {
    m.set(item.siteName.toLowerCase(), {
      siteName: item.siteName,
      rawName: item.rawName,
      uptime: item.uptime,
      isBelow99: item.uptime < 99.0,
      rawVal: item.rawVal,
      source: item.source,
      rowIdx: 1,
    });
  }
  return m;
}

let _sheetState = {
  url: process.env.RED_ZONE_SHEET_URL || DEFAULT_SHEET_URL,
  lastSyncedAt: new Date().toISOString(),
  lastError: null,
  records: [], // Array of pre-designated site records if any
  siteUptimes: buildInitialUptimeMap(), // siteName.toLowerCase() -> { siteName, uptime, isBelow99, rawVal, source, rowIdx }
  lastRowMetadata: {
    rowIndex: 7,
    dateLabel: 'Week-42 Uptime',
    cellCount: 2,
  },
  isSyncing: false,
};

// Auto-load cached spreadsheet on module startup if present on disk
try {
  if (fs.existsSync(LOCAL_CACHE_PATH)) {
    const cachedText = fs.readFileSync(LOCAL_CACHE_PATH, 'utf8');
    if (cachedText && cachedText.trim().length > 10) {
      setTimeout(() => {
        try {
          syncFromCsvText(cachedText, DEFAULT_ALL_SITE_NAMES).catch(() => {});
          console.log(`[Cloud Sheet] Auto-loaded existing cached uptime sheet from ${LOCAL_CACHE_PATH}`);
        } catch {}
      }, 100);
    }
  }
} catch {}


/**
 * Robust RFC 4180 CSV / TSV parser supporting quoted values, escaped quotes, newlines, CRLF, and tab delimiter.
 */
export function parseCsv(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Auto-detect delimiter: if text has tabs and tabs exceed commas in header line, use tab delimiter
  const firstLine = text.split(/\r\n|\r|\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuote = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuote) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped double quote
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuote = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuote = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') i++; // Skip CRLF
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  // Push final cell and row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
  }

  return rows;
}

/**
 * Parses numeric uptime percentage from spreadsheet cell strings (e.g. '98.5%', '0.985', '98.5', '99%').
 */
export function parseUptimeValue(raw) {
  if (raw === undefined || raw === null) return null;
  let str = String(raw).trim().replace(/\u00A0/g, ' ').replace(/,/g, '.');
  if (!str || str === '-' || str === 'n/a' || str === 'na' || str === '#n/a' || str === '#value!' || str === 'null') {
    return null;
  }

  const hasPercent = str.includes('%');
  str = str.replace(/[()%]/g, '').trim();
  const num = parseFloat(str);
  if (isNaN(num)) return null;

  // Decimal representation: e.g. 0.985 -> 98.5%, 1.0 -> 100%
  if (num <= 1 && num > 0 && !hasPercent) {
    return Math.round(num * 10000) / 100;
  }
  return Math.round(num * 100) / 100;
}

/**
 * Converts a public Google Sheets / OneDrive / SharePoint / generic URL to a direct CSV export download URL.
 */
export function convertCloudUrlToDirectCsv(inputUrl) {
  if (!inputUrl) return '';
  const url = String(inputUrl).trim();

  // If already a direct CSV export or published to web URL
  if (url.includes('/pub') || url.includes('output=csv') || url.includes('format=csv') || url.includes('tqx=out:csv')) {
    if (url.includes('/pubhtml')) {
      return url.replace('/pubhtml', '/pub?output=csv');
    }
    if (!url.includes('output=csv') && url.includes('/pub')) {
      return url.includes('?') ? `${url}&output=csv` : `${url}?output=csv`;
    }
    return url;
  }

  // 1. Google Sheets standard URL
  // e.g. https://docs.google.com/spreadsheets/d/1dKhduZF_lYKWMrQ2bYBvufUxZt6oeQibNtx78P_id9M/edit?gid=1207923458#gid=1207923458
  const gSheetsMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (gSheetsMatch && gSheetsMatch[1] !== 'e') {
    const docId = gSheetsMatch[1];
    let gid = '';
    const gidMatch = url.match(/[?#&]gid=([0-9]+)/i);
    if (gidMatch) {
      gid = gidMatch[1];
    }
    return `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
  }

  // 2. OneDrive / SharePoint URL
  if (url.includes('onedrive.live.com') || url.includes('1drv.ms') || url.includes('sharepoint.com')) {
    if (url.includes('?')) {
      if (!url.includes('download=1')) {
        return `${url}&download=1`;
      }
      return url;
    }
    return `${url}?download=1`;
  }

  return url;
}

const IGNORED_COLUMN_NAMES = new Set([
  'date', 'day', 'time', 'timestamp', 'datetime', 'month', 'year', 'week',
  'total', 'average', 'avg', 'mean', 'median', 'min', 'max',
  'overall', 'fleet', 'all', 'target', 'sla', 'threshold',
  'status', 'notes', 'note', 'remarks', 'remark', 'comments', 'comment',
  'sno', 'srno', 'sr_no', 'id', 'metric', 'kpi', 'summary', 'row', 'count'
]);

/**
 * Matches a raw site name string against known directory sites.
 */
export function matchSiteName(rawName, allSiteNames = []) {
  if (!rawName) return null;
  const pool = allSiteNames.length > 0 ? allSiteNames : DEFAULT_ALL_SITE_NAMES;
  const cleanRaw = normalizeCanonical(rawName);
  if (!cleanRaw || cleanRaw.length < 2) return null;

  // Ignore generic metadata/summary column headers
  if (IGNORED_COLUMN_NAMES.has(cleanRaw)) return null;
  if (['date', 'overall', 'target', 'average', 'summary', 'median', 'grandtotal'].some(kw => cleanRaw === kw || cleanRaw.startsWith(kw))) {
    return null;
  }

  // Exact canonical match
  for (const name of pool) {
    if (normalizeCanonical(name) === cleanRaw) {
      return name;
    }
  }

  // Alias lookup
  for (const [canonicalName, aliases] of Object.entries(KNOWN_SITE_ALIASES)) {
    for (const alias of aliases) {
      const cleanAlias = normalizeCanonical(alias);
      if (cleanAlias === cleanRaw || cleanRaw.includes(cleanAlias) || cleanAlias.includes(cleanRaw)) {
        const matched = pool.find(n => normalizeCanonical(n) === normalizeCanonical(canonicalName));
        if (matched) return matched;
        return canonicalName;
      }
    }
  }

  // Substring matching
  for (const name of pool) {
    const cleanName = normalizeCanonical(name);
    if (cleanName.length >= 4 && (cleanRaw.includes(cleanName) || cleanName.includes(cleanRaw))) {
      return name;
    }
  }

  return null;
}

/**
 * Parses uptime values from the very last row of the sheet.
 * Handles:
 * - Wide format: Column headers are Site Names, very last row has the uptime percentage for each site.
 * - Long format: Each row is a site with an uptime column.
 */
export function parseUptimeFromSheetRows(rows, allSiteNames = []) {
  if (!rows || rows.length < 2) {
    return { siteUptimes: new Map(), lastRowMetadata: null };
  }

  // Find the last row with valid uptime values
  let lastUptimeRowIdx = -1;
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r];
    if (row && row.some(cell => parseUptimeValue(cell) !== null)) {
      lastUptimeRowIdx = r;
      break;
    }
  }

  // Fallback to last non-empty row if no row had parseUptimeValue
  if (lastUptimeRowIdx <= 0) {
    for (let r = rows.length - 1; r >= 0; r--) {
      const row = rows[r];
      if (row && row.some(cell => String(cell || '').trim().length > 0)) {
        lastUptimeRowIdx = r;
        break;
      }
    }
  }

  if (lastUptimeRowIdx <= 0) {
    return { siteUptimes: new Map(), lastRowMetadata: null };
  }

  const lastRow = rows[lastUptimeRowIdx];
  const dateLabel = String(lastRow[0] || '').trim();
  const lastRowMetadata = {
    rowIndex: lastUptimeRowIdx + 1,
    dateLabel: dateLabel || `Row ${lastUptimeRowIdx + 1}`,
    cellCount: lastRow.length,
  };

  const siteUptimes = new Map();

  // Mode A: Wide format (Column headers are Site Names, Last row has uptimes)
  // Check rows 0..Math.min(10, lastUptimeRowIdx - 1) to find the best header row containing site names
  let bestHeaderRowIdx = -1;
  let maxSiteMatches = 0;
  const colToSiteMap = new Map(); // colIdx -> matchedSiteName

  for (let r = 0; r < Math.min(10, lastUptimeRowIdx); r++) {
    const candidateRow = rows[r];
    let matchCount = 0;
    const tempColMap = new Map();
    for (let c = 0; c < candidateRow.length; c++) {
      const cellText = candidateRow[c];
      const matched = matchSiteName(cellText, allSiteNames);
      if (matched) {
        matchCount++;
        tempColMap.set(c, matched);
      }
    }
    if (matchCount > maxSiteMatches) {
      maxSiteMatches = matchCount;
      bestHeaderRowIdx = r;
      colToSiteMap.clear();
      for (const [col, sName] of tempColMap.entries()) {
        colToSiteMap.set(col, sName);
      }
    }
  }

  if (maxSiteMatches >= 1) {
    // Wide format confirmed!
    console.log(`[Cloud Sheet] Wide format detected at header row ${bestHeaderRowIdx + 1} with ${maxSiteMatches} matched site columns. Reading last row #${lastUptimeRowIdx + 1} (${dateLabel})`);
    for (const [colIdx, siteName] of colToSiteMap.entries()) {
      let rawVal = lastRow[colIdx];
      let rowUsed = lastUptimeRowIdx + 1;
      let uptime = parseUptimeValue(rawVal);

      // If the very last row was blank for this specific site, look back up to 2 rows for its latest value
      if (uptime === null && lastUptimeRowIdx > 1) {
        for (let back = 1; back <= 2; back++) {
          const prevRow = rows[lastUptimeRowIdx - back];
          if (prevRow) {
            const fallbackVal = prevRow[colIdx];
            const fallbackUptime = parseUptimeValue(fallbackVal);
            if (fallbackUptime !== null) {
              uptime = fallbackUptime;
              rawVal = fallbackVal;
              rowUsed = lastUptimeRowIdx - back + 1;
              break;
            }
          }
        }
      }

      if (uptime !== null) {
        siteUptimes.set(siteName.toLowerCase(), {
          siteName,
          uptime,
          isBelow99: uptime < 99.0,
          rawVal,
          source: 'wide_last_row',
          rowIdx: rowUsed,
          dateLabel,
        });
      }
    }
    return { siteUptimes, lastRowMetadata };
  }

  // Mode B: Long format (Each row is a site, columns include Site Name and Uptime)
  const headerRow = rows[0];
  let siteCol = -1;
  let uptimeCol = -1;
  for (let c = 0; c < headerRow.length; c++) {
    const h = String(headerRow[c] || '').toLowerCase().trim();
    if (siteCol === -1 && (h === 'site' || h === 'sitename' || h.includes('site name') || h.includes('account') || h === 'location')) {
      siteCol = c;
    }
    if (uptimeCol === -1 && (h.includes('uptime') || h.includes('availability') || h.includes('avail') || h.includes('%'))) {
      uptimeCol = c;
    }
  }

  if (siteCol === -1) siteCol = 0;
  if (uptimeCol === -1) {
    // Check if the last column has percentage/uptime values
    for (let c = headerRow.length - 1; c >= 0; c--) {
      if (c !== siteCol) {
        uptimeCol = c;
        break;
      }
    }
  }

  if (uptimeCol !== -1) {
    const maxR = lastUptimeRowIdx > 0 ? lastUptimeRowIdx : rows.length - 1;
    for (let r = 1; r <= maxR; r++) {
      const row = rows[r];
      if (!row) continue;
      const rawSite = row[siteCol];
      const matched = matchSiteName(rawSite, allSiteNames);
      if (matched) {
        const rawUptime = row[uptimeCol];
        const uptime = parseUptimeValue(rawUptime);
        if (uptime !== null) {
          siteUptimes.set(matched.toLowerCase(), {
            siteName: matched,
            rawName: String(rawSite).trim(),
            uptime,
            isBelow99: uptime < 99.0,
            rawVal: rawUptime,
            source: 'long_row',
            rowIdx: r + 1,
          });
        }
      }
    }
  }

  return { siteUptimes, lastRowMetadata };
}

/**
 * Extract pre-classified Red Zone site records if the sheet contains a table of designated sites.
 */
export function extractRedZoneRecordsFromRows(headers, rows, allSiteNames = []) {
  if (!headers || headers.length === 0 || !rows || rows.length === 0) return [];

  const lowerHeaders = headers.map(h => String(h || '').trim().toLowerCase());

  let siteCol = -1;
  let statusCol = -1;
  let reasonCol = -1;
  let dateCol = -1;

  for (let idx = 0; idx < lowerHeaders.length; idx++) {
    const h = lowerHeaders[idx];
    if (siteCol === -1 && (h === 'site' || h === 'sitename' || h.includes('site name') || h.includes('site_name') || h === 'account' || h.includes('account name') || h === 'location' || h === 'facility' || h === 'customer')) {
      siteCol = idx;
    } else if (statusCol === -1 && (h === 'status' || h.includes('red zone') || h.includes('redzone') || h.includes('is red zone') || h.includes('in red zone') || h === 'category' || h === 'breach' || h === 'flag')) {
      statusCol = idx;
    } else if (reasonCol === -1 && (h === 'reason' || h.includes('justification') || h.includes('notes') || h.includes('note') || h.includes('comment') || h.includes('remarks') || h.includes('description') || h.includes('root cause'))) {
      reasonCol = idx;
    } else if (dateCol === -1 && (h === 'date' || h.includes('entry date') || h.includes('start date') || h.includes('added') || h.includes('breach date') || h.includes('created'))) {
      dateCol = idx;
    }
  }

  if (siteCol === -1) {
    siteCol = 0;
  }

  const results = [];
  const seenSites = new Set();

  for (const row of rows) {
    const rawSite = row[siteCol];
    if (!rawSite || typeof rawSite !== 'string' || !rawSite.trim()) continue;

    const matchedSite = matchSiteName(rawSite, allSiteNames);
    if (!matchedSite) continue;

    const key = matchedSite.toLowerCase();
    if (seenSites.has(key)) continue;

    let isRedZone = true;
    if (statusCol !== -1 && row[statusCol]) {
      const statVal = String(row[statusCol]).trim().toLowerCase();
      if (
        statVal === 'no' ||
        statVal === 'false' ||
        statVal === '0' ||
        statVal === 'healthy' ||
        statVal === 'normal' ||
        statVal === 'exit' ||
        statVal === 'exited' ||
        statVal === 'green' ||
        statVal === 'inactive'
      ) {
        isRedZone = false;
      } else {
        isRedZone = true;
      }
    }

    if (!isRedZone) continue;

    seenSites.add(key);
    const reason = (reasonCol !== -1 && row[reasonCol]) ? String(row[reasonCol]).trim() : 'Designated via Cloud Sheet';
    const entryDate = (dateCol !== -1 && row[dateCol]) ? String(row[dateCol]).trim() : null;

    results.push({
      siteName: matchedSite,
      rawName: rawSite.trim(),
      status: 'ACTIVE_BREACH',
      reason,
      entryDate,
      source: 'cloud_sheet',
    });
  }

  return results;
}

/**
 * Fetch and sync the Red Zone sheet from cloud URL.
 */
export async function syncRedZoneSheet({ force = false, url = null, allSiteNames = [] } = {}) {
  const targetUrl = url || _sheetState.url || process.env.RED_ZONE_SHEET_URL || DEFAULT_SHEET_URL;
  if (!targetUrl) {
    return {
      success: false,
      error: 'No Sheet URL configured. Please provide a Google Sheets or OneDrive link.',
      records: _sheetState.records,
    };
  }

  const directCsvUrl = convertCloudUrlToDirectCsv(targetUrl);
  _sheetState.isSyncing = true;

  try {
    // Check if target is a local file path
    if (fs.existsSync(targetUrl)) {
      console.log(`[Cloud Sheet] Reading directly from local file ${targetUrl}`);
      const fileText = fs.readFileSync(targetUrl, 'utf8');
      return await syncFromCsvText(fileText, allSiteNames);
    }

    let response = await fetch(directCsvUrl, {
      headers: {
        'Accept': 'text/csv, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) InsightHub/1.0',
      },
      signal: AbortSignal.timeout(20000),
    });

    // Fallback: If gviz/tq was used, also try export?format=csv
    if (!response.ok && directCsvUrl.includes('gviz/tq')) {
      const altUrl = directCsvUrl.replace('gviz/tq?tqx=out:csv', 'export?format=csv');
      try {
        const altRes = await fetch(altUrl, {
          headers: {
            'Accept': 'text/csv, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) InsightHub/1.0',
          },
          signal: AbortSignal.timeout(20000),
        });
        if (altRes.ok) {
          response = altRes;
        }
      } catch {}
    }

    if (!response.ok) {
      if (fs.existsSync(LOCAL_CACHE_PATH)) {
        console.warn(`[Cloud Sheet] Network fetch failed (${response.status}), loading cached file ${LOCAL_CACHE_PATH}`);
        const localCsv = fs.readFileSync(LOCAL_CACHE_PATH, 'utf8');
        return await syncFromCsvText(localCsv, allSiteNames);
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'Google Sheet returned 401 Unauthorized (Corporate Google Workspace restricted). Please download the sheet as CSV (File -> Download -> CSV) and click "Upload File" or "Direct Paste" in the Sheet modal.'
        );
      }
      throw new Error(`Cloud Sheet HTTP ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);

    if (rows.length < 2) {
      throw new Error('Sheet returned fewer than 2 rows. Ensure the sheet has data.');
    }

    // 1. Extract Uptime from the very last row
    const { siteUptimes, lastRowMetadata } = parseUptimeFromSheetRows(rows, allSiteNames);

    // 2. Extract any pre-designated Red Zone records if it's a pre-classification table
    const headers = rows[0];
    const dataRows = rows.slice(1);
    const records = extractRedZoneRecordsFromRows(headers, dataRows, allSiteNames);

    _sheetState.url = targetUrl;
    _sheetState.records = records;
    _sheetState.siteUptimes = siteUptimes;
    _sheetState.lastRowMetadata = lastRowMetadata;
    _sheetState.lastSyncedAt = new Date().toISOString();
    _sheetState.lastError = null;
    _sheetState.isSyncing = false;

    console.log(
      `[Cloud Sheet] Successfully synced sheet. Sites with uptime from last row: ${siteUptimes.size}. Pre-designated sites: ${records.length}.`
    );

    return {
      success: true,
      uptimeCount: siteUptimes.size,
      recordsCount: records.length,
      lastRow: lastRowMetadata,
      syncedAt: _sheetState.lastSyncedAt,
    };
  } catch (err) {
    _sheetState.lastError = err.message;
    _sheetState.isSyncing = false;
    console.error('[Cloud Sheet] Failed to sync Red Zone sheet:', err.message);
    return {
      success: false,
      error: err.message,
      records: _sheetState.records,
    };
  }
}

/**
 * Returns uptime information for a specific site from the sheet's last row.
 */
export function getSheetUptimeForSite(siteName) {
  if (!siteName) return null;
  const key = normalizeCanonical(siteName);
  for (const [sKey, info] of _sheetState.siteUptimes.entries()) {
    if (
      normalizeCanonical(sKey) === key ||
      normalizeCanonical(info.siteName) === key ||
      (info.rawName && normalizeCanonical(info.rawName) === key)
    ) {
      return info;
    }
  }

  // Alias lookup across known canonical names
  for (const [canonicalName, aliases] of Object.entries(KNOWN_SITE_ALIASES)) {
    const cleanCanon = normalizeCanonical(canonicalName);
    const matchesTarget = cleanCanon === key || aliases.some(a => normalizeCanonical(a) === key);
    if (matchesTarget) {
      for (const [sKey, info] of _sheetState.siteUptimes.entries()) {
        const infoCan = normalizeCanonical(info.siteName || sKey);
        if (infoCan === cleanCanon || aliases.some(a => normalizeCanonical(a) === infoCan)) {
          return info;
        }
      }
    }
  }

  return null;
}

/**
 * Returns all parsed site uptimes.
 */
export function getAllSheetSiteUptimes() {
  return Array.from(_sheetState.siteUptimes.values());
}

/**
 * Returns true if valid sheet uptimes are loaded in cache.
 */
export function hasActiveSheetUptime() {
  return _sheetState.siteUptimes && _sheetState.siteUptimes.size > 0;
}

/**
 * Returns currently cached sheet-designated Red Zone sites.
 */
export function getSheetDesignatedRedZoneSites() {
  return _sheetState.records || [];
}

/**
 * Returns current sheet configuration and sync metadata.
 */
export function getSheetConfig() {
  return {
    url: _sheetState.url || process.env.RED_ZONE_SHEET_URL || DEFAULT_SHEET_URL,
    lastSyncedAt: _sheetState.lastSyncedAt,
    lastError: _sheetState.lastError,
    isSyncing: _sheetState.isSyncing,
    count: _sheetState.records.length,
    uptimeSitesCount: _sheetState.siteUptimes.size,
    lastRow: _sheetState.lastRowMetadata,
    uptimeSitesBelow99: Array.from(_sheetState.siteUptimes.values())
      .filter(u => u.isBelow99)
      .map(u => ({ siteName: u.siteName, uptime: u.uptime })),
    sites: _sheetState.records.map(r => ({
      siteName: r.siteName,
      rawName: r.rawName,
      reason: r.reason,
      entryDate: r.entryDate,
    })),
  };
}

/**
 * Sets new sheet URL and triggers sync.
 */
export async function updateSheetUrlAndSync(newUrl, allSiteNames = []) {
  _sheetState.url = String(newUrl || '').trim();
  return await syncRedZoneSheet({ force: true, url: _sheetState.url, allSiteNames });
}

/**
 * Directly parses and syncs from CSV/TSV text (e.g. pasted directly or uploaded from corporate sheets).
 */
export async function syncFromCsvText(csvText, allSiteNames = []) {
  if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
    return {
      success: false,
      error: 'CSV/TSV content is empty. Please paste the spreadsheet rows.',
      records: _sheetState.records,
    };
  }

  try {
    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      throw new Error('Provided text contains fewer than 2 rows. Please paste the full sheet data.');
    }

    const { siteUptimes, lastRowMetadata } = parseUptimeFromSheetRows(rows, allSiteNames);
    const headers = rows[0];
    const dataRows = rows.slice(1);
    const records = extractRedZoneRecordsFromRows(headers, dataRows, allSiteNames);

    _sheetState.records = records;
    _sheetState.siteUptimes = siteUptimes;
    _sheetState.lastRowMetadata = lastRowMetadata;
    _sheetState.lastSyncedAt = new Date().toISOString();
    _sheetState.lastError = null;
    _sheetState.isSyncing = false;

    // Cache to local file so it persists across server restarts
    try {
      fs.writeFileSync(LOCAL_CACHE_PATH, csvText, 'utf8');
      console.log(`[Cloud Sheet] Cached CSV data saved to ${LOCAL_CACHE_PATH}`);
    } catch {}

    console.log(
      `[Cloud Sheet] Successfully synced from direct CSV/TSV text. Sites with uptime from last row: ${siteUptimes.size}. Pre-designated sites: ${records.length}.`
    );

    return {
      success: true,
      uptimeCount: siteUptimes.size,
      recordsCount: records.length,
      lastRow: lastRowMetadata,
      syncedAt: _sheetState.lastSyncedAt,
    };
  } catch (err) {
    _sheetState.lastError = err.message;
    return {
      success: false,
      error: err.message,
      records: _sheetState.records,
    };
  }
}

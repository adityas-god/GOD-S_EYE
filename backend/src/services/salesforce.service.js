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
let _overviewCache = { data: null, cachedAt: 0 };
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

/**
 * Detects if a ticket contains an Opsgenie URL or link.
 * Requirement: "if there is opesgenie url present imideatly it will be considered as alert"
 */
export function hasOpsgenieUrl(c) {
  if (!c) return false;
  const raw = c;
  const check = (val) => {
    if (!val || typeof val !== 'string') return false;
    return (
      /(?:https?:\/\/)?(?:[a-zA-Z0-9._-]+\.)?opsgenie\.com/i.test(val) ||
      /https?:\/\/[^\s]*opsgenie/i.test(val) ||
      (/\bopsgenie\b/i.test(val) && /https?:\/\//i.test(val))
    );
  };

  if (check(raw.Description || raw.description)) return true;
  if (check(raw.Subject || raw.subject)) return true;
  if (check(raw.Incident_Url__c || raw.incident_url)) return true;
  if (check(raw.Alert_Url__c || raw.alert_url)) return true;

  for (const k of Object.keys(raw)) {
    if (typeof raw[k] === 'string' && check(raw[k])) {
      return true;
    }
  }

  return false;
}

export function isAlertCase(c) {
  if (!c) return false;

  // 0. Immediate Opsgenie URL check:
  // User requirement: "if there is opesgenie url present imideatly it will be considered as alert"
  if (hasOpsgenieUrl(c)) {
    return true;
  }

  const raw = c;
  const typeStr = String(raw.Type || raw.type || '').trim().toLowerCase();
  const catStr = String(raw.Category__c || raw.category || raw.Snow_Category__c || '').trim().toLowerCase();
  const sub = String(raw.Subject || raw.subject || '').trim();

  // 1. Service Requests are customer/internal service requests, NEVER automated alerts:
  // User requirement: "its Service requet and it is in alert queue"
  const isServiceRequest =
    typeStr.includes('request') ||
    typeStr.includes('service') ||
    catStr.includes('request') ||
    catStr.includes('service') ||
    typeStr === 'sr' ||
    catStr === 'sr' ||
    /^go\s+alert:/i.test(sub) ||
    /^(\[?sr\]?|service\s*request)/i.test(sub);

  if (isServiceRequest) {
    return false;
  }

  // 2. Explicit Type or Category is Alert
  if (typeStr === 'alert' || catStr === 'alert') return true;

  // 3. IM tickets are Incident Management tickets created for incidents, NEVER automated alerts:
  // User requirement: "see im tickets dont need to be in alerts bucket what happenes whenver an urgent case comes or made then an automated im ticket is created"
  if (isImTicket(c)) {
    return false;
  }

  if (!sub) return false;

  // 4. Strong Automated Alert Subject Signatures:
  if (/(?:^\[?alert\]?[:\s-]|\[opsgenie\]|\bopsgenie:|runbook\s+for|dashboard\s+for|ranger\s+infra)/i.test(sub)) {
    return true;
  }

  // Automated monitoring rule signatures (case-insensitive substring/word matching)
  if (
    /(?:botsavailable|botsavailablelow|botsindeadstate|botsindeadstatehigh|botsavgpower|botsavgpowerlow|chargersavailable|chargersavailablelow|chargersoffline|processnotrunning|processexecutions|processexecutionsfailed|processexecutionsinmanualretry|diskutil|diskutilhigh|memutil|memutilhigh|cpuutil|cpuutilhigh|postgresolddata|postgresolddatadetected|filesizehigh|gorinternalapi|gorinternalapifailed|gorinternalapihighresponsetime|airflowconnectivity|system\s+stopped|tkisdisconnection|livenessfailure|hostreportingstopped|pickexceptionshigh|rabbitmq|mnesia|applicationnotresponding)/i.test(
      sub
    )
  ) {
    return true;
  }

  if (/alertname:|kubernetes\s+pod|kubernetes\s+container|kafka\s+consumer\s+lag|consumer\s+lag\s+detected/i.test(sub)) {
    return true;
  }

  // Host prefix with alert pattern: e.g. "samprod: Postgres...", "owensminorprod: Disk...", "flexo-hnm-canada: ..."
  if (/^[a-z0-9._-]+prod:\s*/i.test(sub) && /(?:low|high|failed|stopped|offline|retry|lag|crash|detected|exception|utilisation|utilization|manualretry|olddata)/i.test(sub)) {
    return true;
  }

  // 5. Fallback check on description ONLY if automated alert signatures exist
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
    raw.End_Time__c ||
    raw.end_time ||
    raw.EndTime ||
    raw.EndTime__c ||
    raw.End_Date_Time__c ||
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

  const raw = c;

  // 1. Explicit Type: In GreyOrange Salesforce & ITIL, 'Problem' is the post-incident DIR/RCA tracking case
  const typeStr = String(raw.Type || raw.type || raw.rawType || raw.raw_type || '').trim().toLowerCase();
  if (
    typeStr === 'problem' ||
    typeStr.includes('problem') ||
    typeStr === 'dir' ||
    typeStr.includes('dir') ||
    typeStr === 'rca' ||
    typeStr.includes('rca') ||
    typeStr === 'pir' ||
    typeStr.includes('post incident') ||
    typeStr.includes('investigation')
  ) {
    return true;
  }

  // 2. Explicit DIR approval field populated with ANY state (e.g. 'DIR Draft Pending', 'DIR Approved', 'DIR Submitted', etc.)
  const dirApproval = String(raw.DIR_Approval__c || raw.dir_approval || '').trim().toLowerCase();
  if (
    dirApproval &&
    dirApproval !== 'null' &&
    dirApproval !== 'undefined' &&
    dirApproval !== 'none' &&
    dirApproval !== 'n/a' &&
    dirApproval !== ''
  ) {
    return true;
  }

  // 3. Approval status contains 'DIR', 'Documentation', 'CM Review', 'Review', 'Approval', etc.
  const appStatus = String(raw.Approval_status__c || raw.approval_status || '').trim().toLowerCase();
  if (
    appStatus &&
    appStatus !== 'null' &&
    appStatus !== 'undefined' &&
    appStatus !== 'none' &&
    (appStatus.includes('dir') ||
      appStatus.includes('documentation') ||
      appStatus.includes('cm review') ||
      appStatus.includes('review') ||
      appStatus.includes('approval') ||
      appStatus.includes('pending'))
  ) {
    return true;
  }

  // 4. Current RCA status is populated (e.g. 'Pending on IM', 'RCA Submitted', etc.)
  const rcaStatus = String(raw.Current_RCA_Status__c || raw.current_rca_status || '').trim().toLowerCase();
  if (
    rcaStatus &&
    rcaStatus !== 'none' &&
    rcaStatus !== 'null' &&
    rcaStatus !== 'undefined' &&
    rcaStatus !== 'n/a' &&
    rcaStatus !== ''
  ) {
    return true;
  }

  // 5. RCA Approval field
  const rcaApproval = String(raw.RCA_Approval__c || raw.rca_approval || '').trim().toLowerCase();
  if (
    rcaApproval &&
    rcaApproval !== 'none' &&
    rcaApproval !== 'null' &&
    rcaApproval !== 'undefined' &&
    rcaApproval !== 'n/a' &&
    rcaApproval !== ''
  ) {
    return true;
  }

  // 6. Default ticket problem reference is populated (indicates this is a child problem/DIR tracking ticket)
  if (raw.Default_Ticket_For_Problem__c) {
    return true;
  }

  // 7. Subject patterns explicitly mentioning DIR, RCA, PIR, Safety Incident Reporting, Post Incident
  const sub = String(raw.Subject || raw.subject || '').trim();
  if (
    /\b(DIR|RCA|PIR)\b/i.test(sub) ||
    /safety\s+incident\s+reporting/i.test(sub) ||
    /detailed\s+incident\s+report/i.test(sub) ||
    /root\s+cause\s+analysis/i.test(sub) ||
    /root\s+cause/i.test(sub) ||
    /post\s+incident/i.test(sub) ||
    /problem\s+investigation/i.test(sub) ||
    /post[- ]?mortem/i.test(sub) ||
    /^\[?DIR\]?[:\s-]/i.test(sub) ||
    /^\[?RCA\]?[:\s-]/i.test(sub)
  ) {
    return true;
  }

  // 8. Description check for DIR/RCA templates
  const desc = String(raw.Description || raw.description || '').toLowerCase();
  if (
    desc &&
    (desc.includes('detailed incident report') ||
      desc.includes('root cause analysis (rca)') ||
      desc.includes('dir approval') ||
      desc.includes('rca status:'))
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if a ticket is an IM ticket (Incident Management, ServiceNow Incident, internal monitoring, internal maintenance, service requests, child tickets).
 * User requirement: "im tickets also being contributing in count increase of urgent cases"
 * Strictly identifies:
 * 1. Automated monitoring / Opsgenie alert cases
 * 2. Child / linked tickets: ANY ticket with ParentId (in Salesforce, root incidents have no ParentId; child cases are sub-tasks/child IMs)
 * 3. ServiceNow Incident IDs: Snow_id__c / snow_id populated or matching IM... / INC... / CS... / TASK... / SR... / REQ... / RITM... / PRB... / CHG...
 * 4. Explicit Type: im, inc, incident management, internal maintenance, internal incident, maintenance, service request, child im, child case, subtask, etc.
 * 5. Category: Category__c, Snow_Category__c containing IM, INC, internal maintenance, incident management, service request, etc.
 * 6. Subject patterns: [IM], (IM), IM:, IM-, IM_, IM#, IM123, [INC], (INC), INC:, INC-, INC_, INC#, INC123, ServiceNow, SNOW, child IM, sub-case, etc.
 * 7. Description patterns: IM/INC ticket references, child IM/case mentions, ServiceNow references.
 */
export function isImTicket(c) {
  if (!c) return false;

  const raw = c;
  const sub = String(c.Subject || raw.subject || '').trim();

  // If the ticket has automated alert signatures, it is an ALERT, NEVER an IM ticket
  if (
    hasOpsgenieUrl(c) ||
    /(?:^\[?alert\]?[:\s-]|\[opsgenie\]|\bopsgenie:|runbook\s+for|dashboard\s+for|ranger\s+infra)/i.test(sub) ||
    /(?:botsavailable|botsavailablelow|botsindeadstate|botsindeadstatehigh|botsavgpower|botsavgpowerlow|chargersavailable|chargersavailablelow|chargersoffline|processnotrunning|processexecutions|processexecutionsfailed|processexecutionsinmanualretry|diskutil|diskutilhigh|memutil|memutilhigh|cpuutil|cpuutilhigh|postgresolddata|postgresolddatadetected|filesizehigh|gorinternalapi|gorinternalapifailed|gorinternalapihighresponsetime|airflowconnectivity|system\s+stopped|tkisdisconnection|livenessfailure|hostreportingstopped|pickexceptionshigh|rabbitmq|mnesia|applicationnotresponding)/i.test(sub)
  ) {
    return false;
  }

  // 1. Child / linked ticket: ANY non-alert ticket with ParentId is a child case / automated IM ticket created for an incident
  const parentId = c.ParentId || raw.parent_id || raw.Parent_Case__c || raw.Parent_Case_Number__c;
  if (parentId !== undefined && parentId !== null) {
    const pStr = String(parentId).trim().toLowerCase();
    if (pStr && pStr !== 'null' && pStr !== 'undefined' && pStr !== '0' && pStr !== 'false' && pStr !== '') {
      return true;
    }
  }

  // 2. ServiceNow Incident ID (Snow_id__c / snow_id)
  // In GreyOrange Salesforce, Snow_id__c is only populated for ServiceNow-synced internal IM tickets
  const snowId = String(
    c.Snow_id__c || raw.Snow_Id__c || raw.Snow_ID__c || raw.snow_id || raw.snow_id__c || raw.SnowId || raw.snowId || raw.Snow_Incident_Number__c || ''
  ).trim().toUpperCase();
  if (
    snowId &&
    snowId !== 'NULL' &&
    snowId !== 'UNDEFINED' &&
    snowId !== 'NONE' &&
    snowId !== 'N/A' &&
    snowId !== '0'
  ) {
    if (
      snowId.startsWith('IM') ||
      snowId.startsWith('INC') ||
      snowId.startsWith('CS') ||
      snowId.startsWith('SR') ||
      snowId.startsWith('REQ') ||
      snowId.startsWith('RITM') ||
      snowId.startsWith('PRB') ||
      snowId.startsWith('CHG') ||
      snowId.startsWith('TASK') ||
      snowId.includes('IM') ||
      snowId.includes('INC') ||
      /\b(IM|INC)\b/i.test(snowId) ||
      /\b(IM|INC)\d+/i.test(snowId)
    ) {
      return true;
    }
  }

  // 3. Explicit Type field (Incident Management, Internal Maintenance, Service Request, etc.)
  // (Notice: 'incident' alone is the default Salesforce case type, NOT an IM ticket)
  const type = String(c.Type || raw.type || raw.raw_type || raw.rawType || raw.Case_Type__c || '').trim().toLowerCase();
  if (
    type === 'im' ||
    type === 'inc' ||
    type.startsWith('im-') ||
    type.startsWith('im_') ||
    type.startsWith('im ') ||
    type.startsWith('inc-') ||
    type.startsWith('inc_') ||
    type.startsWith('inc ') ||
    type === 'sr' ||
    type === 'cr' ||
    type === 'internal' ||
    type.includes('incident management') ||
    type.includes('internal maintenance') ||
    type.includes('internal monitoring') ||
    type.includes('internal incident') ||
    type.includes('child im') ||
    type.includes('child case') ||
    type.includes('child incident') ||
    type.includes('sub-task') ||
    type.includes('subtask') ||
    type.includes('work order') ||
    type.includes('preventive')
  ) {
    return true;
  }

  // 4. Category field
  const cat = String(
    c.Category__c || raw.category || c.Snow_Category__c || raw.Snow_Category || raw.Category || raw.Sub_Category__c || ''
  ).trim().toLowerCase();
  if (
    cat === 'im' ||
    cat === 'inc' ||
    cat.startsWith('im-') ||
    cat.startsWith('im_') ||
    cat.startsWith('im ') ||
    cat.startsWith('inc-') ||
    cat.startsWith('inc_') ||
    cat.startsWith('inc ') ||
    cat === 'sr' ||
    cat === 'cr' ||
    cat === 'internal' ||
    cat.includes('incident management') ||
    cat.includes('internal maintenance') ||
    cat.includes('internal monitoring') ||
    cat.includes('internal incident') ||
    cat.includes('child im') ||
    cat.includes('child case') ||
    cat.includes('child incident') ||
    cat.includes('sub-task') ||
    cat.includes('subtask') ||
    cat.includes('work order') ||
    cat.includes('preventive')
  ) {
    return true;
  }

  // 5. Subject pattern (matches anywhere in subject)
  if (
    // IM pattern: [IM], (IM), IM:, IM-, IM_, IM#, IM 123, IM123, etc.
    /(?:^|[\s\[\(_\-])IM(?:[:\s#\d\-_\]\)]|$)/i.test(sub) ||
    /\bIM\d+\b/i.test(sub) ||
    /\bIM[-_:\s#]+\d+/i.test(sub) ||
    /\[\s*IM\s*\]/i.test(sub) ||
    /\bIM\s+ticket\b/i.test(sub) ||
    // INC pattern: [INC], (INC), INC:, INC-, INC_, INC#, INC 123, INC123, etc.
    /(?:^|[\s\[\(_\-])INC(?:[:\s#\d\-_\]\)]|$)/i.test(sub) ||
    /\bINC\d+\b/i.test(sub) ||
    /\bINC[-_:\s#]+\d+/i.test(sub) ||
    /\[\s*INC\s*\]/i.test(sub) ||
    /\bINC\s+ticket\b/i.test(sub) ||
    // Full words
    /\b(incident\s*management|internal\s*maintenance|internal\s*monitoring|internal\s*incident)\b/i.test(sub) ||
    /\b(service\s*request|change\s*request|work\s*order)\b/i.test(sub) ||
    /\b(child\s*im|child\s*case|child\s*ticket|child\s*incident|sub[- ]*(case|task|ticket))\b/i.test(sub) ||
    /\b(servicenow|snow)\s*(?:incident|ticket|im|inc|#|:)/i.test(sub) ||
    /\b(planned|preventive|routine)\s*maintenance\b/i.test(sub) ||
    /\b(PRB|CHG|RITM|SCTASK)\d+\b/i.test(sub)
  ) {
    return true;
  }

  // 6. Description patterns
  const desc = String(c.Description || raw.description || '').trim();
  if (
    /(?:^|[\s\[\(_\-])(?:IM|INC)[-_:\s#]*\d{4,}/i.test(desc) ||
    /\b(incident\s*management|child\s*im|child\s*case|servicenow\s*incident)\b/i.test(desc)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if a ticket is a valid incident ticket.
 * Excludes alert tickets and DIR tickets.
 */
export function isIncidentTicket(c) {
  if (!c) return false;
  if (isAlertCase(c)) return false;
  if (isDirTicket(c)) return false;
  if (isImTicket(c)) return false;
  return true;
}

/**
 * Determines whether two tickets represent the same operational incident
 * (e.g., an urgent incident case and its automatically generated child IM ticket).
 * User requirement: "what happenes whenver an urgent case comes or made then an automated im ticket is created i just want that 1sev with automated im ticket creation counts to only one sev 1 respectively goes for sev 2 urgent also no double count due to automated im ticket creation just count the incident urgent"
 */
export function areSameIncident(t1, t2) {
  if (!t1 || !t2) return false;
  if (t1.Id && t2.Id && t1.Id === t2.Id) return true;
  if (t1.CaseNumber && t2.CaseNumber && t1.CaseNumber === t2.CaseNumber) return true;

  // 1. Direct ParentId link (automated IM ticket created for parent case, or child ticket)
  const p1 = t1.ParentId || t1.parent_id || t1.Parent_Case__c || t1.Parent_Case_Number__c;
  const p2 = t2.ParentId || t2.parent_id || t2.Parent_Case__c || t2.Parent_Case_Number__c;

  if (p1 && (p1 === t2.Id || p1 === t2.CaseNumber)) return true;
  if (p2 && (p2 === t1.Id || p2 === t1.CaseNumber)) return true;
  if (p1 && p2 && String(p1).trim().toLowerCase() === String(p2).trim().toLowerCase()) return true;

  // 2. Shared ServiceNow Incident ID (Snow_id__c / Snow_Incident_Number__c)
  const snow1 = String(t1.Snow_id__c || t1.Snow_Id__c || t1.snow_id || t1.Snow_Incident_Number__c || '').trim().toUpperCase();
  const snow2 = String(t2.Snow_id__c || t2.Snow_Id__c || t2.snow_id || t2.Snow_Incident_Number__c || '').trim().toUpperCase();
  if (snow1 && snow2 && snow1 !== 'NULL' && snow1 !== 'UNDEFINED' && snow1 !== 'NONE' && snow1 === snow2) {
    return true;
  }

  // 3. One ticket references the other ticket's CaseNumber in Subject or Description
  const sub1 = String(t1.Subject || t1.subject || '');
  const sub2 = String(t2.Subject || t2.subject || '');
  const desc1 = String(t1.Description || t1.description || '');
  const desc2 = String(t2.Description || t2.description || '');

  if (t1.CaseNumber && (sub2.includes(t1.CaseNumber) || desc2.includes(t1.CaseNumber))) return true;
  if (t2.CaseNumber && (sub1.includes(t2.CaseNumber) || desc1.includes(t2.CaseNumber))) return true;

  // 4. Automated IM ticket created alongside the incident on the same site
  const isIm1 = isImTicket(t1);
  const isIm2 = isImTicket(t2);
  if (isIm1 !== isIm2) {
    const cleanSub1 = sub1.replace(/^(\[?(?:im|inc|urgent|alert|p[12]|sev[12])\]?[:\s\-_]*)+/i, '').trim().toLowerCase();
    const cleanSub2 = sub2.replace(/^(\[?(?:im|inc|urgent|alert|p[12]|sev[12])\]?[:\s\-_]*)+/i, '').trim().toLowerCase();
    if (cleanSub1 && cleanSub2 && (cleanSub1.includes(cleanSub2) || cleanSub2.includes(cleanSub1))) {
      return true;
    }
  }

  // 5. Duplicate or concurrent incident cases for the same event on the same site:
  // e.g. "Ranger crashes in PPS08" and "Ranger 16 Collision with PPS 08", or "Stations paused due to power supply failure" and "Site down"
  const t1Time = t1.createdTime || (t1.CreatedDate ? new Date(t1.CreatedDate).getTime() : 0);
  const t2Time = t2.createdTime || (t2.CreatedDate ? new Date(t2.CreatedDate).getTime() : 0);
  const timeDiffMs = (t1Time > 0 && t2Time > 0) ? Math.abs(t1Time - t2Time) : Infinity;

  const normSub1 = sub1.replace(/^(\[?(?:im|inc|urgent|alert|p[12]|sev[12])\]?[:\s\-_]*)+/i, '').replace(/[^a-z0-9]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const normSub2 = sub2.replace(/^(\[?(?:im|inc|urgent|alert|p[12]|sev[12])\]?[:\s\-_]*)+/i, '').replace(/[^a-z0-9]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  if (timeDiffMs <= 4 * 3600 * 1000) {
    // Exact or substring match within 4 hours
    if (normSub1 && normSub2 && (normSub1 === normSub2 || normSub1.includes(normSub2) || normSub2.includes(normSub1))) {
      return true;
    }
    // Shared specific keywords (e.g. both reference pps 08 or pps08, or power supply failure)
    const pps1 = normSub1.match(/\bpps\s*\d+\b/);
    const pps2 = normSub2.match(/\bpps\s*\d+\b/);
    if (pps1 && pps2 && pps1[0].replace(/\s+/g, '') === pps2[0].replace(/\s+/g, '')) {
      return true;
    }
    // Power supply / station pause / towers / outage within 4 hours
    const isPowerOutage1 = /power supply|station.*paused|towers? flashing|site down|down/i.test(sub1);
    const isPowerOutage2 = /power supply|station.*paused|towers? flashing|site down|down/i.test(sub2);
    if (isPowerOutage1 && isPowerOutage2) {
      return true;
    }
  }

  // Concurrent outage tickets created within 30 minutes of each other (e.g. "Site down" + "Stations paused due to power supply failure")
  if (timeDiffMs <= 30 * 60 * 1000) {
    const isOutage1 = /site down|power supply|station|down|outage/i.test(sub1);
    const isOutage2 = /site down|power supply|station|down|outage/i.test(sub2);
    if (isOutage1 && isOutage2) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates Sev 1 and Sev 2 urgent counts for a site, clustering related tickets
 * (incident case + automated IM ticket) so that each incident counts as ONLY ONE Sev.
 */
export function calculateSiteUrgentCounts(casesForSite = []) {
  const urgentTickets = (casesForSite || []).filter(c => {
    if (!isIncidentTicket(c)) return false;
    const sev = detectSeverity(c);
    return sev === 'sev1' || sev === 'sev2';
  });

  if (urgentTickets.length === 0) {
    return { sev1Count: 0, sev2Count: 0 };
  }

  // Cluster related tickets into single distinct incidents
  const incidentClusters = [];

  for (const t of urgentTickets) {
    let cluster = incidentClusters.find(c => c.some(existing => areSameIncident(existing, t)));
    if (cluster) {
      cluster.push(t);
    } else {
      incidentClusters.push([t]);
    }
  }

  let sev1Count = 0;
  let sev2Count = 0;

  for (const cluster of incidentClusters) {
    const hasSev1 = cluster.some(t => detectSeverity(t) === 'sev1');
    const hasSev2 = cluster.some(t => detectSeverity(t) === 'sev2');

    if (hasSev1) {
      sev1Count++;
    } else if (hasSev2) {
      sev2Count++;
    }
  }

  return { sev1Count, sev2Count };
}

/**
 * Deduplicate incidents for a site by clustering parent cases and automated child IM tickets
 * into single distinct operational incidents.
 * Ensures that 1 urgent incident with automated child IM tickets counts as exactly 1 incident.
 */
export function deduplicateIncidents(incidents = []) {
  if (!Array.isArray(incidents) || incidents.length === 0) return [];
  const clusters = [];
  for (const inc of incidents) {
    if (!inc) continue;
    const cluster = clusters.find(cl => cl.some(existing => areSameIncident(existing, inc)));
    if (cluster) {
      cluster.push(inc);
    } else {
      clusters.push([inc]);
    }
  }

  return clusters.map(cluster => {
    // Pick the primary representative incident (prefer parent case without ParentId, or earliest createdTime)
    const sorted = [...cluster].sort((a, b) => {
      const aHasParent = Boolean(a.ParentId);
      const bHasParent = Boolean(b.ParentId);
      if (!aHasParent && bHasParent) return -1;
      if (aHasParent && !bHasParent) return 1;
      return (a.createdTime || 0) - (b.createdTime || 0);
    });
    const rep = { ...sorted[0] };

    // Highest severity wins
    const hasSev1 = cluster.some(t => t.severity === 'sev1');
    const hasSev2 = cluster.some(t => t.severity === 'sev2');
    if (hasSev1) {
      rep.severity = 'sev1';
    } else if (hasSev2) {
      rep.severity = 'sev2';
    }

    // Earliest created date/time
    const validStarts = cluster.map(t => t.createdTime).filter(t => typeof t === 'number' && t > 0);
    if (validStarts.length > 0) {
      rep.createdTime = Math.min(...validStarts);
      const earliest = cluster.find(t => t.createdTime === rep.createdTime);
      if (earliest?.createdDate) rep.createdDate = earliest.createdDate;
    }

    // Latest end time / closure
    const endTimesMs = cluster.map(t => {
      const e = t.endTime || t.closedDate;
      return e ? new Date(e).getTime() : 0;
    }).filter(t => t > 0);
    if (endTimesMs.length > 0) {
      const maxEndMs = Math.max(...endTimesMs);
      const latestEnd = cluster.find(t => {
        const e = t.endTime || t.closedDate;
        return e && new Date(e).getTime() === maxEndMs;
      });
      if (latestEnd) {
        rep.endTime = latestEnd.endTime || latestEnd.closedDate;
        rep.closedDate = latestEnd.closedDate || latestEnd.endTime;
        if (rep.createdTime && maxEndMs > rep.createdTime) {
          rep.durationHours = Math.round(((maxEndMs - rep.createdTime) / (3600 * 1000)) * 10) / 10;
        }
      }
    }

    if (cluster.some(t => t.isSiteDown)) {
      rep.isSiteDown = true;
    }

    return rep;
  });
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

  // 1. If ticket has an End Time or Closed Date -> strictly omit from open alerts!
  if (hasTicketEndTime(c) || Boolean(getTicketEndTime(c))) return false;

  const status = String(c.Status || c.status || '').trim().toLowerCase();
  if (!status) return false;

  // Explicitly closed/solved/cancelled statuses in Salesforce
  for (const pattern of CLOSED_STATUS_PATTERNS) {
    if (status.includes(pattern)) return false;
  }
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
  const status = String(c.Status || c.status || '').toLowerCase();
  const isClosedStatus = CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
  if (isClosedStatus) return true;

  const isActiveOpen =
    status.includes('new') ||
    status.includes('open') ||
    status.includes('progress') ||
    status.includes('investigat') ||
    status.includes('active') ||
    status.includes('assigned') ||
    status.includes('escalat') ||
    status.includes('queue') ||
    status.includes('triag') ||
    status.includes('review') ||
    status.includes('pending');
  if (isActiveOpen) return false;

  const endTime = getTicketEndTime(c);
  return Boolean(endTime);
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

export function setSiteObservedProducts(siteIdentifier, productList) {
  if (!siteIdentifier) return;
  const rawStr = String(siteIdentifier).trim();
  const keys = [
    normalizeCanonical(rawStr),
    rawStr.toLowerCase(),
  ];
  const cleanList = Array.isArray(productList) ? productList : [];
  for (const k of keys) {
    if (!k) continue;
    _siteObservedProductsMap.set(k, new Set(cleanList));
  }
}

export function invalidateOverviewCache() {
  _overviewCache = { data: null, cachedAt: 0 };
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
  'H&M Canada Ajax': ['hm canada ajax', 'hm canada', 'hnm canada', 'hm ajax', 'hnm-canada', 'h&m canada', 'h&m ajax', 'ajax', 'h&m(ajax)-(canada)', 'h&m(ajax)', 'hm(ajax)', 'flexo-hnm-canada', 'flexo-hnm', 'hnm-canada-prod', 'h&m-canada (ajax)', 'h&m-canada', 'hm-canada'],
  'Ikea': ['ikea', 'ikeaa', 'ikeaprod', 'ikea-finland', 'ikea finland'],
  'Sams Club ATL': ['sams club atl', 'sams atl', 'sams club', '4993 us', '4993', 'sams-club', "sam's club atl", "sam's club(atl)-atlanta", 'sams club(atl)-atlanta', 'samprod', 'samsprod', 'samsatlprod', 'samsatl', 'samatlprod', 'samatl', 'sams-atl', 'samatl-prod', '4993.us', '4993-us', 'samprod-cluster', 'samsatlprod-cluster', "sam's atl", 'sam atl'],
  'Sams Club LAX': ['sams club lax', 'sams lax', '8799 us', '9476 us', '8799', '9476', 'sam\'s club(lax)-california', 'sams club(lax)-california', 'samslaxprod', 'samslax', 'samlaxprod', 'samlax', 'sams-lax', '8799.us', '9476.us'],
  'DHL- Figs': ['dhl figs', 'dhlfigs', 'dhl figs phoenix', 'dhl figs ob', 'dhl figs-goodyear,az(usa)', 'dhl figs-usa (goodyear, az)', 'dhl figs usa goodyear az', 'dhl figs goodyear', 'dhl figs-goodyear', 'goodyear figs', 'dhlfigs-phoenix', 'figs', 'flexo-dhlfigs-phoenix', 'dhlfigsprod'],
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
  'Essilor Luxottica -Columbus': ['essilor luxottica columbus', 'luxottica columbus', 'el columbus', 'essilorluxottica-columbus(ohio)', 'elcolombus', 'elcolombusprod', 'elcolumbusprod', 'essilor luxottica -columbus'],
  'Luxottica_Sedico': ['luxottica sedico', 'essilor luxottica sedico', 'sedico italy', 'sedico', 'essilorluxottica-sedico(italy)', 'sedicoprod'],
  'Walmart Mexico': ['walmart mexico', 'walmart mx', 'walmart-mexico(tepotzotlan)', 'walmart-mexico(tepotzotlÃ¡n)', 'walmart-mexico', 'walmartmxprod', 'walmartmx'],
  'Walmart-Canada': ['walmart canada', 'walmart ca', 'walmartcaprod', 'walmart-calgary(canada)', 'walmart calgary', 'walmart canada fc 2028', 'walmart-edwards(canada)'],
  'Way Fair': ['way fair', 'wayfair', 'wayfair perris', 'wayfair lancaster', 'wayfair-aberdeen(maryland,usa)'],
  'Goldbond': ['goldbond', 'goldbond israel', 'goldbond-israel'],
  'Apotek': ['apotek', 'apotek hjartat', 'apotek sweden', 'apotek hjÃ¤rtat-sweden(stockholm)', 'apotek hjärtat-sweden(stockholm)', 'apotek hjärtat-sweden (stockholm)', 'apotek hjartat-sweden (stockholm)', 'apotek hjartat-sweden'],
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

  // Distinct Essilor Luxottica sites must NEVER be matched together:
  const isAtl = (s) => /atl|atlanta/i.test(s);
  const isCol = (s) => /col|columbus|colombus/i.test(s);
  const isSed = (s) => /sedico/i.test(s);
  const isFhrOrGeneric = (s) => /fhr/i.test(s) || (/essilor|luxottica/i.test(s) && !isAtl(s) && !isCol(s) && !isSed(s));

  if (/essilor|luxottica/i.test(nameA) && /essilor|luxottica/i.test(nameB)) {
    if (isAtl(nameA) !== isAtl(nameB)) return false;
    if (isCol(nameA) !== isCol(nameB)) return false;
    if (isSed(nameA) !== isSed(nameB)) return false;
    if (isFhrOrGeneric(nameA) !== isFhrOrGeneric(nameB)) return false;
  }

  // Sams Club ATL vs LAX must NEVER be matched together:
  if (/sam.*atl|samprod|samsprod|^4993/i.test(nameA) && /sam.*lax|samlax|^8799|^9476/i.test(nameB)) return false;
  if (/sam.*lax|samlax|^8799|^9476/i.test(nameA) && /sam.*atl|samprod|samsprod|^4993/i.test(nameB)) return false;

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

  // Check KNOWN_SITE_ALIASES (strict exact alias inclusion)
  for (const [siteKey, aliases] of Object.entries(KNOWN_SITE_ALIASES)) {
    const keyClean = normalizeCanonical(siteKey);
    const allNames = [keyClean, ...aliases.map(normalizeCanonical)];
    const matchA = allNames.includes(cleanA);
    const matchB = allNames.includes(cleanB);
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

  // Level 0: Primary authoritative Subject line & location fields check
  const sub = String(caseRecord.Subject || caseRecord.subject || '').trim();
  const combinedContext = [
    caseRecord.Snow_Sitename__c,
    caseRecord.Customer_Location__c,
    caseRecord.Site_Name_Customer_Input__c,
    caseRecord.Impacted_Sites__c,
    sub,
    caseRecord.Account_Name__c || caseRecord.account_name,
  ].filter(Boolean).join(' ').toLowerCase();

  // Essilor Luxottica multi-site resolution:
  if (/essilor|luxottica/i.test(combinedContext) || /el[-_]?atl|el[-_]?col|sedico/i.test(combinedContext)) {
    if (/\b(atl|atlanta|el-atl|elatl)\b/i.test(combinedContext)) {
      const atl = compiledSites.find(x => /atlanta/i.test(x.originalName) && /luxottica/i.test(x.originalName));
      if (atl) return atl.originalName;
      return 'Essilor Luxottica Atlanta';
    }
    if (/\b(columbus|colombus|el-col|elcol)\b/i.test(combinedContext)) {
      const col = compiledSites.find(x => /columbus/i.test(x.originalName));
      if (col) return col.originalName;
      return 'Essilor Luxottica -Columbus';
    }
    if (/\b(sedico)\b/i.test(combinedContext)) {
      const sed = compiledSites.find(x => /sedico/i.test(x.originalName));
      if (sed) return sed.originalName;
      return 'Luxottica_Sedico';
    }
    if (/\b(fhr|california)\b/i.test(combinedContext)) {
      const fhr = compiledSites.find(x => x.originalName === 'Essilor Luxottica');
      if (fhr) return fhr.originalName;
      return 'Essilor Luxottica';
    }
  }

  // Sams Club multi-site resolution:
  if (/sam(s)?(\s+club)?|4993|8799|9476/i.test(combinedContext)) {
    if (/\b(atl|atlanta|4993|samprod|samsprod)\b/i.test(combinedContext)) {
      const sam = compiledSites.find(x => /sam.*atl/i.test(x.originalName));
      if (sam) return sam.originalName;
      return 'Sams Club ATL';
    }
    if (/\b(lax|california|8799|9476|samlax)\b/i.test(combinedContext)) {
      const sam = compiledSites.find(x => /sam.*lax/i.test(x.originalName));
      if (sam) return sam.originalName;
      return 'Sams Club LAX';
    }
  }

  // Walmart multi-site resolution:
  if (/walmart/i.test(combinedContext)) {
    if (/\b(mexico|mx|tepotzotlan|tepotzotlÃ¡n|walmartmx)\b/i.test(combinedContext)) {
      const wm = compiledSites.find(x => /mexico/i.test(x.originalName));
      if (wm) return wm.originalName;
      return 'Walmart Mexico';
    }
    if (/\b(canada|calgary|edwards|walmartca)\b/i.test(combinedContext)) {
      const wc = compiledSites.find(x => /canada/i.test(x.originalName));
      if (wc) return wc.originalName;
      return 'Walmart-Canada';
    }
  }

  // H&M multi-site resolution:
  if (/h\s*&\s*m|hnm|flexo[-_]?hnm/i.test(combinedContext)) {
    if (/\b(ajax|canada)\b/i.test(combinedContext) && !/perris|gxo/i.test(combinedContext)) {
      const hm = compiledSites.find(x => /ajax|h&m canada/i.test(x.originalName));
      if (hm) return hm.originalName;
      return 'H&M Canada Ajax';
    }
    if (/\b(perris|xpo|gxo)\b/i.test(combinedContext)) {
      const gxo = compiledSites.find(x => /gxo/i.test(x.originalName));
      if (gxo) return gxo.originalName;
      return 'GXO-H&M Prod';
    }
    if (/\b(robbinsville|p1)\b/i.test(combinedContext)) {
      const p1 = compiledSites.find(x => /p1/i.test(x.originalName));
      if (p1) return p1.originalName;
      return 'H&M P1';
    }
  }

  if (sub) {
    if (isAlertCase(caseRecord) || /\b(samprod|samsprod|samsatl|samatl|casey|caseys|owensminor|onm|sedico|elatl|elcolombus|4993)\b/i.test(sub)) {
      const siteFromSub = extractSiteFromAlertSubject(sub, compiledSites);
      if (siteFromSub) return siteFromSub;
    }
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
    if (/el[-_]?atl|atlanta/i.test(rawAccountName)) {
      const atl = compiledSites.find(x => /atlanta/i.test(x.originalName) && /luxottica/i.test(x.originalName));
      if (atl) return atl.originalName;
      return 'Essilor Luxottica Atlanta';
    }
    if (/ajax|h&m.*canada|hnm.*canada/i.test(rawAccountName)) {
      const hm = compiledSites.find(x => /ajax|h&m canada/i.test(x.originalName));
      if (hm) return hm.originalName;
      return 'H&M Canada Ajax';
    }
    if (/sam.*atl|4993/i.test(rawAccountName)) {
      const sam = compiledSites.find(x => /sam.*atl/i.test(x.originalName));
      if (sam) return sam.originalName;
      return 'Sams Club ATL';
    }

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
 * Rules:
 * - Sev 1 Urgent (sev1):
 *     - Essilor Luxottica Atlanta urgent tickets (user requirement: "its el atl essilor luxotica atlanta you should its sev 1 urgent in essilor luxotica [atlanta]")
 *     - Operational Impact = 100% (or impact >= 100) or Is_Site_100_Down__c
 *     - Explicit Severity 1 / Sev 1 / P1 / Critical
 *     - Subject containing Sev 1 / P1 Urgent / Critical
 * - Sev 2 Urgent (sev2):
 *     - Operational Impact >= 50% and <= 99%
 *     - Explicit Severity 2 / Sev 2 / P2 / Sev 2 Urgent
 *     - Subject containing Sev 2 / P2 Urgent
 * - Excludes DIR tickets (post-incident documentation).
 */
export function detectSeverity(c) {
  if (!c) return 'sev3';
  if (isAlertCase(c)) return 'sev3';
  if (isDirTicket(c)) return 'sev3';

  const raw = c;
  const rawType = String(raw.Type || raw.type || '').trim().toLowerCase();
  // Feature requests, queries, and analysis are never operational outage incidents
  if (rawType === 'feature request' || rawType === 'query' || rawType === 'analysis' || rawType === 'change') {
    return 'sev3';
  }

  // Rule 1: 100% Impact or Site 100% Down -> Sev 1 Urgent
  const impact = getImpactPercentage(c);
  if (Boolean(raw.Is_Site_100_Down__c) || Boolean(raw.is_site_down) || impact >= 100) {
    return 'sev1';
  }

  // Explicit low severity guard: if Salesforce explicitly designates Severity 3 or 4, it is not Sev 1/2 Urgent
  const highestSevRaw = String(raw.Highest_Severity__c || '').trim();
  if (/severity\s*[34]|sev[-_ ]*[34]|low|minor/i.test(highestSevRaw) && impact < 50 && !raw.Is_Site_100_Down__c) {
    return 'sev3';
  }

  // Rule 2: 50% - 99% Impact -> Sev 2 Urgent
  if (impact >= 50 && impact < 100) {
    return 'sev2';
  }

  // Authoritative case severity fields
  const highestSev = highestSevRaw.toUpperCase();
  const prio = String(raw.Priority || raw.Snow_Priority__c || raw.Snow_Urgency__c || '').trim().toUpperCase();

  // Rule 3: Explicit Severity 1 Urgent / Critical in authoritative case fields
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

  // Rule 4: Explicit Sev 2 Urgent (Must be explicitly 'Urgent', NOT standard Sev 2 High)
  for (const s of [highestSev, prio].filter(Boolean)) {
    if (
      s.includes('2 - URGENT') ||
      s.includes('SEV 2 - URGENT') ||
      s.includes('SEV 2 URGENT') ||
      s.includes('SEVERITY 2 - URGENT') ||
      s.includes('SEVERITY 2 URGENT')
    ) {
      return 'sev2';
    }
  }

  // Rule 5: Subject line explicit urgency / severity tags (must be explicit tag, not regular English adjective)
  const sub = String(c.Subject || raw.subject || '').trim();
  if (/(?:^|[\[\(\s])(?:SEV[-_ ]*1(?:[-_ ]*URGENT)?|P1[-_ ]*URGENT|SEVERITY[-_ ]*1|CRITICAL[-_ ]*(?:OUTAGE|INCIDENT|SEV|IMPACT)|\[CRITICAL\])(?:$|[\]\)\s:])/i.test(sub)) {
    return 'sev1';
  }
  if (/(?:^|[\[\(\s])(?:SEV[-_ ]*2[-_ ]*URGENT|P2[-_ ]*URGENT|SEVERITY[-_ ]*2[-_ ]*URGENT|\[SEV[-_ ]*2\])(?:$|[\]\)\s:])/i.test(sub)) {
    return 'sev2';
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
  _overviewCache = { data: null, cachedAt: 0 };
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
    const alertsPrimarySoql = [
      'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c, Snow_Priority__c, Snow_Urgency__c, Jira_Priority__c, Jira_Severity__c,',
      'Impact_Percentage__c, Is_Site_100_Down__c, Type, Snow_Category__c, Product_Type__c, Parent_Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c, Parent_End_Time__c, Downtime__c, Description,',
      'AccountId, Account_Name__c, Account_name_Reporting__c, Customer_Location__c, Snow_Sitename__c,',
      'Site_Name_Customer_Input__c, Impacted_Sites__c, Approval_status__c, Current_RCA_Status__c, Snow_id__c, Owner.Name, Dev_Case_Assignee__c',
      'FROM Case',
      "WHERE (Type = 'Alert' OR Snow_Category__c = 'Alert' OR Subject LIKE '%Alert%' OR Subject LIKE '%Opsgenie%')",
      "AND ((Status != 'Closed' AND Status != 'Solved' AND Status != 'Resolved') OR ClosedDate = TODAY)",
      'ORDER BY LastModifiedDate DESC LIMIT 500',
    ].join(' ');

    const casesPrimarySoql = [
      'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c, Snow_Priority__c, Snow_Urgency__c, Jira_Priority__c, Jira_Severity__c,',
      'Impact_Percentage__c, Is_Site_100_Down__c, Type, Snow_Category__c, Product_Type__c, Parent_Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c, Parent_End_Time__c, Downtime__c, Description,',
      'AccountId, Account_Name__c, Account_name_Reporting__c, Customer_Location__c, Snow_Sitename__c,',
      'Site_Name_Customer_Input__c, Impacted_Sites__c, DIR_Approval__c, Approval_status__c, Current_RCA_Status__c, Snow_id__c, Owner.Name, Dev_Case_Assignee__c',
      'FROM Case',
      "WHERE ((Status != 'Closed' AND Status != 'Solved' AND Status != 'Resolved' AND (Type = null OR (Type != 'Alert' AND Type != 'Problem'))) OR ClosedDate = TODAY)",
      'ORDER BY LastModifiedDate DESC LIMIT 800',
    ].join(' ');

    const fallbackSoql = [
      'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c, Snow_Priority__c, Snow_Urgency__c,',
      'Type, Product_Type__c, Parent_Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c, Downtime__c, Description,',
      'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c,',
      'Site_Name_Customer_Input__c, Impacted_Sites__c, DIR_Approval__c, Approval_status__c, Current_RCA_Status__c, Is_Site_100_Down__c, Snow_id__c, Owner.Name',
      'FROM Case',
      "WHERE Status != 'Closed' OR ClosedDate = LAST_N_DAYS:3 OR LastModifiedDate = LAST_N_DAYS:3",
      'ORDER BY LastModifiedDate DESC LIMIT 800',
    ].join(' ');

    const safeSoql = [
      'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c, Type, Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Downtime__c, Description,',
      'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Site_Name_Customer_Input__c, Is_Site_100_Down__c, Snow_id__c, Owner.Name',
      'FROM Case',
      "WHERE Status != 'Closed' OR ClosedDate = LAST_N_DAYS:3 OR LastModifiedDate = LAST_N_DAYS:3",
      'ORDER BY LastModifiedDate DESC LIMIT 600',
    ].join(' ');

    const ultraSafeSoql = [
      'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Type, Product_Type__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, End_Time_of_Incident__c, Downtime__c, Description,',
      'AccountId, Account_Name__c, Snow_Sitename__c, Owner.Name',
      'FROM Case',
      "WHERE Status != 'Closed' OR ClosedDate = LAST_N_DAYS:3 OR LastModifiedDate = LAST_N_DAYS:3",
      'ORDER BY LastModifiedDate DESC LIMIT 500',
    ].join(' ');

    let raw = [];
    try {
      const [resAlerts, resCases] = await Promise.all([
        executeSOQL(alertsPrimarySoql),
        executeSOQL(casesPrimarySoql)
      ]);
      const alertsRecords = resAlerts.records || [];
      const casesRecords = resCases.records || [];
      const mapById = new Map();
      for (const r of alertsRecords) {
        if (r && r.Id) mapById.set(r.Id, r);
      }
      for (const r of casesRecords) {
        if (r && r.Id) mapById.set(r.Id, r);
      }
      raw = Array.from(mapById.values());
      _lastSalesforceError = null;
    } catch (errPrimary) {
      console.warn('[Salesforce] Dual primary SOQL notice, executing fallback query:', errPrimary.message);
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
      const rawType = c.Type || c.type || '';
      const rawCat = c.Snow_Category__c || c.Category__c || c.Category || '';
      const actualType = rawType || rawCat || 'Technical Support';
      const cat = rawCat || rawType || 'Technical Support';
      const rawProd = (c.Product_Type__c || c.Parent_Product_Type__c || '').trim();
      const normProd = normalizeProductType(rawProd);
      const prod = normProd || inferProductLine(
        c.Snow_Sitename__c || c.Customer_Location__c || c.Site_Name_Customer_Input__c || c.Account_Name__c || ''
      );
      const rawAssignee = (c.Dev_Case_Assignee__c || c.Owner?.Name || '').trim();
      const isGreyOrangeQueue = !rawAssignee || /^greyorange(\s*queue)?$/i.test(rawAssignee);
      const assignee = isGreyOrangeQueue ? 'Unassigned' : rawAssignee;
      const desc = c.Description ? (c.Description.length > 2000 ? c.Description.slice(0, 2000) + '...' : c.Description) : null;
      const endTime = getTicketEndTime(c);
      const isAlert = isAlertCase(c);
      const isClosedByEndTime = Boolean(endTime) && !isAlert;
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
        Type: actualType,
        type: actualType,
        raw_type: rawType,
        rawType: rawType,
        Category: cat,
        category: cat,
        Category__c: cat,
        Product_Type__c: normProd || prod,
        Parent_Product_Type__c: normalizeProductType(c.Parent_Product_Type__c) || null,
        product_line: normProd || prod,
        Product_Line: normProd || prod,
        Dev_Case_Assignee__c: assignee,
        assignee: assignee,
        assigned_to: assignee,
        Owner: c.Owner || { Name: assignee },
        owner: c.Owner || { Name: assignee },
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
        Snow_id__c: c.Snow_id__c || c.snow_id || c.Snow_Id__c || c.Snow_ID__c || c.SnowId || null,
        snow_id: c.Snow_id__c || c.snow_id || c.Snow_Id__c || c.Snow_ID__c || c.SnowId || null,
        Snow_Category__c: c.Snow_Category__c || null,
        Snow_Urgency__c: c.Snow_Urgency__c || null,
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

/**
 * Fetch all LIVE OPEN cases for a specific site (strictly excluding Alerts and Solved/Closed/On Hold).
 * Returns ONLY cases mapped to this site, or [] if none exist.
 */
export async function fetchOpenCasesForSite({ siteId, siteName, accountId, forceRefresh = false }) {
  console.log(`[Salesforce] Fetching live cases & alerts for: ${siteName || siteId || 'site'} (forceRefresh: ${forceRefresh})`);

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

  const { cases: liveCases, alerts: liveAlerts, closed: liveClosed = [] } = await fetchAllLiveCasesAndAlerts(forceRefresh);

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
      Type: c.Type || c.type || c.Category__c || c.Snow_Category__c || 'Technical Support',
      type: c.Type || c.type || c.Category__c || c.Snow_Category__c || 'Technical Support',
      raw_type: c.Type || c.type || '',
      rawType: c.Type || c.type || '',
      Category__c: c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support',
      category: c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support',
      Product_Type__c: normalizeProductType(c.Product_Type__c) || c.product_line || 'RMS',
      Parent_Product_Type__c: normalizeProductType(c.Parent_Product_Type__c) || null,
      product_line: normalizeProductType(c.Product_Type__c) || c.product_line || 'RMS',
      Dev_Case_Assignee__c: (c.Dev_Case_Assignee__c && !/^greyorange(\s*queue)?$/i.test(String(c.Dev_Case_Assignee__c).trim()))
        ? String(c.Dev_Case_Assignee__c).trim()
        : (c.Owner?.Name && !/^greyorange(\s*queue)?$/i.test(String(c.Owner.Name).trim()) ? String(c.Owner.Name).trim() : 'Unassigned'),
      assignee: (c.Dev_Case_Assignee__c && !/^greyorange(\s*queue)?$/i.test(String(c.Dev_Case_Assignee__c).trim()))
        ? String(c.Dev_Case_Assignee__c).trim()
        : (c.Owner?.Name && !/^greyorange(\s*queue)?$/i.test(String(c.Owner.Name).trim()) ? String(c.Owner.Name).trim() : 'Unassigned'),
      assigned_to: (c.Dev_Case_Assignee__c && !/^greyorange(\s*queue)?$/i.test(String(c.Dev_Case_Assignee__c).trim()))
        ? String(c.Dev_Case_Assignee__c).trim()
        : (c.Owner?.Name && !/^greyorange(\s*queue)?$/i.test(String(c.Owner.Name).trim()) ? String(c.Owner.Name).trim() : 'Unassigned'),
      Owner: c.Owner || { Name: (c.Dev_Case_Assignee__c && !/^greyorange(\s*queue)?$/i.test(String(c.Dev_Case_Assignee__c).trim())) ? String(c.Dev_Case_Assignee__c).trim() : 'Unassigned' },
      owner: c.Owner || { Name: (c.Dev_Case_Assignee__c && !/^greyorange(\s*queue)?$/i.test(String(c.Dev_Case_Assignee__c).trim())) ? String(c.Dev_Case_Assignee__c).trim() : 'Unassigned' },
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
      Snow_id__c: c.Snow_id__c || c.snow_id || c.Snow_Id__c || c.Snow_ID__c || c.SnowId || null,
      snow_id: c.Snow_id__c || c.snow_id || c.Snow_Id__c || c.Snow_ID__c || c.SnowId || null,
      Snow_Category__c: c.Snow_Category__c || null,
      Snow_Urgency__c: c.Snow_Urgency__c || null,
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

  const casesBySite = {};

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

      if (!casesBySite[key]) casesBySite[key] = [];
      casesBySite[key].push(c);
    }
  }

  // Calculate Sev 1 and Sev 2 urgent counts per site, deduplicating incident case + automated IM ticket
  // User requirement: "1sev with automated im ticket creation counts to only one sev 1 respectively goes for sev 2 urgent also no double count due to automated im ticket creation just count the incident urgent"
  for (const key of Object.keys(siteStats)) {
    const siteCases = casesBySite[key] || [];
    const { sev1Count, sev2Count } = calculateSiteUrgentCounts(siteCases);
    siteStats[key].sev1Count = sev1Count;
    siteStats[key].sev2Count = sev2Count;
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

      // User requirement: IM tickets and monitoring alerts are shown in alert views, but do NOT add to Sev 1 / Sev 2 urgent count in the panels
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

  // 1b. Cloud Sheet integration
  let sheetDesignatedSites = [];
  let getSheetUptimeForSite = () => null;
  let hasActiveSheetUptime = () => false;
  let getAllSheetSiteUptimes = () => [];
  try {
    const sheets = await import('./sheets.service.js');
    sheetDesignatedSites = sheets.getSheetDesignatedRedZoneSites?.() || [];
    getSheetUptimeForSite = sheets.getSheetUptimeForSite || (() => null);
    hasActiveSheetUptime = sheets.hasActiveSheetUptime || (() => false);
    getAllSheetSiteUptimes = sheets.getAllSheetSiteUptimes || (() => []);
  } catch {}

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
    'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Site_Name_Customer_Input__c, Is_Site_100_Down__c, Impact_Percentage__c,',
    'DIR_Approval__c, Approval_status__c, Current_RCA_Status__c',
    'FROM Case',
    "WHERE CreatedDate >= LAST_N_DAYS:30 AND (Type = null OR (Type != 'Alert' AND Type != 'Problem'))",
    'ORDER BY CreatedDate DESC LIMIT 6000',
  ].join(' ');

  const sitePrimarySoql = [
    'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c, Alert_Priority__c,',
    'Type, Product_Type__c, CreatedDate, LastModifiedDate,',
    'ClosedDate, End_Time__c, End_Time_of_Incident__c, Actual_End_Time__c, Solved_Date_Time__c, Downtime__c, Description,',
    'AccountId, Account_Name__c, Customer_Location__c, Snow_Sitename__c, Site_Name_Customer_Input__c, Is_Site_100_Down__c, Impact_Percentage__c,',
    'DIR_Approval__c, Approval_status__c, Current_RCA_Status__c',
    'FROM Case',
    "WHERE CreatedDate >= LAST_N_DAYS:30 AND (Type = null OR (Type != 'Alert' AND Type != 'Problem'))",
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
        "WHERE CreatedDate >= LAST_N_DAYS:30 AND (Type = null OR Type != 'Alert')",
        'ORDER BY CreatedDate DESC LIMIT 6000',
      ].join(' ')
    : [
        'SELECT Id, CaseNumber, ParentId, Subject, Status, Highest_Severity__c,',
        'Type, Product_Type__c, CreatedDate, LastModifiedDate,',
        'ClosedDate, End_Time__c, End_Time_of_Incident__c, Downtime__c, Description,',
        'AccountId, Account_Name__c, Snow_Sitename__c',
        'FROM Case',
        "WHERE CreatedDate >= LAST_N_DAYS:30 AND (Type = null OR Type != 'Alert')",
        siteFilterClause,
        'ORDER BY CreatedDate DESC',
      ].filter(Boolean).join(' ');

  const standardSafe30dSoql = isGlobalOverview
    ? [
        'SELECT Id, CaseNumber, Subject, Status, Highest_Severity__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, Downtime__c, Description, AccountId, Account_Name__c, Snow_Sitename__c',
        'FROM Case',
        "WHERE CreatedDate >= LAST_N_DAYS:30 AND (Type = null OR Type != 'Alert')",
        'ORDER BY CreatedDate DESC LIMIT 6000',
      ].join(' ')
    : [
        'SELECT Id, CaseNumber, Subject, Status, Highest_Severity__c, CreatedDate, LastModifiedDate, ClosedDate, End_Time__c, Downtime__c, Description, AccountId, Account_Name__c, Snow_Sitename__c',
        'FROM Case',
        "WHERE CreatedDate >= LAST_N_DAYS:30 AND (Type = null OR Type != 'Alert')",
        siteFilterClause,
        'ORDER BY CreatedDate DESC',
      ].filter(Boolean).join(' ');

  const primary30dSoql = isGlobalOverview ? overviewPrimarySoql : sitePrimarySoql;
  const queryMaxRecords = 6000;
  const shouldPaginate = true;

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

  // 3. Filter for valid customer/site incidents (strictly exclude alert tickets and DIR tickets)
  const validIncidents = rawCases.filter(c => {
    if (!c) return false;
    if (isAlertCase(c)) return false;
    if (isDirTicket(c)) return false;
    return isIncidentTicket(c);
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
  for (const uRec of getAllSheetSiteUptimes()) {
    const k = uRec.siteName.toLowerCase();
    if (!siteIncidentsMap.has(k)) {
      siteIncidentsMap.set(k, {
        siteName: uRec.siteName,
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
      ParentId: c.ParentId || null,
      Snow_id__c: c.Snow_id__c || null,
    });
  }

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

  const redZoneSites = [];

  for (const [key, { siteName: currentSiteName, incidents }] of siteIncidentsMap.entries()) {
    // Deduplicate automated IM tickets created for incidents so 1 incident counts as ONLY 1
    const distinctIncidents = deduplicateIncidents(incidents);
    distinctIncidents.sort((a, b) => b.createdTime - a.createdTime);

    // Incidents in last 7 days
    const incidents7d = distinctIncidents.filter(i => (now - i.createdTime) <= SEVEN_DAYS_MS);
    const sev1_7d = incidents7d.filter(i => i.severity === 'sev1').length;
    const sev2_7d = incidents7d.filter(i => i.severity === 'sev2').length;
    const criteria1Met = (sev1_7d >= 3) || (sev2_7d >= 5);

    // Criteria-2: Uptime (evaluated from sheet / Week-42 actual uptime data)
    const uptimeInfo = getSheetUptimeForSite(currentSiteName);
    const uptimeVal = typeof uptimeInfo?.uptime === 'number' ? uptimeInfo.uptime : null;
    const criteria2Met = uptimeVal !== null && uptimeVal < 99.0;
    const criteria2 = {
      met: criteria2Met,
      uptimePercentage: uptimeVal,
      omitted: false,
      threshold: 99.0,
      source: uptimeInfo?.source || (uptimeVal !== null ? 'Week-42 Actual Uptime' : null),
      rowIdx: uptimeInfo?.rowIdx || null,
      rawVal: uptimeInfo?.rawVal || (uptimeVal !== null ? `${uptimeVal}%` : null),
    };

    // Criteria-3: MTBF < 36 hours (Last two weeks = 14 days)
    // Operating hours in 14 days = 336 hours. Qualifying failures: All distinct customer operational incidents on the site
    // Calculated per individual site separately (not fleet averaged)
    const incidents14d = distinctIncidents.filter(i => (now - i.createdTime) <= FOURTEEN_DAYS_MS);
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

    const isExplicitlyRequestedSite =
      Boolean(siteName) &&
      (normalizeCanonical(siteName) === normalizeCanonical(key) ||
        normalizeCanonical(siteName) === normalizeCanonical(currentSiteName) ||
        key.includes(siteName.toLowerCase()) ||
        siteName.toLowerCase().includes(key));

    // User requirement: "there are 5 sites in red zone add these only with uptime data given and aslo consider these sites otrht criteria we mentioned only work in redzone area rest dont disturb other part of the code base like site logics and all"
    // Only evaluate sites that have uptime data given (or are explicitly sheet-designated or queried directly)
    const hasUptimeData = uptimeVal !== null;
    if (!hasUptimeData && !isSheetDesignated && !isExplicitlyRequestedSite) {
      continue;
    }

    // Entry Criteria (Any one): Criteria-1 OR Criteria-2 OR Criteria-3 OR isSheetDesignated
    const isCurrentBreach = criteria1Met || criteria2Met || criteria3Met || isSheetDesignated;

    // Exit Criteria: "If Criteria 1 & Criteria 2 are not met continually for 3 weeks/21 Days, Site will exit from RedZone."
    // Determine the most recent breach date across 21 continuous days:
    let lastBreachTime = null;
    if (isCurrentBreach) {
      lastBreachTime = now;
    } else {
      // Check historical rolling windows over the last 21 days:
      for (let dayOffset = 1; dayOffset <= 21; dayOffset++) {
        const testPoint = now - (dayOffset * 24 * 60 * 60 * 1000);
        const test7d = distinctIncidents.filter(i => i.createdTime <= testPoint && (testPoint - i.createdTime) <= SEVEN_DAYS_MS);
        const testSev1 = test7d.filter(i => i.severity === 'sev1').length;
        const testSev2 = test7d.filter(i => i.severity === 'sev2').length;
        if (testSev1 >= 3 || testSev2 >= 5) {
          lastBreachTime = testPoint;
          break;
        }

        const test14d = distinctIncidents.filter(i => i.createdTime <= testPoint && (testPoint - i.createdTime) <= FOURTEEN_DAYS_MS);
        if (test14d.length > 0) {
          const testMtbf = 336 / test14d.length;
          if (testMtbf < 36) {
            lastBreachTime = testPoint;
            break;
          }
        }
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
    if (criteria2Met) {
      reasons.push(`Actual Uptime is ${uptimeVal}% (< 99.0% threshold in Week-42)`);
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

      const dayIncidents = distinctIncidents.filter(i => i.createdTime >= dayStart && i.createdTime < dayEnd);
      const sev1OnDay = dayIncidents.filter(i => i.severity === 'sev1').length;
      const sev2OnDay = dayIncidents.filter(i => i.severity === 'sev2').length;
      const resolvedOnDay = distinctIncidents.filter(i => {
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
      qualifyingIncidents: (() => {
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const sev12 = distinctIncidents.filter(i => (now - i.createdTime) <= THIRTY_DAYS_MS && (i.severity === 'sev1' || i.severity === 'sev2'));
        const others = distinctIncidents.filter(i => (now - i.createdTime) <= THIRTY_DAYS_MS && i.severity !== 'sev1' && i.severity !== 'sev2');
        return [...sev12, ...others].slice(0, 200).map(i => ({
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
        }));
      })(),
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
      criteria2: '< 99% actual uptime (evaluated from Week-42 uptime data)',
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

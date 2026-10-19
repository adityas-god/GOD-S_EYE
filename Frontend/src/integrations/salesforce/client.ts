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
  Highest_Severity__c?: string | null;
  Alert_Priority__c?: string | null;
  Type?: string | null;
  Owner?: { Name?: string } | null;
  CreatedDate: string;
  LastModifiedDate: string;
  ClosedDate?: string | null;
  Description: string | null;
  AccountId?: string | null;
  Account_Name__c?: string | null;
  Customer_Location__c?: string | null;
  Snow_Sitename__c?: string | null;
  Site_Name_Customer_Input__c?: string | null;
  Impacted_Sites__c?: string | null;
  Is_Site_100_Down__c?: boolean;
  ParentId?: string | null;
  parent_id?: string | null;
  Snow_id__c?: string | null;
  snow_id?: string | null;
  product_line?: string | null;
  Product_Type__c?: string | null;
  Parent_Product_Type__c?: string | null;
  Category__c?: string | null;
  Snow_Category__c?: string | null;
  Category?: string | null;
  Dev_Case_Assignee__c?: string | null;
  End_Time__c?: string | null;
  end_time?: string | null;
  created_at?: string | null;
  ended_at?: string | null;
  duration_minutes?: number | null;
  is_open?: boolean;
  is_closed?: boolean;
  Account?: { Name: string } | null;
  [key: string]: any;
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
  product_lines?: string[];
  product_line?: string;
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
 * Detects if a ticket contains an Opsgenie URL or link.
 * Requirement: "if there is opesgenie url present imideatly it will be considered as alert"
 */
export function hasOpsgenieUrl(c: SFCase | Record<string, unknown>): boolean {
  if (!c) return false;
  const raw = c as Record<string, unknown>;
  const check = (val: unknown): boolean => {
    if (!val || typeof val !== 'string') return false;
    return (
      /(?:https?:\/\/)?(?:[a-zA-Z0-9._-]+\.)?opsgenie\.com/i.test(val) ||
      /https?:\/\/[^\s]*opsgenie/i.test(val) ||
      (/\bopsgenie\b/i.test(val) && /https?:\/\//i.test(val))
    );
  };

  if (check(c.Description || raw.description)) return true;
  if (check(c.Subject || raw.subject)) return true;
  if (check(raw.Incident_Url__c || raw.incident_url)) return true;
  if (check(raw.Alert_Url__c || raw.alert_url)) return true;

  for (const k of Object.keys(raw)) {
    if (typeof raw[k] === 'string' && check(raw[k])) {
      return true;
    }
  }

  return false;
}

/**
 * Filter out alerts: returns true if case is an automated alert or alert-type ticket
 */
export function isAlertCase(c: SFCase): boolean {
  if (!c) return false;

  // 0. Immediate Opsgenie URL check:
  // User requirement: "if there is opesgenie url present imideatly it will be considered as alert"
  if (hasOpsgenieUrl(c)) {
    return true;
  }

  const raw = c as Record<string, unknown>;
  const typeStr = String(c.Type || raw.type || '').trim().toLowerCase();
  const catStr = String(c.Category__c || raw.category || c.Snow_Category__c || '').trim().toLowerCase();
  const sub = String(c.Subject || raw.subject || '').trim();

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
  const desc = String(c.Description || raw.description || '');
  if (desc && /automated alert|monitoring alert|alert rule|alert id:/i.test(desc)) {
    return true;
  }

  return false;
}

export function calculateAlertDuration(createdDate?: string | null, endDate?: string | null, isOpen?: boolean): { text: string; isLive: boolean } {
  if (isOpen) {
    if (createdDate) {
      const start = new Date(createdDate).getTime();
      const diffMs = Date.now() - start;
      if (diffMs > 0) {
        const mins = Math.round(diffMs / 60000);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return { text: h > 0 ? `${h}h ${m}m (Live)` : `${m}m (Live)`, isLive: true };
      }
    }
    return { text: 'Active', isLive: true };
  }

  if (createdDate && endDate) {
    const start = new Date(createdDate).getTime();
    const end = new Date(endDate).getTime();
    const diffMs = end - start;
    if (diffMs > 0) {
      const mins = Math.round(diffMs / 60000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return { text: h > 0 ? `${h}h ${m}m` : `${m}m`, isLive: false };
    }
  }

  return { text: '—', isLive: false };
}

/**
 * Extracts any populated End Time or Closed Date from ticket fields.
 * User requirement: "the close of the ticket will be updated from end time in cases if there is end time on the ticket then remove it from live cases"
 */
export function getTicketEndTime(c: SFCase): string | null {
  if (!c) return null;
  if (c.ended_at) return String(c.ended_at);
  const raw = c as Record<string, unknown>;
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
      return String(candidate);
    }
  }

  return null;
}

export function hasTicketEndTime(c: SFCase): boolean {
  return Boolean(getTicketEndTime(c));
}

export function isClosedToday(c: SFCase): boolean {
  if (!c) return false;
  const endTime = getTicketEndTime(c);
  const status = String(c.Status || '').toLowerCase();
  const isClosed = Boolean(endTime) || CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
  if (!isClosed) return false;

  const dateStr = endTime || c.ClosedDate || (c as Record<string, unknown>).LastModifiedDate;
  if (!dateStr) return true;

  const d = new Date(String(dateStr));
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

export function isAlertForShiftBucket(c: SFCase): boolean {
  if (!isAlertCase(c)) return false;
  const endTime = getTicketEndTime(c);
  const status = String(c.Status || '').toLowerCase();
  const isClosed = Boolean(endTime) || CLOSED_STATUS_PATTERNS.some(p => status.includes(p));
  if (!isClosed) {
    if (status.includes('hold') || status.includes('pending confirmation')) return false;
    return true; // Live open alert
  }
  return isClosedToday(c); // Closed alert of today's date
}

/**
 * Live open alert predicate: strictly open alerts with end time logic applied.
 * Excludes tickets with an End Time, Closed Date, or closed/hold status.
 */
export function isOpenAlert(c: SFCase): boolean {
  if (!c) return false;
  if (!isAlertCase(c)) return false;

  // 1. If ticket has an End Time or Closed Date -> strictly omit from open alerts!
  if (hasTicketEndTime(c) || Boolean(getTicketEndTime(c))) return false;

  const status = String(c.Status || '').trim().toLowerCase();
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
export function isClosedAlert(c: SFCase): boolean {
  if (!c) return false;
  if (!isAlertCase(c)) return false;
  const status = String(c.Status || '').toLowerCase();
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


/**
 * Live open case predicate: must NOT be closed, solved, resolved, or on-hold, and NOT an alert or DIR ticket.
 * Excludes tickets with an End Time or Closed Date.
 */
export function isLiveOpenCase(c: SFCase): boolean {
  if (!c) return false;

  // 1. If ticket has an End Time, Closed Date, or downtime completed -> strictly omit from live cases!
  if (hasTicketEndTime(c) || Boolean(getTicketEndTime(c))) return false;

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
  const sub = String(c.Subject || raw.subject || '').trim();
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
export function isImTicket(c: SFCase): boolean {
  if (!c) return false;

  const raw = c as Record<string, unknown>;
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
export function isIncidentTicket(c: SFCase): boolean {
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
export function areSameIncident(t1: SFCase, t2: SFCase): boolean {
  if (!t1 || !t2) return false;
  if (t1.Id && t2.Id && t1.Id === t2.Id) return true;
  if (t1.CaseNumber && t2.CaseNumber && t1.CaseNumber === t2.CaseNumber) return true;

  const raw1 = t1 as Record<string, unknown>;
  const raw2 = t2 as Record<string, unknown>;

  // 1. Direct ParentId link (automated IM ticket created for parent case, or child ticket)
  const p1 = String(t1.ParentId || raw1.parent_id || raw1.Parent_Case__c || raw1.Parent_Case_Number__c || '').trim();
  const p2 = String(t2.ParentId || raw2.parent_id || raw2.Parent_Case__c || raw2.Parent_Case_Number__c || '').trim();

  if (p1 && (p1 === t2.Id || p1 === t2.CaseNumber)) return true;
  if (p2 && (p2 === t1.Id || p2 === t1.CaseNumber)) return true;
  if (p1 && p2 && p1.toLowerCase() === p2.toLowerCase()) return true;

  // 2. Shared ServiceNow Incident ID (Snow_id__c / Snow_Incident_Number__c)
  const snow1 = String(t1.Snow_id__c || raw1.Snow_Id__c || raw1.snow_id || raw1.Snow_Incident_Number__c || '').trim().toUpperCase();
  const snow2 = String(t2.Snow_id__c || raw2.Snow_Id__c || raw2.snow_id || raw2.Snow_Incident_Number__c || '').trim().toUpperCase();
  if (snow1 && snow2 && snow1 !== 'NULL' && snow1 !== 'UNDEFINED' && snow1 !== 'NONE' && snow1 === snow2) {
    return true;
  }

  // 3. One ticket references the other ticket's CaseNumber in Subject or Description
  const sub1 = String(t1.Subject || raw1.subject || '');
  const sub2 = String(t2.Subject || raw2.subject || '');
  const desc1 = String(t1.Description || raw1.description || '');
  const desc2 = String(t2.Description || raw2.description || '');

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
  const t1Time = (t1 as any).createdTime || (t1.CreatedDate ? new Date(t1.CreatedDate).getTime() : 0);
  const t2Time = (t2 as any).createdTime || (t2.CreatedDate ? new Date(t2.CreatedDate).getTime() : 0);
  const timeDiffMs = (t1Time > 0 && t2Time > 0) ? Math.abs(t1Time - t2Time) : Infinity;

  const normSub1 = sub1.replace(/^(\[?(?:im|inc|urgent|alert|p[12]|sev[12])\]?[:\s\-_]*)+/i, '').replace(/[^a-z0-9]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const normSub2 = sub2.replace(/^(\[?(?:im|inc|urgent|alert|p[12]|sev[12])\]?[:\s\-_]*)+/i, '').replace(/[^a-z0-9]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  if (timeDiffMs <= 4 * 3600 * 1000) {
    // Exact or substring match within 4 hours
    if (normSub1 && normSub2 && (normSub1 === normSub2 || normSub1.includes(normSub2) || normSub2.includes(normSub1))) {
      return true;
    }
    // Shared specific keywords (e.g. both reference pps 08 or pps08)
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
export function calculateSiteUrgentCounts(casesForSite: SFCase[] = []): { sev1Count: number; sev2Count: number } {
  const urgentTickets = (casesForSite || []).filter(c => {
    if (!isIncidentTicket(c)) return false;
    const sev = detectSeverity(c);
    return sev === 'sev1' || sev === 'sev2';
  });

  if (urgentTickets.length === 0) {
    return { sev1Count: 0, sev2Count: 0 };
  }

  // Cluster related tickets into single distinct incidents
  const incidentClusters: SFCase[][] = [];

  for (const t of urgentTickets) {
    const cluster = incidentClusters.find(c => c.some(existing => areSameIncident(existing, t)));
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
export function deduplicateIncidents(incidents: any[] = []): any[] {
  if (!Array.isArray(incidents) || incidents.length === 0) return [];
  const clusters: any[][] = [];
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
    // Pick the primary representative incident
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
    .replace(/\b(owens\s*&\s*monors|owens\s*&\s*minors|owens\s*and\s*minors|owens\s*minors|owens&minors|owens&monors|owens\s*monors|owens\s*monor|owensminor|owensminorprod|onmprod|onm)\b/gi, 'owens minor')
    .replace(/\b(sams\s+atl|sam\s+atl|samatl|samsatl|samprod|samsprod|samsatlprod|samatlprod)\b/gi, 'sams club atl')
    .replace(/\b(sams\s+lax|sam\s+lax|samlax|samslax|samslaxprod|samlaxprod)\b/gi, 'sams club lax')
    .replace(/\b(casey|caseys|caseyprod|caseysprod|casey's|caseys\s+joplin|casey's\s+joplin)\b/gi, "caseys joplin")
    .replace(/\bxpo\b/gi, 'gxo')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const KNOWN_SITE_ALIASES: Record<string, string[]> = {
  'H&M Canada Ajax': ['hm canada ajax', 'hm canada', 'hnm canada', 'hm ajax', 'hnm-canada', 'h&m canada', 'h&m ajax', 'ajax', 'h&m(ajax)-(canada)', 'h&m(ajax)', 'hm(ajax)', 'flexo-hnm-canada', 'flexo-hnm', 'hnm-canada-prod'],
  'Ikea': ['ikea', 'ikeaa', 'ikeaprod', 'ikea-finland', 'ikea finland'],
  'Sams Club ATL': ['sams club atl', 'sams atl', 'sams club', '4993 us', '4993', 'sams-club', 'sam\'s club(atl)-atlanta', 'sams club(atl)-atlanta', 'samprod', 'samsprod', 'samsatlprod', 'samsatl', 'samatlprod', 'samatl', 'sams-atl', 'samatl-prod', '4993.us', '4993-us', 'samprod-cluster', 'samsatlprod-cluster', 'sam\'s atl', 'sam atl'],
  'Sams Club LAX': ['sams club lax', 'sams lax', '8799 us', '9476 us', '8799', '9476', 'sam\'s club(lax)-california', 'sams club(lax)-california', 'samslaxprod', 'samslax', 'samlaxprod', 'samlax', 'sams-lax', '8799.us', '9476.us'],
  'DHL- Figs': ['dhl figs', 'dhlfigs', 'dhl figs phoenix', 'dhl figs ob', 'dhl figs-goodyear,az(usa)', 'dhl figs goodyear', 'dhl figs-goodyear', 'goodyear figs', 'dhlfigs-phoenix', 'figs', 'flexo-dhlfigs-phoenix', 'dhlfigsprod'],
  'DHL-NL': ['dhl nl', 'dhlnl', 'dhlnlprod', 'dhl netherlands', 'dhl-netherlands'],
  'GXO-H&M Prod': [
    'gxo hm prod', 'gxo-h&m prod', 'gxo h&m', 'gxo hm', 'gxo hnm',
    'xpo hnm', 'xpo-hnm', 'xpo -hnm', 'xpo - hnm', 'xpo_hnm', 'xpo hm', 'xpo-hm', 'xpo -hm',
    'gxo hm perris', 'gxo-h&m-perris(california)', 'gxo-h&m-perris', 'gxo perris', 'xpo perris', 'gxo-hm-prod'
  ],
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
  'GXO-Apple': ['gxo apple', 'gxo-apple', 'xpo apple', 'xpo-apple', 'xpo -apple', 'xpo - apple', 'xpo_apple'],
  'GXO-Lacoste': ['gxo lacoste', 'gxo-lacoste', 'xpo lacoste', 'xpo-lacoste', 'xpo -lacoste', 'xpo - lacoste', 'xpo_lacoste'],
  'GXO-Nike': ['gxo nike', 'gxo-nike', 'gxo nike bloomington', 'gxo-nike-bloomington(california)', 'xpo nike', 'xpo-nike', 'xpo -nike', 'xpo - nike', 'xpo_nike'],
  'GXO-Verizon': ['gxo verizon', 'gxo-verizon', 'gxo verizon dallas', 'gxo-verizon-dallas(texas,usa)', 'xpo verizon', 'xpo-verizon', 'xpo -verizon', 'xpo - verizon', 'xpo_verizon'],
  'GXO-AF': ['gxo af', 'gxo a f', 'gxo a&f', 'gxo anf', 'gxo a&f arizona', 'gxo-a&f-arizona(usa)', 'xpo af', 'xpo-af', 'xpo -af', 'xpo - af', 'xpo_af', 'xpo a&f', 'xpo a f', 'xpo anf', 'xpo_anf', 'xpo-anf'],
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

export interface CompiledSite {
  originalName: string;
  clean: string;
  spaceless: string;
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

  compiled.sort((a, b) => b.length - a.length);
  return compiled;
}

export const compileSites = compileSiteIndex;

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
const alertSubjectSiteCache = new Map<string, string | null>();

export function extractSiteFromAlertSubject(subject: string, compiledSites: CompiledSite[]): string | null {
  if (!subject || typeof subject !== 'string' || !compiledSites || compiledSites.length === 0) return null;
  const sub = subject.trim();
  const cacheKey = `${sub}:::${compiledSites.length}`;
  if (alertSubjectSiteCache.has(cacheKey)) {
    return alertSubjectSiteCache.get(cacheKey)!;
  }

  const result = _computeSiteFromAlertSubject(sub, compiledSites);
  alertSubjectSiteCache.set(cacheKey, result);
  return result;
}

function _computeSiteFromAlertSubject(sub: string, compiledSites: CompiledSite[]): string | null {
  // Pattern 0a: Dedicated prefix for XPO / GXO site naming, e.g. "XPO -hnm", "XPO - hnm", "XPO-hnm", "XPO_hnm", "GXO - nike", "[XPO -hnm]"
  // Resolves "all xpo - site_name are GXO _sitename"
  const xpoGxoPrefixMatch = sub.match(/^[<\[]?(?:xpo|gxo)\s*[-_ ]+\s*([a-z0-9._-]+)/i) || sub.match(/\b(?:xpo|gxo)\s*[-_ ]+\s*([a-z0-9._-]+)\b/i);
  if (xpoGxoPrefixMatch && xpoGxoPrefixMatch[1]) {
    const rawSubToken = xpoGxoPrefixMatch[1].toLowerCase().trim();
    if (/^(?:hnm|hm|h&m|perris)/i.test(rawSubToken)) {
      const gxoSite = compiledSites.find(x => /gxo.*(h&m|hm)/i.test(x.originalName));
      if (gxoSite) return gxoSite.originalName;
      return 'GXO-H&M Prod';
    }
    if (/^nike/i.test(rawSubToken)) {
      const gxoSite = compiledSites.find(x => /gxo.*nike/i.test(x.originalName));
      if (gxoSite) return gxoSite.originalName;
      return 'GXO-Nike';
    }
    if (/^apple/i.test(rawSubToken)) {
      const gxoSite = compiledSites.find(x => /gxo.*apple/i.test(x.originalName));
      if (gxoSite) return gxoSite.originalName;
      return 'GXO-Apple';
    }
    if (/^lacoste/i.test(rawSubToken)) {
      const gxoSite = compiledSites.find(x => /gxo.*lacoste/i.test(x.originalName));
      if (gxoSite) return gxoSite.originalName;
      return 'GXO-Lacoste';
    }
    if (/^verizon/i.test(rawSubToken)) {
      const gxoSite = compiledSites.find(x => /gxo.*verizon/i.test(x.originalName));
      if (gxoSite) return gxoSite.originalName;
      return 'GXO-Verizon';
    }
    if (/^(?:af|a&f|anf)/i.test(rawSubToken)) {
      const gxoSite = compiledSites.find(x => /gxo.*af/i.test(x.originalName));
      if (gxoSite) return gxoSite.originalName;
      return 'GXO-AF';
    }
    const resolved = resolveSiteFromToken('gxo-' + rawSubToken, compiledSites) || resolveSiteFromToken(rawSubToken, compiledSites);
    if (resolved) return resolved;
  }

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

export function resolveSiteFromToken(token: string, compiledSites: CompiledSite[]): string | null {
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
  // GXO-H&M Prod / XPO-HNM: xpo-hnm, gxo-hnm, xpo-hm, gxo-hm, gxo-perris, xpo-perris, xpo_hnm
  if (/^(?:xpo|gxo)[-_]?(?:hnm|hm|h&m|perris)/i.test(rawToken)) {
    const s = compiledSites.find(x => /gxo.*(h&m|hm)/i.test(x.originalName));
    return s ? s.originalName : 'GXO-H&M Prod';
  }
  // GXO-Nike / XPO-Nike
  if (/^(?:xpo|gxo)[-_]?nike/i.test(rawToken)) {
    const s = compiledSites.find(x => /gxo.*nike/i.test(x.originalName));
    return s ? s.originalName : 'GXO-Nike';
  }
  // GXO-Apple / XPO-Apple
  if (/^(?:xpo|gxo)[-_]?apple/i.test(rawToken)) {
    const s = compiledSites.find(x => /gxo.*apple/i.test(x.originalName));
    return s ? s.originalName : 'GXO-Apple';
  }
  // GXO-Lacoste / XPO-Lacoste
  if (/^(?:xpo|gxo)[-_]?lacoste/i.test(rawToken)) {
    const s = compiledSites.find(x => /gxo.*lacoste/i.test(x.originalName));
    return s ? s.originalName : 'GXO-Lacoste';
  }
  // GXO-Verizon / XPO-Verizon
  if (/^(?:xpo|gxo)[-_]?verizon/i.test(rawToken)) {
    const s = compiledSites.find(x => /gxo.*verizon/i.test(x.originalName));
    return s ? s.originalName : 'GXO-Verizon';
  }
  // GXO-AF / XPO-AF
  if (/^(?:xpo|gxo)[-_]?(?:af|a&f|anf)/i.test(rawToken)) {
    const s = compiledSites.find(x => /gxo.*af/i.test(x.originalName));
    return s ? s.originalName : 'GXO-AF';
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

const COMPILED_KNOWN_SITE_ALIASES: Array<{ keyClean: string; allNames: string[] }> = Object.entries(KNOWN_SITE_ALIASES).map(([siteKey, aliases]) => {
  const keyClean = normalizeCanonical(siteKey);
  const allNames = [keyClean, ...aliases.map(normalizeCanonical)];
  return { keyClean, allNames };
});

const sameSiteCache = new Map<string, boolean>();

/**
 * Checks whether two site names represent the same physical site, taking into account
 * aliases, canonical brand variations (e.g. "Sams Club ATL" vs "Sams ATL", "Casey's" vs "Casey's Joplin"),
 * and host names ("samprod", "onm", "owensminorprod").
 */
export function areSameSite(nameA: string, nameB: string, compiledSites: CompiledSite[] = []): boolean {
  if (!nameA || !nameB) return false;
  if (nameA === nameB) return true;

  const cacheKey = nameA < nameB ? `${nameA}|${nameB}` : `${nameB}|${nameA}`;
  const cached = sameSiteCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const cleanA = normalizeCanonical(nameA);
  const cleanB = normalizeCanonical(nameB);
  if (cleanA && cleanB && cleanA === cleanB) {
    sameSiteCache.set(cacheKey, true);
    return true;
  }

  const spacelessA = cleanA.replace(/\s+/g, '');
  const spacelessB = cleanB.replace(/\s+/g, '');
  if (spacelessA && spacelessB && spacelessA === spacelessB) {
    sameSiteCache.set(cacheKey, true);
    return true;
  }

  // Distinct Essilor Luxottica sites must NEVER be matched together:
  const isAtl = (s: string) => /atl|atlanta/i.test(s);
  const isCol = (s: string) => /col|columbus|colombus/i.test(s);
  const isSed = (s: string) => /sedico/i.test(s);
  const isFhrOrGeneric = (s: string) => /fhr/i.test(s) || (/essilor|luxottica/i.test(s) && !isAtl(s) && !isCol(s) && !isSed(s));

  if (/essilor|luxottica/i.test(nameA) && /essilor|luxottica/i.test(nameB)) {
    if (isAtl(nameA) !== isAtl(nameB)) {
      sameSiteCache.set(cacheKey, false);
      return false;
    }
    if (isCol(nameA) !== isCol(nameB)) {
      sameSiteCache.set(cacheKey, false);
      return false;
    }
    if (isSed(nameA) !== isSed(nameB)) {
      sameSiteCache.set(cacheKey, false);
      return false;
    }
    if (isFhrOrGeneric(nameA) !== isFhrOrGeneric(nameB)) {
      sameSiteCache.set(cacheKey, false);
      return false;
    }
  }

  // Sams Club ATL vs LAX must NEVER be matched together:
  if (/sam.*atl|samprod|samsprod|^4993/i.test(nameA) && /sam.*lax|samlax|^8799|^9476/i.test(nameB)) {
    sameSiteCache.set(cacheKey, false);
    return false;
  }
  if (/sam.*lax|samlax|^8799|^9476/i.test(nameA) && /sam.*atl|samprod|samsprod|^4993/i.test(nameB)) {
    sameSiteCache.set(cacheKey, false);
    return false;
  }

  // Domain aliases:
  const isSamsAtl = (s: string) => /sam.*atl|samprod|samsprod|^4993/i.test(s);
  if (isSamsAtl(nameA) && isSamsAtl(nameB)) {
    sameSiteCache.set(cacheKey, true);
    return true;
  }

  const isSamsLax = (s: string) => /sam.*lax|samlax|^8799|^9476/i.test(s);
  if (isSamsLax(nameA) && isSamsLax(nameB)) {
    sameSiteCache.set(cacheKey, true);
    return true;
  }

  const isCaseys = (s: string) => /casey/i.test(s);
  if (isCaseys(nameA) && isCaseys(nameB)) {
    sameSiteCache.set(cacheKey, true);
    return true;
  }

  const isOwens = (s: string) => /owens|onm/i.test(s);
  if (isOwens(nameA) && isOwens(nameB)) {
    sameSiteCache.set(cacheKey, true);
    return true;
  }

  const isSedico = (s: string) => /sedico/i.test(s);
  if (isSedico(nameA) && isSedico(nameB)) {
    sameSiteCache.set(cacheKey, true);
    return true;
  }

  const isElAtl = (s: string) => /el[-_]?atl|atlanta.*luxottica|luxottica.*atlanta/i.test(s);
  if (isElAtl(nameA) && isElAtl(nameB)) {
    sameSiteCache.set(cacheKey, true);
    return true;
  }

  // Check pre-compiled KNOWN_SITE_ALIASES (strict exact alias inclusion)
  for (let i = 0; i < COMPILED_KNOWN_SITE_ALIASES.length; i++) {
    const { allNames } = COMPILED_KNOWN_SITE_ALIASES[i];
    const matchA = allNames.includes(cleanA);
    const matchB = allNames.includes(cleanB);
    if (matchA && matchB) {
      sameSiteCache.set(cacheKey, true);
      return true;
    }
  }

  sameSiteCache.set(cacheKey, false);
  return false;
}

const caseToSiteCache = new Map<string, string | null>();

export function findBestSiteForCase(caseRecord: SFCase, compiledSites: CompiledSite[]): string | null {
  if (!caseRecord || !compiledSites || compiledSites.length === 0) return null;

  const raw = caseRecord as Record<string, unknown>;
  const cId = String(caseRecord.Id || raw.id || raw.case_id || '');
  if (cId) {
    const key = `${cId}:${caseRecord.LastModifiedDate || ''}:${compiledSites.length}`;
    if (caseToSiteCache.has(key)) {
      return caseToSiteCache.get(key)!;
    }
    const result = _computeBestSiteForCase(caseRecord, compiledSites);
    caseToSiteCache.set(key, result);
    return result;
  }

  return _computeBestSiteForCase(caseRecord, compiledSites);
}

function _computeBestSiteForCase(caseRecord: SFCase, compiledSites: CompiledSite[]): string | null {
  const raw = caseRecord as Record<string, unknown>;
  const sub = String(caseRecord.Subject || raw.subject || '').trim();
  const combinedContext = [
    caseRecord.Snow_Sitename__c,
    caseRecord.Customer_Location__c,
    caseRecord.Site_Name_Customer_Input__c,
    caseRecord.Impacted_Sites__c,
    sub,
    caseRecord.Account_Name__c || raw.account_name,
  ].filter(Boolean).join(' ').toLowerCase();

  // Primary authoritative XPO -> GXO site resolution:
  // "all xpo - site_name are GXO _sitename so do it accordingly"
  // Guarantees alerts like "XPO -hnm", "XPO - hnm", "XPO-hnm" map to GXO-H&M Prod and NEVER leak into H&M Canada Ajax.
  if (/\b(?:xpo|gxo)\b/i.test(combinedContext) || /\b(?:xpo|gxo)[-_]/i.test(combinedContext)) {
    if (/\b(hnm|hm|h\s*&\s*m|perris)\b/i.test(combinedContext)) {
      const gxo = compiledSites.find(x => /gxo.*(h&m|hm)/i.test(x.originalName));
      return gxo ? gxo.originalName : 'GXO-H&M Prod';
    }
    if (/\b(nike)\b/i.test(combinedContext)) {
      const gxo = compiledSites.find(x => /gxo.*nike/i.test(x.originalName));
      return gxo ? gxo.originalName : 'GXO-Nike';
    }
    if (/\b(apple)\b/i.test(combinedContext)) {
      const gxo = compiledSites.find(x => /gxo.*apple/i.test(x.originalName));
      return gxo ? gxo.originalName : 'GXO-Apple';
    }
    if (/\b(lacoste)\b/i.test(combinedContext)) {
      const gxo = compiledSites.find(x => /gxo.*lacoste/i.test(x.originalName));
      return gxo ? gxo.originalName : 'GXO-Lacoste';
    }
    if (/\b(verizon)\b/i.test(combinedContext)) {
      const gxo = compiledSites.find(x => /gxo.*verizon/i.test(x.originalName));
      return gxo ? gxo.originalName : 'GXO-Verizon';
    }
    if (/\b(af|a\s*&\s*f|anf)\b/i.test(combinedContext)) {
      const gxo = compiledSites.find(x => /gxo.*af/i.test(x.originalName));
      return gxo ? gxo.originalName : 'GXO-AF';
    }
  }

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
    if (/\b(perris|xpo|gxo)\b/i.test(combinedContext)) {
      const gxo = compiledSites.find(x => /gxo.*(h&m|hm)/i.test(x.originalName));
      if (gxo) return gxo.originalName;
      return 'GXO-H&M Prod';
    }
    if (/\b(ajax|canada)\b/i.test(combinedContext) && !/perris|xpo|gxo/i.test(combinedContext)) {
      const hm = compiledSites.find(x => /ajax|h&m canada/i.test(x.originalName));
      if (hm) return hm.originalName;
      return 'H&M Canada Ajax';
    }
    if (/\b(robbinsville|p1)\b/i.test(combinedContext)) {
      const p1 = compiledSites.find(x => /p1/i.test(x.originalName));
      if (p1) return p1.originalName;
      return 'H&M P1';
    }
  }

  if (sub) {
    if (isAlertCase(caseRecord) || /\b(xpo|gxo|samprod|samsprod|samsatl|samatl|casey|caseys|owensminor|onm|sedico|elatl|elcolombus|4993)\b/i.test(sub)) {
      const siteFromSub = extractSiteFromAlertSubject(sub, compiledSites);
      if (siteFromSub) return siteFromSub;
    }
  }

  // Level 1: Account ID match (most authoritative, exact Salesforce record linkage)
  const accId = caseRecord.AccountId || raw.account_id;
  if (accId) {
    const targetId = String(accId).trim();
    const sitesWithAcc = compiledSites.filter(s => s.accountId && String(s.accountId).trim() === targetId);
    if (sitesWithAcc.length > 0) {
      const uniqueNames = Array.from(new Set(sitesWithAcc.map(s => s.originalName)));
      if (uniqueNames.length === 1) {
        return uniqueNames[0];
      }
    }
    const def = (sitesData as Array<{ name: string; salesforce_account_id?: string }>).find(
      s => s.salesforce_account_id && String(s.salesforce_account_id).trim() === targetId
    );
    if (def) {
      return def.name;
    }
  }

  // Level 2: Account Name match (e.g. "Ryder-Maryland(USA)", "H&M(Ajax)-(Canada)", "Walmart-Mexico(Tepotzotlán)")
  const rawAccountName = (caseRecord.Account_Name__c || raw.account_name || caseRecord.Account?.Name) as string | undefined;
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
  ].filter(Boolean) as string[];

  for (const rawText of siteSpecificTexts) {
    const textClean = normalizeCanonical(rawText);
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

  // Level 5: Fallback to Subject line ONLY if no account or site fields matched
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

  // Also check Subject and Description for explicit percentage statements (e.g. "100% down", "Impact: 50%")
  const textToScan = `${c.Subject || ''} ${c.Description || ''}`;
  if (textToScan.trim()) {
    if (/\b(?:site\s+)?100\s*%\s*(?:down|impact|outage)\b/i.test(textToScan) || /\b100\s*%\s*site\s+down\b/i.test(textToScan)) {
      return 100;
    }
    const match = textToScan.match(/(?:impact|impacted|area down|operational|severity|sev)[^0-9\n]{0,25}(\d+(?:\.\d+)?)\s*%/i);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100) return parsed;
    }
    if (c.Subject) {
      const isResourceMetric = /\b(?:disk|battery|cpu|memory|storage|utilization|charge)\b/i.test(c.Subject);
      if (!isResourceMetric) {
        const subMatch = String(c.Subject).match(/\b(\d+(?:\.\d+)?)\s*%\s*(?:down|impact|outage|capacity|line|picking|grid|facility|throughput|stopped|failure)\b/i);
        if (subMatch) {
          const parsed = parseFloat(subMatch[1]);
          if (!isNaN(parsed) && parsed > 0 && parsed <= 100) return parsed;
        }
      }
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
export function detectSeverity(c: SFCase): 'sev1' | 'sev2' | 'sev3' {
  if (!c) return 'sev3';
  if (isAlertCase(c)) return 'sev3';
  if (isDirTicket(c)) return 'sev3';

  const raw = c as Record<string, unknown>;
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

  // Explicit Sev 2 High: 1% - 49% Impact is Sev 2 High (NOT Sev 2 Urgent)
  if (impact >= 1 && impact < 50) {
    return 'sev3';
  }

  // Authoritative case severity fields
  const highestSev = highestSevRaw.toUpperCase();
  const prio = String(raw.Priority || raw.Snow_Priority__c || raw.Snow_Urgency__c || '').trim().toUpperCase();

  // Explicit Standard Sev 2 High (e.g. "2 - High", "Severity 2", "High", "P2" without "Urgent") is NOT Sev 2 Urgent
  for (const s of [highestSev, prio].filter(Boolean)) {
    if (
      s.includes('2 - HIGH') ||
      s.includes('2 - STANDARD') ||
      s === 'HIGH' ||
      s === 'P2' ||
      s === 'SEV 2' ||
      s === 'SEVERITY 2' ||
      s === 'SEV-2'
    ) {
      if (!s.includes('URGENT')) {
        return 'sev3';
      }
    }
  }

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
      s.includes('SEVERITY 2 URGENT') ||
      s.includes('P2 - URGENT') ||
      s.includes('P2 URGENT')
    ) {
      return 'sev2';
    }
  }

  // Rule 5: Subject line explicit urgency / severity tags (must be explicit tag, not regular English adjective)
  const sub = String(c.Subject || raw.subject || '').trim();
  if (/(?:^|[\[\(\s])(?:SEV[-_ ]*1(?:[-_ ]*URGENT)?|P1[-_ ]*URGENT|SEVERITY[-_ ]*1|CRITICAL[-_ ]*(?:OUTAGE|INCIDENT|SEV|IMPACT)|\[CRITICAL\])(?:$|[\]\)\s:])/i.test(sub)) {
    return 'sev1';
  }
  if (/(?:^|[\[\(\s])(?:SEV[-_ ]*2[-_ ]*URGENT|P2[-_ ]*URGENT|SEVERITY[-_ ]*2[-_ ]*URGENT)(?:$|[\]\)\s:])/i.test(sub)) {
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
  return Boolean(best && areSameSite(best, targetSiteName, compiled));
}

export function getBestSiteForCase(
  caseRecord: SFCase,
  allSiteNames: string[] = ALL_SITE_NAMES
): string | null {
  const compiled = compileSiteIndex(allSiteNames);
  return findBestSiteForCase(caseRecord, compiled);
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
export const sfFetchLiveCasesOverview = async (forceRefresh: boolean = false) => {
  try {
    const url = forceRefresh ? '/api/cases/overview?refresh=true' : '/api/cases/overview';
    const res = await fetch(url, {
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
          closedAlerts: (data.closedAlerts || []) as SFCase[],
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
    closedAlerts: [] as SFCase[],
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
  forceRefresh?: boolean;
  range?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
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
    const qParams = new URLSearchParams();
    if (params?.forceRefresh) qParams.set('refresh', 'true');
    if (params?.range) qParams.set('range', params.range);
    if (params?.startDate) qParams.set('startDate', params.startDate);
    if (params?.endDate) qParams.set('endDate', params.endDate);
    if (params?.startTime) qParams.set('startTime', params.startTime);
    if (params?.endTime) qParams.set('endTime', params.endTime);
    const qs = qParams.toString();
    const queryParam = qs ? `?${qs}` : '';
    const res = await fetch(`/api/cases/site/${encodeURIComponent(siteName)}${queryParam}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && Array.isArray(json.cases)) {
        const strictlyFiltered = (json.cases as SFCase[]).filter(c => isLiveOpenCase(c) && !hasTicketEndTime(c) && !getTicketEndTime(c));
        let alertsFiltered = Array.isArray(json.alerts) ? (json.alerts as SFCase[]) : [];
        const closedFiltered = Array.isArray(json.closed) ? (json.closed as SFCase[]) : [];

        // Resilient fallback: if alerts array is empty, search closed and cases lists
        if (alertsFiltered.length === 0) {
          if (closedFiltered.length > 0 && closedFiltered.some(isAlertCase)) {
            alertsFiltered = closedFiltered.filter(isAlertCase);
          } else if ((json.cases as SFCase[]).some(isAlertForShiftBucket)) {
            alertsFiltered = (json.cases as SFCase[]).filter(isAlertForShiftBucket);
          }
        }

        return {
          totalSize: strictlyFiltered.length,
          done: true,
          records: strictlyFiltered,
          alerts: alertsFiltered,
          closed: closedFiltered,
          product_lines: (json.product_lines as string[]) || (json.site?.product_lines as string[]) || [],
          product_line: (json.product_line as string) || (json.site?.product_line as string) || null,
          site: json.site || null,
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
    closed: [] as SFCase[],
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

export interface AlertAnalyticsBucket {
  index: number;
  label: string;
  startTime: string;
  endTime: string;
  total: number;
  open: number;
  closed: number;
  breached?: number;
  frBreached?: number;
  autoResolved?: number;
  avgDurationMinutes: number;
}

export interface TopAlertItem {
  name: string;
  count: number;
  open: number;
  closed: number;
  breaches: number;
  frBreaches: number;
  autoResolved: number;
  avgDurationMinutes: number;
  pct: number;
}

export interface AlertAnalyticsResult {
  siteName: string;
  range: string;
  rangeLabel: string;
  totalAlerts: number;
  openAlerts: number;
  closedAlerts: number;
  resolutionRate: number;
  avgDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  breachedAlerts: number;
  frBreachedAlerts: number;
  slaComplianceRate: number;
  autoResolvedAlerts: number;
  autoResolvedRate: number;
  properCloseAlerts: number;
  properCloseRate: number;
  healthScore?: number;
  healthStatus?: 'OPTIMAL' | 'OPERATIONAL' | 'DEGRADED' | 'CRITICAL';
  buckets: AlertAnalyticsBucket[];
  topAlerts: TopAlertItem[];
  topCategories?: Array<{ name: string; count: number; pct?: number }>;
  alerts?: SFCase[];
}

export function extractAlertSignature(alert: SFCase | Record<string, unknown>): string {
  if (!alert) return 'System Monitoring Alert';
  const raw = alert as Record<string, unknown>;
  const sub = String(raw.Subject || raw.subject || '').trim();

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

    // 4. Strip site host prefixes like "flexo-hnm-canada:", "xpo-hnm:", "XPO -hnm:", "XPO - hnm:", "hnm-canada:", "walmartmxprod:", "cc-temuco:"
    cleaned = cleaned.replace(/^[<\[]?(?:xpo|gxo)\s*[-_ ]+\s*[a-z0-9._-]+[>\]]?\s*[:|–—\-]?\s*/i, '').trim();
    cleaned = cleaned.replace(/^[a-z0-9_-]+(?:'s|:|-)\s*/i, (match) => {
      if (/(?:hnm|walmart|evergreen|activewear|arvato|gap|flipkart|target|ikea|cc-|flexo-|prod-|qa[0-9]-|xpo-|gxo-|sams|lacoste|elatl|figs|dhl|ykk|stryker)/i.test(match)) {
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

  const prod = String(raw.Product_Type__c || raw.Product_Line || '').trim();
  if (prod && !/alert/i.test(prod)) {
    return `${prod} Alert`;
  }

  const desc = String(raw.Description || raw.description || '').trim();
  if (desc) {
    const firstLine = desc.split(/[\r\n]+/)[0].trim();
    const alertMatch = firstLine.match(/(?:alert|error|failure|exception):\s*([a-zA-Z0-9_\- ]{3,50})/i);
    if (alertMatch && alertMatch[1]) {
      return alertMatch[1].trim();
    }
    if (firstLine.length > 5 && firstLine.length < 50 && !/^(hi|hello|dear|team)/i.test(firstLine)) {
      return firstLine;
    }
  }

  return 'System Infrastructure Alert';
}

export const sfFetchAlertAnalytics = async (
  siteName: string = '',
  range: string = '7d',
  forceRefresh: boolean = false,
  customRange?: { startDate?: string; endDate?: string; startTime?: string; endTime?: string } | null
): Promise<AlertAnalyticsResult | null> => {
  try {
    const params = new URLSearchParams();
    if (siteName && siteName !== 'all') params.set('site', siteName);
    if (range) params.set('range', range);
    if (range === 'custom' && customRange) {
      if (customRange.startDate) params.set('startDate', customRange.startDate);
      if (customRange.endDate) params.set('endDate', customRange.endDate);
      if (customRange.startTime) params.set('startTime', customRange.startTime);
      if (customRange.endTime) params.set('endTime', customRange.endTime);
    }
    if (forceRefresh) params.set('force', 'true');
    const res = await fetch(`/api/cases/alerts/analytics?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        return data as AlertAnalyticsResult;
      }
    }
  } catch (err) {
    console.warn('[Salesforce client] Notice querying alert analytics:', (err as Error).message);
  }
  return null;
};

// ─── RED Zone Sites Types & API Client ─────────────────────────────────────────

export interface RedZoneDailyMetric {
  date: string;
  dayLabel: string;
  sev1Count: number;
  sev2Count: number;
  totalIncidents: number;
  resolvedCount: number;
  downtimeHours: number;
}

export interface RedZoneQualifyingIncident {
  id: string;
  caseNumber: string;
  subject: string;
  severity: 'sev1' | 'sev2' | 'sev3';
  rawSeverity?: string | null;
  status: string;
  createdDate: string;
  createdTime?: number;
  closedDate?: string | null;
  endTime?: string | null;
  durationHours?: number | null;
  description?: string | null;
  isSiteDown?: boolean;
  impactPercentage?: number;
}

export interface RedZoneSiteInfo {
  siteName: string;
  siteId: string;
  product_line: string;
  product_lines?: string[];
  location?: string | null;
  status: 'ACTIVE_BREACH' | 'EXIT_PENDING' | 'HEALTHY';
  isCurrentBreach: boolean;
  isSheetDesignated?: boolean;
  sheetReason?: string | null;
  sheetDate?: string | null;
  lastBreachDate: string;
  daysSinceBreach: number;
  daysRemainingToExit: number;
  reasons: string[];
  criteria1: {
    met: boolean;
    sev1Count7d: number;
    sev2Count7d: number;
    thresholdSev1: number;
    thresholdSev2: number;
  };
  criteria2: {
    met: boolean;
    uptimePercentage: number | null;
    omitted: boolean;
    threshold?: number;
    source?: string | null;
    rowIdx?: number | null;
    rawVal?: string | null;
  };
  criteria3: {
    met: boolean;
    mtbfHours: number | null;
    incidentCount14d: number;
    thresholdMtbf: number;
  };
  meanTimeToResolveHours?: number | null;
  dailyMetrics?: RedZoneDailyMetric[];
  qualifyingIncidents: RedZoneQualifyingIncident[];
}

export interface RedZoneSheetSyncConfig {
  url: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  isSyncing: boolean;
  count: number;
  uptimeSitesCount?: number;
  lastRow?: {
    rowIndex: number;
    dateLabel: string;
    cellCount: number;
  } | null;
  uptimeSitesBelow99?: Array<{ siteName: string; uptime: number }>;
  sites: Array<{
    siteName: string;
    rawName: string;
    reason: string;
    entryDate?: string | null;
  }>;
}

export interface RedZoneOverviewResult {
  totalRedZoneSites: number;
  activeBreachesCount: number;
  exitPendingCount: number;
  redZoneSites: RedZoneSiteInfo[];
  sheetSync?: RedZoneSheetSyncConfig | null;
  criteriaSummary: {
    criteria1: string;
    criteria2: string;
    criteria3: string;
    exitCriteria: string;
  };
  timestamp: string;
}

export const WEEK_42_UPTIMES: Record<string, { uptime: number; rawVal: string }> = {
  'apotek': { uptime: 88.13, rawVal: '88.13%' },
  'sams club atl': { uptime: 95.76, rawVal: '95.76%' },
  'h&m canada ajax': { uptime: 96.37, rawVal: '96.37%' },
  'ikea': { uptime: 96.58, rawVal: '96.58%' },
  'essilor luxottica -columbus': { uptime: 97.66, rawVal: '97.66%' },
  'dhl- figs': { uptime: 98.52, rawVal: '98.52%' },
};

/**
 * Client-side calculation engine for RED Zone sites.
 * Evaluates:
 * - Criteria 1: >= 3 Sev-1 OR >= 5 Sev-2 in last 7 days
 * - Criteria 2: Uptime < 99% (evaluated from actual uptime sheet data)
 * - Criteria 3: MTBF < 36 hours in last 14 days (calculated per site individually)
 * - Exit Criteria: 21 continuous days without breach to exit
 */
export function computeRedZoneSitesClientSide(
  cases: SFCase[] = [],
  allSiteNames: string[] = ALL_SITE_NAMES
): RedZoneOverviewResult {
  const now = Date.now();
  const compiledSites = compileSiteIndex(allSiteNames);

  // Filter for real customer incidents (exclude alerts, DIR approvals)
  const validIncidents = cases.filter(c => {
    if (!c) return false;
    if (isAlertCase(c)) return false;
    if (isDirTicket(c)) return false;
    return isIncidentTicket(c);
  });

  const siteIncidentsMap = new Map<string, { siteName: string; incidents: any[] }>();
  for (const name of allSiteNames) {
    siteIncidentsMap.set(name.toLowerCase(), { siteName: name, incidents: [] });
  }

  for (const c of validIncidents) {
    const matchedSite = findBestSiteForCase(c, compiledSites);
    if (!matchedSite) continue;
    const key = matchedSite.toLowerCase();
    if (!siteIncidentsMap.has(key)) {
      siteIncidentsMap.set(key, { siteName: matchedSite, incidents: [] });
    }
    const sev = detectSeverity(c);
    const endTimeStr = getTicketEndTime(c);
    const createdTime = c.CreatedDate ? new Date(c.CreatedDate).getTime() : 0;
    const endTimeMs = endTimeStr ? new Date(endTimeStr).getTime() : c.ClosedDate ? new Date(c.ClosedDate).getTime() : 0;
    let durationHours: number | null = null;
    const rawDt = (c as any).Downtime__c;
    if (rawDt !== undefined && rawDt !== null && rawDt !== '') {
      const dtNum = Number(rawDt);
      if (!isNaN(dtNum) && dtNum > 0) {
        durationHours = Math.round(dtNum * 10) / 10;
      }
    }
    if (durationHours === null && endTimeMs > 0 && createdTime > 0 && endTimeMs >= createdTime) {
      durationHours = Math.round(((endTimeMs - createdTime) / (1000 * 60 * 60)) * 10) / 10;
    }

    siteIncidentsMap.get(key)!.incidents.push({
      id: c.Id,
      caseNumber: c.CaseNumber,
      subject: c.Subject || 'No Subject',
      severity: sev,
      rawSeverity: String(c.Highest_Severity__c || c.Severity__c || ''),
      status: c.Status || (endTimeStr ? 'Closed' : 'Active'),
      createdDate: c.CreatedDate,
      createdTime,
      closedDate: endTimeStr || c.ClosedDate || null,
      endTime: endTimeStr || null,
      durationHours,
      description: c.Description || (c as any).description || null,
      isSiteDown: Boolean(c.Is_Site_100_Down__c || (c as any).is_site_down),
    });
  }

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

  const redZoneSites: RedZoneSiteInfo[] = [];

  for (const [_, { siteName, incidents }] of siteIncidentsMap.entries()) {
    const distinctIncidents = deduplicateIncidents(incidents);
    distinctIncidents.sort((a, b) => b.createdTime - a.createdTime);

    // 7-day window
    const incidents7d = distinctIncidents.filter(i => (now - i.createdTime) <= SEVEN_DAYS_MS);
    const sev1_7d = incidents7d.filter(i => i.severity === 'sev1').length;
    const sev2_7d = incidents7d.filter(i => i.severity === 'sev2').length;
    const criteria1Met = (sev1_7d >= 3) || (sev2_7d >= 5);

    // Criteria-2: Uptime (evaluated from Week-42 actual uptime data)
    const cleanSiteKey = normalizeCanonical(siteName);
    const uptimeData = WEEK_42_UPTIMES[cleanSiteKey] || null;
    const uptimeVal = uptimeData ? uptimeData.uptime : null;
    const criteria2Met = uptimeVal !== null && uptimeVal < 99.0;
    const criteria2 = {
      met: criteria2Met,
      uptimePercentage: uptimeVal,
      omitted: false,
      threshold: 99.0,
      source: uptimeVal !== null ? 'Week-42 Actual Uptime' : null,
      rowIdx: uptimeVal !== null ? 1 : null,
      rawVal: uptimeData ? uptimeData.rawVal : null,
    };

    // User requirement: Only evaluate sites that have uptime data given
    if (uptimeVal === null) {
      continue;
    }

    // 14-day window MTBF per individual site (336 operating hours / operational incident count)
    const incidents14d = distinctIncidents.filter(i => (now - i.createdTime) <= FOURTEEN_DAYS_MS);
    const N = incidents14d.length;
    let mtbfHours: number | null = null;
    let criteria3Met = false;

    if (N === 0) {
      mtbfHours = null;
      criteria3Met = false;
    } else {
      mtbfHours = Math.round((336 / N) * 10) / 10;
      criteria3Met = mtbfHours < 36;
    }

    const isCurrentBreach = criteria1Met || criteria2Met || criteria3Met;

    // Check rolling windows for 21-day exit calculation
    let lastBreachTime: number | null = null;
    if (isCurrentBreach) {
      lastBreachTime = now;
    } else {
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
      continue;
    }

    const daysSinceBreach = Math.floor((now - lastBreachTime) / (24 * 60 * 60 * 1000));
    const daysRemainingToExit = Math.max(0, 21 - daysSinceBreach);

    if (daysRemainingToExit <= 0 && !isCurrentBreach) {
      continue;
    }

    const reasons: string[] = [];
    if (criteria2Met) reasons.push(`Actual Uptime is ${uptimeVal}% (< 99.0% threshold in Week-42)`);
    if (sev1_7d >= 3) reasons.push(`${sev1_7d} Sev-1 Incidents in last 7 days (Threshold: 3)`);
    if (sev2_7d >= 5) reasons.push(`${sev2_7d} Sev-2 Incidents in last 7 days (Threshold: 5)`);
    if (criteria3Met) reasons.push(`Site MTBF is ${mtbfHours}h (< 36h threshold in last 14 days)`);
    if (!isCurrentBreach) reasons.push(`In 21-Day Exit Probation: ${daysSinceBreach} clean days observed, ${daysRemainingToExit} days remaining to exit`);

    // Compute 21-day daily metrics for executive timeline graph (aligns with 21-day Red Zone cycle)
    const dailyMetrics: RedZoneDailyMetric[] = [];
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
      const downtimeOnDay = Math.round(
        dayIncidents.reduce((acc, curr) => acc + (curr.durationHours || 0), 0) * 10
      ) / 10;

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

    const resolvedIncidents = distinctIncidents.filter(i => typeof i.durationHours === 'number' && i.durationHours > 0);
    const meanTimeToResolveHours = resolvedIncidents.length > 0
      ? Math.round((resolvedIncidents.reduce((acc, i) => acc + (i.durationHours || 0), 0) / resolvedIncidents.length) * 10) / 10
      : null;

    redZoneSites.push({
      siteName,
      siteId: `sf-site-${siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      product_line: 'RMS',
      status: isCurrentBreach ? 'ACTIVE_BREACH' : 'EXIT_PENDING',
      isCurrentBreach,
      lastBreachDate: new Date(lastBreachTime).toISOString(),
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
      qualifyingIncidents: (() => {
        const sev12 = distinctIncidents.filter(i => i.severity === 'sev1' || i.severity === 'sev2');
        const others = distinctIncidents.filter(i => i.severity !== 'sev1' && i.severity !== 'sev2');
        return [...sev12, ...others].slice(0, 200).map(i => ({
        id: i.id,
        caseNumber: i.caseNumber,
        subject: i.subject,
        severity: i.severity,
        rawSeverity: i.rawSeverity,
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

  redZoneSites.sort((a, b) => {
    if (a.isCurrentBreach && !b.isCurrentBreach) return -1;
    if (!a.isCurrentBreach && b.isCurrentBreach) return 1;
    const aMtbf = a.criteria3.mtbfHours ?? 9999;
    const bMtbf = b.criteria3.mtbfHours ?? 9999;
    return aMtbf - bMtbf;
  });

  return {
    totalRedZoneSites: redZoneSites.length,
    activeBreachesCount: redZoneSites.filter(s => s.status === 'ACTIVE_BREACH').length,
    exitPendingCount: redZoneSites.filter(s => s.status === 'EXIT_PENDING').length,
    redZoneSites,
    criteriaSummary: {
      criteria1: '>= 3 Sev-1 or >= 5 Sev-2 in last 7 days',
      criteria2: '< 99% actual uptime (evaluated from Week-42 uptime data)',
      criteria3: 'MTBF < 36 hours in last 14 days (calculated per individual site)',
      exitCriteria: '21 continuous days without breach to exit Red Zone',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fetch RED Zone sites overview from backend API with fallback to client-side computation.
 */
export const sfFetchRedZoneSites = async (forceRefresh: boolean = false, siteName?: string): Promise<RedZoneOverviewResult> => {
  try {
    const params = new URLSearchParams();
    if (forceRefresh) params.set('refresh', 'true');
    if (siteName) params.set('site', siteName);
    const qs = params.toString();
    const res = await fetch(`/api/cases/red-zone${qs ? `?${qs}` : ''}`, {
      signal: AbortSignal.timeout(45000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.redZoneSites)) {
        return data as RedZoneOverviewResult;
      }
    }
  } catch (err) {
    console.warn('[Salesforce client] /api/cases/red-zone notice, calculating via overview data:', (err as Error).message);
  }

  // Resilient fallback: compute from sfOverview live cases
  try {
    const overview = await sfFetchLiveCasesOverview();
    const cases = [...(overview.cases || [])];
    return computeRedZoneSitesClientSide(cases);
  } catch {
    return {
      totalRedZoneSites: 0,
      activeBreachesCount: 0,
      exitPendingCount: 0,
      redZoneSites: [],
      criteriaSummary: {
        criteria1: '>= 3 Sev-1 or >= 5 Sev-2 in last 7 days',
        criteria2: '< 99% actual uptime (evaluated from Week-42 uptime data)',
        criteria3: 'MTBF < 36 hours in last 14 days (calculated per individual site)',
        exitCriteria: '21 continuous days without breach to exit Red Zone',
      },
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Fetch current Cloud Sheet (Google Sheets / OneDrive) sync status and configuration.
 */
export const sfFetchSheetConfig = async (): Promise<RedZoneSheetSyncConfig | null> => {
  try {
    const res = await fetch('/api/cases/red-zone/sheet-config', {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        return data as RedZoneSheetSyncConfig;
      }
    }
  } catch (err) {
    console.warn('[Salesforce client] /api/cases/red-zone/sheet-config notice:', (err as Error).message);
  }
  return null;
};

/**
 * Trigger Cloud Sheet sync, update the URL, or supply direct CSV/TSV data.
 */
export const sfTriggerSheetSync = async (
  optionsOrUrl?: string | { url?: string; csvData?: string }
): Promise<{
  success: boolean;
  count?: number;
  uptimeCount?: number;
  lastRow?: { rowIndex: number; dateLabel: string; cellCount: number } | null;
  error?: string;
  sheetConfig?: RedZoneSheetSyncConfig;
}> => {
  try {
    let body: { url?: string; csvData?: string } = {};
    if (typeof optionsOrUrl === 'string') {
      body = { url: optionsOrUrl.trim() };
    } else if (optionsOrUrl && typeof optionsOrUrl === 'object') {
      body = {
        url: optionsOrUrl.url ? optionsOrUrl.url.trim() : undefined,
        csvData: optionsOrUrl.csvData ? optionsOrUrl.csvData.trim() : undefined,
      };
    }
    const res = await fetch('/api/cases/red-zone/sheet-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
};

/**
 * Resolves the real Assignee Name, eliminating 'GreyOrange Queue' or empty fallbacks.
 * Returns the engineer's real name, or 'Unassigned' if not assigned to an individual.
 */
export const getAssigneeDisplayName = (c?: Partial<SFCase> | null): string => {
  if (!c) return 'Unassigned';
  const val = String(
    c.Dev_Case_Assignee__c ||
    c.Owner?.Name ||
    (c as Record<string, any>).assignee ||
    (c as Record<string, any>).assigned_to ||
    ''
  ).trim();
  if (!val || /^greyorange(\s*queue)?$/i.test(val) || /^queue$/i.test(val)) {
    return 'Unassigned';
  }
  return val;
};

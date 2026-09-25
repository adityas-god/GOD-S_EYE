export type { SiteCategory, EnterpriseSite } from './sites';

export type SeverityLevel = 'SEV1' | 'SEV2' | 'SEV3';
export type DaySeverity = 'RED' | 'YELLOW' | 'BLUE' | 'GREEN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface Site {
  id: string;
  code: string;
  name: string;
  region: string;
  timezone: string;
  is_active: boolean;
}

export interface SalesforceTicket {
  id: string;
  ticket_key: string;
  site_id: string;
  summary: string;
  description?: string;
  severity: SeverityLevel;
  status: TicketStatus;
  assignee_name: string;
  assignee_email?: string;
  incident_date: string;
  created_at?: string;
  updated_at?: string;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  day_of_month: number;
  day_of_week: number;
  severity_color: DaySeverity;
  hex_color: string;
  total_tickets: number;
  sev1_count: number;
  sev2_count: number;
  sev3_count: number;
  tickets_summary: string[];
  is_current_month: boolean;
}

export interface CalendarMonthSummary {
  total_days: number;
  red_days: number;
  yellow_days: number;
  blue_days: number;
  green_days: number;
  total_incidents: number;
}

export interface CalendarMonthResponse {
  site_id: string;
  month: string;
  summary: CalendarMonthSummary;
  days: CalendarDay[];
}

export interface TrendDataPoint {
  date: string;
  red: number;
  yellow: number;
  blue: number;
  green: number;
  total_incidents: number;
}

export interface SiteKPIs {
  site_id: string;
  site_name: string;
  active_sev1: number;
  active_sev2: number;
  active_sev3: number;
  total_open_incidents: number;
  sla_compliance_pct: number;
  mttr_hours: number;
}

export interface AdminPanelLink {
  id: string;
  site_id: string;
  panel_key: string;
  title: string;
  embed_url: string;
  embedUrl?: string;
  panel_type: 'iframe' | 'markdown' | 'metrics';
  display_order: number;
  updated_by?: string;
  updated_at?: string;
}

export type ServiceHealthStatus = 'HEALTHY' | 'NON_CRITICAL' | 'UNHEALTHY'; // Green, Amber, Red

export interface ServiceHealthItem {
  id: string;
  name: string;
  category: string;
  status: ServiceHealthStatus; // 'HEALTHY' (Green), 'NON_CRITICAL' (Amber), 'UNHEALTHY' (Red)
  alertCount: number;
  uptime: string;
  latencyMs?: number;
  lastIncident?: string;
  details?: string;
}

export type MetricTabKey = 'UPH' | 'PPR' | 'R2R' | 'KPI' | 'DISK' | 'MEM';

export interface MetricDetail {
  key: MetricTabKey;
  label: string;
  fullTitle: string;
  value: string;
  unit: string;
  change: string;
  isPositive: boolean;
  status: 'optimal' | 'warning' | 'critical';
  description: string;
}


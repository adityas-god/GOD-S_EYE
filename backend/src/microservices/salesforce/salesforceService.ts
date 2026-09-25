import { ENTERPRISE_SITES, findSiteById } from './sitesCatalog';

export type SeverityLevel = 'SEV1' | 'SEV2' | 'SEV3';
export type DaySeverityColor = 'RED' | 'YELLOW' | 'BLUE' | 'GREEN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface SalesforceTicketRecord {
  id: string;
  ticketKey: string;
  siteId: string;
  siteName: string;
  summary: string;
  description: string;
  severity: SeverityLevel;
  status: TicketStatus;
  assigneeName: string;
  assigneeRole: string;
  serviceComponent: 'Butler' | 'Bridge' | 'Elastic' | 'Platform' | 'Influx' | 'Logs';
  incidentDate: string; // YYYY-MM-DD
  incidentTime: string; // HH:MM AM/PM
  createdTimestamp: string;
}

export interface DaySeverityResult {
  date: string;
  dayOfMonth: number;
  dayOfWeek: number;
  severityColor: DaySeverityColor;
  hexColor: string;
  totalTickets: number;
  sev1Count: number;
  sev2Count: number;
  sev3Count: number;
  tickets: SalesforceTicketRecord[];
}

export interface TrendBarPoint {
  label: string;
  date: string;
  green: number;
  blue: number;
  yellow: number;
  red: number;
  total: number;
}

// In-memory ticket storage (extendable with MongoDB or PostgreSQL)
class SalesforceService {
  private ticketsBySite: Map<string, SalesforceTicketRecord[]> = new Map();

  constructor() {
    this.seedEnterpriseTickets();
  }

  // Generate realistic, deterministic, site-specific incident tickets for any site and month
  public generateTicketsForSiteAndMonth(site: any, month: string): SalesforceTicketRecord[] {
    const engineerNames = [
      { name: 'Marcus Vance', role: 'Lead Automation Engineer' },
      { name: 'Sarah Chen', role: 'Robotics Field Specialist' },
      { name: 'Alex Rivera', role: 'Hardware & PLC Technician' },
      { name: 'David Park', role: 'Fleet Reliability Engineer' },
      { name: 'Elena Rostova', role: 'Systems QA Lead' },
      { name: 'Liam O Connor', role: 'Site Reliability Engineer' },
      { name: 'Victor Santos', role: 'Airfreight & Ramp Dispatch' },
      { name: 'Rachel Adams', role: 'Warehouse Platform Lead' },
      { name: 'Hiroshi Tanaka', role: 'Robotics Control Systems' },
      { name: 'Mateo Morales', role: 'Automation Ops Specialist' }
    ];

    const incidentTemplates = [
      { summary: 'Inbound Sorter Matrix Motor Drive Inverter Tripped', sev: 'SEV1' as SeverityLevel, comp: 'Platform' as const, desc: 'Overcurrent tripped on zone 4 inverter drive. Line halted.' },
      { summary: 'Tote Transfer Turntable Proximity Sensor Stall', sev: 'SEV2' as SeverityLevel, comp: 'Butler' as const, desc: 'Optical sensor blocked by packaging debris. AGV unable to dock.' },
      { summary: 'Barcode Optical Scanner Lens Deflection Failure', sev: 'SEV3' as SeverityLevel, comp: 'Bridge' as const, desc: 'Scanner misalignment causing 12% no-read rate on sorting chute.' },
      { summary: 'Ranger AGV Vertical Lift Motor Backlash Anomaly', sev: 'SEV2' as SeverityLevel, comp: 'Butler' as const, desc: 'Accelerometer node reported harmonic vibration outside threshold.' },
      { summary: 'Kafka Diagnostic Telemetry Stream Flush Timeout', sev: 'SEV2' as SeverityLevel, comp: 'Logs' as const, desc: 'Consumer group lag spike during high-throughput pallet ingest.' },
      { summary: 'Substation Voltage Surge — Primary UPS Switched to Bypass', sev: 'SEV1' as SeverityLevel, comp: 'Platform' as const, desc: 'External grid voltage fluctuation tripped input relay.' },
      { summary: 'Handheld RF Gun Wireless Firmware Sync Stalled', sev: 'SEV3' as SeverityLevel, comp: 'Bridge' as const, desc: 'Batch configuration failed on 4 RF units in packaging bay.' },
      { summary: 'Elasticsearch Index Latency on Inventory Lookup', sev: 'SEV3' as SeverityLevel, comp: 'Elastic' as const, desc: 'Query response latency exceeded 200ms on SKU indexing node.' },
      { summary: 'InfluxDB Time-Series Ingest Buffer Full', sev: 'SEV2' as SeverityLevel, comp: 'Influx' as const, desc: 'High-frequency vibration telemetry stream dropped 2 packets.' },
      { summary: 'Emergency Stop Circuit False Positive on Conveyor 6', sev: 'SEV1' as SeverityLevel, comp: 'Platform' as const, desc: 'Safety pull cord micro-switch open circuit detected.' }
    ];

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10) || 2026;
    const m = parseInt(monthStr, 10) || 9;
    const daysInMonth = new Date(year, m, 0).getDate();

    // Unique site hash ensures site-specific behavior
    const siteSeed = site.id.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
    const siteTickets: SalesforceTicketRecord[] = [];

    // Distinct site-wise incident day calculation
    const incidentDays = [
      (siteSeed * 3 + m) % daysInMonth + 1,
      (siteSeed * 7 + m * 2) % daysInMonth + 1,
      (siteSeed * 11 + m * 3) % daysInMonth + 1,
      (siteSeed * 13 + m * 5) % daysInMonth + 1,
      (siteSeed * 17 + m * 7) % daysInMonth + 1,
      ((siteSeed + m) % 5 === 0 ? 3 : 14)
    ];

    const uniqueDays = Array.from(new Set(incidentDays)).sort((a, b) => a - b);

    uniqueDays.forEach((day, dIdx) => {
      const tmpl = incidentTemplates[(siteSeed + dIdx + day) % incidentTemplates.length];
      const eng = engineerNames[(siteSeed + dIdx) % engineerNames.length];
      const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cleanCode = (site.code || 'SITE').replace(/[^A-Z0-9]/g, '');
      const ticketKey = `INC-${cleanCode}-${year}${String(m).padStart(2, '0')}${String(100 + dIdx)}`;

      siteTickets.push({
        id: `tkt_${site.id}_${year}_${m}_${day}_${dIdx}`,
        ticketKey,
        siteId: site.id,
        siteName: site.name,
        summary: `${site.name} — ${tmpl.summary}`,
        description: tmpl.desc,
        severity: tmpl.sev,
        status: dIdx === 0 ? 'OPEN' : dIdx === 1 ? 'IN_PROGRESS' : 'RESOLVED',
        assigneeName: eng.name,
        assigneeRole: eng.role,
        serviceComponent: tmpl.comp,
        incidentDate: dateStr,
        incidentTime: `${String(8 + (dIdx * 2) % 12).padStart(2, '0')}:${String((dIdx * 17) % 60).padStart(2, '0')} AM`,
        createdTimestamp: new Date(`${dateStr}T08:00:00Z`).toISOString()
      });

      // Extra SEV2 ticket on high-incident days
      if (dIdx % 2 === 1) {
        const tmpl2 = incidentTemplates[(siteSeed + dIdx + 2) % incidentTemplates.length];
        siteTickets.push({
          id: `tkt_${site.id}_${year}_${m}_${day}_dup`,
          ticketKey: `INC-${cleanCode}-${year}${String(m).padStart(2, '0')}${String(200 + dIdx)}`,
          siteId: site.id,
          siteName: site.name,
          summary: `${site.name} — Secondary ${tmpl2.summary}`,
          description: tmpl2.desc,
          severity: 'SEV2',
          status: 'IN_PROGRESS',
          assigneeName: engineerNames[(dIdx + 4) % engineerNames.length].name,
          assigneeRole: 'Robotics Specialist',
          serviceComponent: 'Butler',
          incidentDate: dateStr,
          incidentTime: '11:30 AM',
          createdTimestamp: new Date(`${dateStr}T11:30:00Z`).toISOString()
        });
      }
    });

    return siteTickets;
  }

  // Seed default cases for current real month (e.g. 2026-09) and May 2025
  private seedEnterpriseTickets() {
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const targetMonths = Array.from(new Set([currentYearMonth, '2025-05']));

    ENTERPRISE_SITES.forEach((site) => {
      let allTickets: SalesforceTicketRecord[] = [];
      targetMonths.forEach(m => {
        allTickets = allTickets.concat(this.generateTicketsForSiteAndMonth(site, m));
      });

      this.ticketsBySite.set(site.id.toLowerCase(), allTickets);
      this.ticketsBySite.set(site.code.toLowerCase(), allTickets);
      this.ticketsBySite.set(site.name.toLowerCase(), allTickets);
    });
  }

  // 1. Calculate Day Severity Color Hierarchy
  public calculateDaySeverity(tickets: SalesforceTicketRecord[]): { severity: DaySeverityColor; hexColor: string } {
    const sev1 = tickets.filter(t => t.severity === 'SEV1').length;
    const sev2 = tickets.filter(t => t.severity === 'SEV2').length;
    const sev3 = tickets.filter(t => t.severity === 'SEV3').length;

    if (sev1 >= 1) {
      return { severity: 'RED', hexColor: '#EF4444' };
    }
    if (sev2 >= 2) {
      return { severity: 'YELLOW', hexColor: '#F59E0B' };
    }
    if (sev2 === 1 || sev3 >= 1) {
      return { severity: 'BLUE', hexColor: '#3B82F6' };
    }
    return { severity: 'GREEN', hexColor: '#10B981' };
  }

  // 2. Get Month Calendar for Site (Dynamically Generated per Site and Real Month)
  public getCalendarMonth(siteId: string, month?: string): DaySeverityResult[] {
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const normalized = siteId.toLowerCase();
    
    let siteTickets = this.ticketsBySite.get(normalized) || [];
    
    // Check if tickets for this specific month exist; if not, generate them on the fly
    const monthTickets = siteTickets.filter(t => t.incidentDate.startsWith(targetMonth));
    if (monthTickets.length === 0) {
      const siteObj = findSiteById(siteId) || ENTERPRISE_SITES[0];
      const newTickets = this.generateTicketsForSiteAndMonth(siteObj, targetMonth);
      siteTickets = siteTickets.concat(newTickets);
      this.ticketsBySite.set(normalized, siteTickets);
    }

    const [yearStr, monthStr] = targetMonth.split('-');
    const year = parseInt(yearStr, 10) || now.getFullYear();
    const m = parseInt(monthStr, 10) || (now.getMonth() + 1);

    const totalDays = new Date(year, m, 0).getDate();
    const results: DaySeverityResult[] = [];

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, m - 1, day).getDay();

      const dayTickets = siteTickets.filter(t => t.incidentDate === dateStr);
      const sev1 = dayTickets.filter(t => t.severity === 'SEV1').length;
      const sev2 = dayTickets.filter(t => t.severity === 'SEV2').length;
      const sev3 = dayTickets.filter(t => t.severity === 'SEV3').length;

      const { severity, hexColor } = this.calculateDaySeverity(dayTickets);

      results.push({
        date: dateStr,
        dayOfMonth: day,
        dayOfWeek,
        severityColor: severity,
        hexColor,
        totalTickets: dayTickets.length,
        sev1Count: sev1,
        sev2Count: sev2,
        sev3Count: sev3,
        tickets: dayTickets
      });
    }

    return results;
  }

  // 3. Get Tickets for a Site and Date (Strictly Unique)
  public getTickets(siteId: string, date?: string, service?: string): SalesforceTicketRecord[] {
    const normalized = siteId.toLowerCase();
    let siteTickets = this.ticketsBySite.get(normalized) || [];

    if (date) {
      const monthPrefix = date.substring(0, 7);
      if (!siteTickets.some(t => t.incidentDate.startsWith(monthPrefix))) {
        const siteObj = findSiteById(siteId) || ENTERPRISE_SITES[0];
        const newTickets = this.generateTicketsForSiteAndMonth(siteObj, monthPrefix);
        siteTickets = siteTickets.concat(newTickets);
        this.ticketsBySite.set(normalized, siteTickets);
      }
      siteTickets = siteTickets.filter(t => t.incidentDate === date);
    }

    if (service) {
      siteTickets = siteTickets.filter(t => t.serviceComponent.toLowerCase() === service.toLowerCase());
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    const unique: SalesforceTicketRecord[] = [];
    for (const t of siteTickets) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        unique.push(t);
      }
    }

    return unique;
  }

  // 4. Get 13-Week Trend Breakdown for Site
  public getIncidentTrends(siteId: string): TrendBarPoint[] {
    const normalized = siteId.toLowerCase();
    const siteTickets = this.ticketsBySite.get(normalized) || [];

    // 13 weeks of timeline
    const weekLabels = [
      'Feb 24', 'Mar 03', 'Mar 10', 'Mar 17', 'Mar 24', 'Mar 31',
      'Apr 07', 'Apr 14', 'Apr 21', 'Apr 28', 'May 05', 'May 12', 'May 19'
    ];

    const siteObj = findSiteById(siteId);
    const seed = (siteObj ? siteObj.name.length : 12);

    return weekLabels.map((label, idx) => {
      const red = Math.max(1, (seed * (idx + 1)) % 7);
      const yellow = Math.max(2, (seed * 2 + idx) % 15 + 4);
      const blue = Math.max(5, (seed * 3 + idx) % 18 + 8);
      const green = Math.max(20, 50 - red - yellow - blue + ((idx * 3) % 10));
      const total = red + yellow + blue + green;

      return {
        label,
        date: `Week ${idx + 1}`,
        green,
        blue,
        yellow,
        red,
        total
      };
    });
  }

  // 5. Ingest or Sync from Salesforce Apex
  public ingestTicket(ticket: Partial<SalesforceTicketRecord> & { siteId: string; summary: string; severity: SeverityLevel }) {
    const siteId = ticket.siteId.toLowerCase();
    const existing = this.ticketsBySite.get(siteId) || [];

    const newTicket: SalesforceTicketRecord = {
      id: ticket.id || `tkt_${Date.now()}`,
      ticketKey: ticket.ticketKey || `INC-SF-${Math.floor(10000 + Math.random() * 90000)}`,
      siteId: ticket.siteId,
      siteName: ticket.siteName || ticket.siteId,
      summary: ticket.summary,
      description: ticket.description || 'Imported via Salesforce Apex sync connector',
      severity: ticket.severity,
      status: ticket.status || 'OPEN',
      assigneeName: ticket.assigneeName || 'Ops Automation Lead',
      assigneeRole: ticket.assigneeRole || 'Tier 2 Support',
      serviceComponent: ticket.serviceComponent || 'Platform',
      incidentDate: ticket.incidentDate || new Date().toISOString().slice(0, 10),
      incidentTime: ticket.incidentTime || '10:00 AM EDT',
      createdTimestamp: new Date().toISOString()
    };

    existing.unshift(newTicket);
    this.ticketsBySite.set(siteId, existing);
    return newTicket;
  }
}

export const salesforceService = new SalesforceService();

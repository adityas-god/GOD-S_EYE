import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ALL_ENTERPRISE_SITES, EnterpriseSite } from '../microservices/salesforce/sitesCatalog';
import { Site } from '../models/Site';
import { SalesforceTicket } from '../models/SalesforceTicket';
import { SitePanel } from '../models/SitePanel';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 
  'mongodb+srv://adityasctr_db_user:ydv9XNaewJtaQjYC@cluster0.ef4bjjj.mongodb.net/operations_db?retryWrites=true&w=majority';

// 12 Standard Panel Templates
const PANEL_TEMPLATES = [
  { index: 1, title: 'Primary Induction & Sorter Matrix Telemetry', tag: 'Throughput', path: 'panelId=1' },
  { index: 2, title: 'Fleet Butler / AGV Robot Fleet Health', tag: 'Robotics', path: 'panelId=2' },
  { index: 3, title: 'Pick & Put Station Rates (PPR)', tag: 'Throughput', path: 'panelId=3' },
  { index: 4, title: 'Rack-to-Robot (R2R) Cycle Time & Latency', tag: 'Robotics', path: 'panelId=4' },
  { index: 5, title: 'Conveyor Motor Inverter & Thermal Diagnostics', tag: 'Hardware', path: 'panelId=5' },
  { index: 6, title: 'Optical Barcode Scanner Read Rate & Misalignments', tag: 'Hardware', path: 'panelId=6' },
  { index: 7, title: 'Platform GreyMatter Core Service Status', tag: 'Platform', path: 'panelId=7' },
  { index: 8, title: 'Bridge Hardware Gateway Telemetry', tag: 'Gateway', path: 'panelId=8' },
  { index: 9, title: 'Elasticsearch Cluster & Ingestion Pipeline', tag: 'Elastic', path: 'panelId=9' },
  { index: 10, title: 'InfluxDB Time-Series Telemetry Stream', tag: 'Influx', path: 'panelId=10' },
  { index: 11, title: 'Storage Disk I/O & Inode Utilization', tag: 'Infrastructure', path: 'panelId=11' },
  { index: 12, title: 'JVM Memory Buffer & Garbage Collection', tag: 'Infrastructure', path: 'panelId=12' }
];

const CEMS = [
  { name: 'Marcus Vance', email: 'mvance@greyorange.com', phone: '+1 (404) 555-0192', slack: '@marcus.vance' },
  { name: 'Sarah Chen', email: 'schen@greyorange.com', phone: '+1 (312) 555-0144', slack: '@sarah.chen' },
  { name: 'Elena Rostova', email: 'erostova@greyorange.com', phone: '+1 (212) 555-0188', slack: '@elena.rostova' },
  { name: 'David Kim', email: 'dkim@greyorange.com', phone: '+1 (206) 555-0137', slack: '@david.kim' },
  { name: 'Alejandro Morales', email: 'amorales@greyorange.com', phone: '+56 (2) 555-0129', slack: '@alejandro.m' },
  { name: 'Kenji Sato', email: 'ksato@greyorange.com', phone: '+81 (3) 555-0193', slack: '@kenji.sato' },
  { name: 'Nathalie Dupont', email: 'ndupont@greyorange.com', phone: '+33 (1) 555-0182', slack: '@nathalie.d' },
  { name: 'Rajesh Sharma', email: 'rsharma@greyorange.com', phone: '+91 (124) 555-0165', slack: '@rajesh.s' },
];

export function generateSiteIntelligence(s: EnterpriseSite) {
  const hash = s.id.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
  const cleanCode = (s.code || 'SITE').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const cleanId = (s.id || 'site').replace(/[^a-z0-9]/g, '-');
  const cem = CEMS[hash % CEMS.length];

  const octet2 = 100 + (hash % 150);
  const octet3 = 10 + (hash % 80);

  const vmIps = [
    {
      id: `${cleanId}-vm-1`,
      hostname: `${cleanCode}-app-prod-01`,
      ip: `10.${octet2}.${octet3}.11`,
      role: 'Application Cluster Primary',
      status: 'ONLINE',
      specs: 'Ubuntu 22.04 LTS (16 vCPU, 64GB RAM, 500GB NVMe)'
    },
    {
      id: `${cleanId}-vm-2`,
      hostname: `${cleanCode}-app-prod-02`,
      ip: `10.${octet2}.${octet3}.12`,
      role: 'Application Cluster Secondary',
      status: 'ONLINE',
      specs: 'Ubuntu 22.04 LTS (16 vCPU, 64GB RAM, 500GB NVMe)'
    },
    {
      id: `${cleanId}-vm-3`,
      hostname: `${cleanCode}-db-pg-master`,
      ip: `10.${octet2}.${octet3}.20`,
      role: 'PostgreSQL Primary Database',
      status: 'ONLINE',
      specs: 'Debian 12 (32 vCPU, 128GB RAM, 2TB SSD RAID-10)'
    },
    {
      id: `${cleanId}-vm-4`,
      hostname: `${cleanCode}-sorter-ctrl-01`,
      ip: `10.${octet2}.${octet3}.31`,
      role: 'Sorter Matrix PLC Controller',
      status: 'ONLINE',
      specs: 'Industrial Embedded Linux (8 vCPU, 32GB RAM)'
    },
    {
      id: `${cleanId}-vm-5`,
      hostname: `${cleanCode}-edge-gateway-01`,
      ip: `10.${octet2}.${octet3}.45`,
      role: 'Edge Hardware IoT Gateway',
      status: 'ONLINE',
      specs: 'Alpine Linux Edge (4 vCPU, 16GB RAM)'
    },
    {
      id: `${cleanId}-vm-6`,
      hostname: `${cleanCode}-telemetry-agent-01`,
      ip: `10.${octet2}.${octet3}.55`,
      role: 'InfluxDB Telemetry Stream Agent',
      status: hash % 7 === 0 ? 'MAINTENANCE' : 'ONLINE',
      specs: 'Ubuntu 22.04 LTS (8 vCPU, 32GB RAM)'
    }
  ];

  const versions = ['v4.19.2-patch.1', 'v4.19.1', 'v4.18.6-hotfix', 'v4.20.0-rc.3', 'v4.19.0'];
  const deployers = ['DevOps Pipeline (GitHub Actions)', 'Marcus Vance (Lead Automation)', 'Sarah Chen (Robotics Tech)', 'Automated Release Bot v2.4'];
  const commitHashes = ['7f8e91a', 'b42c89d', '910fa3e', 'e719c02', '3a98dc5'];

  const recentDeployment = {
    version: versions[hash % versions.length],
    deployedAt: `2026-09-${String(10 + (hash % 5)).padStart(2, '0')} 03:30 UTC`,
    deployedBy: deployers[hash % deployers.length],
    commitHash: commitHashes[hash % commitHashes.length],
    environment: `${s.region} Production Cluster`,
    notes: `Deployed optimized Ranger AGV trajectory scheduler and patched inverter sensor polling timeout. Verification tests passed with 0 telemetry degradation.`
  };

  const dashboardLinks = [
    {
      id: 'dash_grafana_core',
      title: 'Grafana Telemetry & Sorter Metrics',
      url: `https://cloudwatch.greymatter.greyorange.com/d-solo/LyR7MASDk/process-service-metrics-dashboard-v1?orgId=1&var-site=${s.code}`,
      category: 'Metrics',
      description: 'Live real-time telemetry from facility induction lines, sorters, and motor drivers.'
    },
    {
      id: 'dash_greymatter_ops',
      title: 'GreyMatter Platform Operations Portal',
      url: `https://greymatter.greyorange.com/facilities/${s.id}`,
      category: 'Platform',
      description: 'Central fleet overview, WMS warehouse integrations, and SKU throughput counters.'
    },
    {
      id: 'dash_kibana_logs',
      title: 'Kibana Centralized Incident Logs',
      url: `https://kibana.internal.greyorange.com/app/discover?site=${s.id}`,
      category: 'Logs',
      description: 'Distributed log ingestion pipeline filtered for warning and critical traces.'
    },
    {
      id: 'dash_butler_fleet',
      title: 'Ranger AGV Fleet Dispatcher',
      url: `https://butler.internal.greyorange.com/fleet/${s.code}`,
      category: 'Robotics',
      description: 'Grid coordinate heatmaps, rack collision avoidance status, and bot battery charge.'
    },
    {
      id: 'dash_cloudwatch_alarms',
      title: 'AWS CloudWatch Health & Alarms',
      url: `https://console.aws.amazon.com/cloudwatch/home?region=${s.region === 'LATAM' ? 'sa-east-1' : s.region === 'Europe' ? 'eu-central-1' : 'us-east-1'}#dashboards:name=${s.code}-core`,
      category: 'Infrastructure',
      description: 'Cloud compute latency, database connection pool, and network interface metrics.'
    },
    {
      id: 'dash_influx_telemetry',
      title: 'InfluxDB Raw Telemetry Stream',
      url: `https://influx.internal.greyorange.com/orgs/ops/buckets/${s.id}`,
      category: 'Telemetry',
      description: 'Sub-second motor vibration, optical scanner reflection, and thermal sensors.'
    }
  ];

  const slackChannelName = `#ops-${cleanCode}`;
  const slackChannelUrl = `https://slack.com/app_redirect?channel=${cleanCode}`;

  const warRoomMeetingId = `${800 + (hash % 199)} ${100 + (hash % 899)} ${1000 + (hash % 8999)}`;
  const warRoomPasscode = `NOC-${cleanCode.toUpperCase()}`;
  const warRoomName = `${s.name} NOC War Room`;
  const warRoomUrl = `https://greyorange.zoom.us/j/${warRoomMeetingId.replace(/\s/g, '')}?pwd=${warRoomPasscode}`;

  const siteNotes = `### Operational Handover & Site Runbook: ${s.name} (${s.code})

**Facility Profile:**
- **Target Peak Throughput:** 18,500 Units Per Hour (UPH)
- **Active Grid Footprint:** 320,000 sq ft automation zone
- **Assigned CEM Lead:** ${cem.name} (${cem.email})

**Critical Shift Protocols:**
1. **Induction Line 2 Maintenance Window:** Daily 04:00 - 05:30 Local Time. Never trigger sorter diagnostics during peak pick hours (10:00 - 18:00).
2. **Ranger AGV Battery Management:** Ensure charging station bay #3 through #8 maintain >= 95% active charger uptime.
3. **Escalation Path:** For SEV-1 incidents, alert the Slack channel \`${slackChannelName}\`, join the [Zoom Incident War Room](${warRoomUrl}) (ID: \`${warRoomMeetingId}\`, Passcode: \`${warRoomPasscode}\`), and page ${cem.name} immediately via ${cem.phone}.
`;

  const alerts = [
    {
      id: `${cleanId}-alt-1`,
      alertKey: `ALT-${s.code}-901`,
      title: 'Butler AGV Drive Motor Over-Temperature Threshold Exceeded',
      severity: 'CRITICAL',
      subsystem: 'Butler Fleet',
      sourceComponent: `BOT-${100 + (hash % 80)}`,
      status: 'FIRING',
      timestamp: '04:18 AM EDT',
      value: `${78 + (hash % 6)}.4°C (Limit: 75.0°C)`,
      description: 'Internal thermal sensor on drive wheel assembly #2 triggered safety throttle. Bot slowed to 0.4m/s; heat dissipation cycle required.',
      acknowledgedBy: '',
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/bot-thermal'
    },
    {
      id: `${cleanId}-alt-2`,
      alertKey: `ALT-${s.code}-902`,
      title: 'Sorter CAN-Bus PLC Transceiver Intermittent Frame Drop',
      severity: 'WARNING',
      subsystem: 'Sorter Bridge',
      sourceComponent: 'PLC-CAN-02',
      status: 'FIRING',
      timestamp: '04:05 AM EDT',
      value: '3.8% Packet Jitter (Limit: 1.0%)',
      description: 'CRC parity re-transmissions detected on CAN-Bus channel B. Optical isolator reporting voltage ripple above normal threshold.',
      acknowledgedBy: '',
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/canbus-jitter'
    },
    {
      id: `${cleanId}-alt-3`,
      alertKey: `ALT-${s.code}-903`,
      title: 'Optical Induction Scanner Focal Lens Contrast Saturation',
      severity: 'WARNING',
      subsystem: 'Optics Scanner',
      sourceComponent: 'SCAN-HEAD-04',
      status: 'ACKNOWLEDGED',
      timestamp: '03:42 AM EDT',
      value: '84.2% Read Rate (Limit: 96.0%)',
      description: 'High-speed camera sensor saturation on Induct Line #4. Lens dust cleaning cycle pending; auto-contrast algorithm compensates partially.',
      acknowledgedBy: cem.name,
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/optical-cleaning'
    },
    {
      id: `${cleanId}-alt-4`,
      alertKey: `ALT-${s.code}-904`,
      title: 'Platform Transaction Ingestion Queue Buffer Warning',
      severity: 'CRITICAL',
      subsystem: 'Platform',
      sourceComponent: 'GREYMATTER-INGEST',
      status: 'FIRING',
      timestamp: '03:15 AM EDT',
      value: '82% Queue Fill (Limit: 70%)',
      description: 'Burst of SKU scan events caused temporary queuing in message broker. Scale-up worker daemon provisioned.',
      acknowledgedBy: '',
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/queue-pressure'
    },
    {
      id: `${cleanId}-alt-5`,
      alertKey: `ALT-${s.code}-905`,
      title: 'InfluxDB Time-Series Batch Ingestion Latency Elevation',
      severity: 'INFO',
      subsystem: 'InfluxDB',
      sourceComponent: 'INFLUX-AGENT-01',
      status: 'RESOLVED',
      timestamp: '02:50 AM EDT',
      value: '42ms Write Latency (Norm: 12ms)',
      description: 'Storage partition compaction momentarily increased write latency. Disk I/O normalized.',
      acknowledgedBy: 'Automation Watchdog',
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/influx-compaction'
    },
    {
      id: `${cleanId}-alt-6`,
      alertKey: `ALT-${s.code}-906`,
      title: 'Ranger AGV Fast-Charging Station Bay #5 Current Ripple',
      severity: 'WARNING',
      subsystem: 'Battery Systems',
      sourceComponent: 'BAY-CHG-05',
      status: 'SILENCED',
      timestamp: '01:20 AM EDT',
      value: '14.2A RMS Jitter (Limit: 8.0A)',
      description: 'Ground contact pad wear detected on charging pin #2. Silenced pending scheduled technician inspection window.',
      acknowledgedBy: cem.name,
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/charger-pad'
    }
  ];

  return {
    slackChannelName,
    slackChannelUrl,
    warRoomUrl,
    warRoomName,
    warRoomMeetingId,
    warRoomPasscode,
    cem,
    recentDeployment,
    vmIps,
    dashboardLinks,
    siteNotes,
    alerts
  };
}

export async function seedAllSitesAndPanels(): Promise<{ sitesCount: number; panelsCount: number; ticketsCount: number }> {
  console.log('🔄 Connecting to MongoDB Atlas for schema seeding...');
  
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  }

  console.log('📦 Seeding 80+ Enterprise Sites with rich Site Notes & Infrastructure into MongoDB Atlas...');
  let sitesCount = 0;
  for (const s of ALL_ENTERPRISE_SITES) {
    const intel = generateSiteIntelligence(s);
    await Site.findOneAndUpdate(
      { siteId: s.id },
      {
        siteId: s.id,
        code: s.code,
        name: s.name,
        category: s.category,
        categoryLabel: s.categoryLabel,
        region: s.region,
        timezone: s.timezone,
        isActive: s.isActive,
        
        // Site Intelligence
        slackChannelName: intel.slackChannelName,
        slackChannelUrl: intel.slackChannelUrl,
        warRoomUrl: intel.warRoomUrl,
        warRoomName: intel.warRoomName,
        warRoomMeetingId: intel.warRoomMeetingId,
        warRoomPasscode: intel.warRoomPasscode,
        cem: intel.cem,
        recentDeployment: intel.recentDeployment,
        vmIps: intel.vmIps,
        dashboardLinks: intel.dashboardLinks,
        siteNotes: intel.siteNotes,
        alerts: intel.alerts
      },
      { upsert: true, new: true }
    );
    sitesCount++;
  }
  console.log(`✅ Upserted ${sitesCount} Sites with full metadata in MongoDB Atlas.`);

  console.log('📊 Seeding 12 Panels per site into MongoDB Atlas (total ~960 panels)...');
  let panelsCount = 0;
  for (const s of ALL_ENTERPRISE_SITES) {
    for (const p of PANEL_TEMPLATES) {
      const panelId = `panel_${s.id}_${p.index}`;
      const defaultUrl = `https://grafana.wikimedia.org/d-solo/000000021/mediawiki-alerts?orgId=1&${p.path}&theme=dark`;

      await SitePanel.findOneAndUpdate(
        { siteId: s.id, panelIndex: p.index },
        {
          panelId,
          siteId: s.id,
          siteName: s.name,
          panelIndex: p.index,
          title: `${p.index}. ${s.name} — ${p.title}`,
          embedUrl: defaultUrl,
          categoryTag: p.tag,
          refreshInterval: '5s',
          theme: 'dark',
          updatedBy: 'System Auto-Seed'
        },
        { upsert: true, new: true }
      );
      panelsCount++;
    }
  }
  console.log(`✅ Upserted ${panelsCount} Panels across all sites.`);

  console.log('🎫 Seeding unified Salesforce Tickets schema into MongoDB Atlas...');
  let ticketsCount = 0;
  // Seed ticket records for May 2025 across all sites
  for (const s of ALL_ENTERPRISE_SITES) {
    const siteHash = s.name.length + s.id.length;

    for (let day = 1; day <= 31; day++) {
      const dateStr = `2025-05-${String(day).padStart(2, '0')}`;

      // SEV 1 Critical Ticket (Forces Red)
      if ((day + siteHash) % 11 === 0 || day === 15) {
        const ticketId = `INC-${s.code}-10${String(day).padStart(2, '0')}`;
        await SalesforceTicket.findOneAndUpdate(
          { ticketId },
          {
            ticketId,
            siteId: s.id,
            siteName: s.name,
            category: s.category,
            severity: 'SEV1',
            receivedDate: dateStr,
            receivedTime: '08:15 AM EDT',
            serviceComponent: 'Platform',
            status: 'IN_PROGRESS',
            subject: `${s.name} — Primary Inbound Sorter Matrix Motor Inverter Tripped`,
            description: `Critical inverter fault in Zone 4B at ${s.name}. Motor drive thermal limiter tripped. Sorter line halted.`,
            assignee: { name: 'Marcus Vance', role: 'Lead Automation Engineer', email: 'mvance@greyorange.com' },
            mttrMinutes: 38,
            rootCause: 'Motor inverter thermal overload'
          },
          { upsert: true, new: true }
        );
        ticketsCount++;
      }
      // SEV 2 Major Tickets (Forces Amber)
      else if ((day + siteHash) % 5 === 0 || day === 7 || day === 23) {
        for (let tNum = 1; tNum <= 2; tNum++) {
          const ticketId = `INC-${s.code}-20${String(day).padStart(2, '0')}-${tNum}`;
          await SalesforceTicket.findOneAndUpdate(
            { ticketId },
            {
              ticketId,
              siteId: s.id,
              siteName: s.name,
              category: s.category,
              severity: 'SEV2',
              receivedDate: dateStr,
              receivedTime: tNum === 1 ? '09:02 AM EDT' : '11:45 AM EDT',
              serviceComponent: tNum === 1 ? 'Butler' : 'Logs',
              status: 'OPEN',
              subject: `${s.name} — Haiport Station #${tNum} Turntable Mechanical Backlash`,
              description: `Ranger AGV unable to negotiate tote handoff at Port ${tNum} in ${s.name}. Optical alignment sensor obscured.`,
              assignee: { name: 'Sarah Chen', role: 'Robotics Technician', email: 'schen@greyorange.com' },
              mttrMinutes: 52,
              rootCause: 'Optical proximity occlusion'
            },
            { upsert: true, new: true }
          );
          ticketsCount++;
        }
      }
      // SEV 3 Minor Ticket (Forces Blue)
      else if ((day + siteHash) % 3 === 0 || day === 2 || day === 19) {
        const ticketId = `INC-${s.code}-30${String(day).padStart(2, '0')}`;
        await SalesforceTicket.findOneAndUpdate(
          { ticketId },
          {
            ticketId,
            siteId: s.id,
            siteName: s.name,
            category: s.category,
            severity: 'SEV3',
            receivedDate: dateStr,
            receivedTime: '10:12 AM EDT',
            serviceComponent: 'Bridge',
            status: 'RESOLVED',
            subject: `${s.name} — Barcode Scanner Chute 12 Lens Deflection`,
            description: `Lens deflection causing occasional no-read on Chute 12 in ${s.name}. Calibrated and confirmed.`,
            assignee: { name: 'Elena Rostova', role: 'Hardware QA', email: 'erostova@greyorange.com' },
            mttrMinutes: 20,
            rootCause: 'Vibration loosening scanner mount'
          },
          { upsert: true, new: true }
        );
        ticketsCount++;
      }
    }
  }

  console.log(`✅ Upserted ${ticketsCount} Salesforce tickets across May 2025.`);
  return { sitesCount, panelsCount, ticketsCount };
}

export async function ensureDatabaseSeeded(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    // Clean any legacy Click&Collect names in MongoDB Atlas
    await Site.updateMany({ name: /Click&Collect-1\b/i }, { $set: { name: 'Santiago Hub' } });
    await Site.updateMany({ name: /Click&Collect-2 Florida\b/i }, { $set: { name: 'Florida' } });
    await Site.updateMany({ name: /Click&Collect-3 Condes\b/i }, { $set: { name: 'Las Condes' } });
    await Site.updateMany({ name: /Click&Collect-4 Maipu\b/i }, { $set: { name: 'Maipu' } });
    await Site.updateMany({ name: /Click&Collect-5 Puerto Monte\b/i }, { $set: { name: 'Puerto Montt' } });
    await Site.updateMany({ name: /Click&Collect-7 Tumaco\b/i }, { $set: { name: 'Tumaco' } });
    await Site.updateMany({ name: /Click&Collect-8 Talca\b/i }, { $set: { name: 'Talca' } });
    await Site.updateMany({ name: /Click&Collect-9 biobio\b/i }, { $set: { name: 'Biobio' } });

    const existingSites = await Site.countDocuments();
    const sampleSite = await Site.findOne({ siteId: 'rtp_sams_atl' });
    
    // If fewer than 80 sites or sample site doesn't have vmIps populated yet, seed the data!
    if (existingSites < 80 || !sampleSite || !sampleSite.vmIps || sampleSite.vmIps.length === 0) {
      console.log(`ℹ️ MongoDB Atlas needs site intelligence synchronization. Seeding database...`);
      await seedAllSitesAndPanels();
    } else {
      console.log(`✅ MongoDB Atlas verified with ${existingSites} enterprise sites and complete Site Notes.`);
    }
  } catch (err: any) {
    console.warn(`⚠️ Seed check skipped or timed out (${err.message}). Using local cache fallback.`);
  }
}

if (require.main === module) {
  seedAllSitesAndPanels()
    .then(res => {
      console.log('🎉 Seeding Complete:', res);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Seeding Error:', err);
      process.exit(1);
    });
}

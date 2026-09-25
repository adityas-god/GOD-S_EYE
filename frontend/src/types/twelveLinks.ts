export type DashboardLinkKey = 
  | 'butler' 
  | 'bridge' 
  | 'elastic' 
  | 'platform' 
  | 'influx' 
  | 'logs' 
  | 'UPH' 
  | 'PPR' 
  | 'R2R' 
  | 'KPI' 
  | 'DISK' 
  | 'MEM';

export interface DashboardLinkItem {
  key: DashboardLinkKey;
  type: 'service' | 'metric';
  index: number;
  label: string;
  category: string;
  title: string;
  embedUrl: string;
  refreshInterval: string;
}

export const DEFAULT_12_LINKS: Record<DashboardLinkKey, { title: string; category: string; type: 'service' | 'metric'; index: number; path: string }> = {
  // 6 Services
  butler: {
    title: 'Butler — Fleet Orchestration & AGV Scheduler',
    category: 'Fleet Orchestration',
    type: 'service',
    index: 1,
    path: 'panelId=1'
  },
  bridge: {
    title: 'Bridge — Hardware Gateway & PLC Interface',
    category: 'Hardware Gateway',
    type: 'service',
    index: 2,
    path: 'panelId=2'
  },
  elastic: {
    title: 'Elastic — Log & Search Cluster Indexing',
    category: 'Log & Search Cluster',
    type: 'service',
    index: 3,
    path: 'panelId=3'
  },
  platform: {
    title: 'Platform — Core GreyMatter OS Transaction Engine',
    category: 'Core GreyMatter OS',
    type: 'service',
    index: 4,
    path: 'panelId=4'
  },
  influx: {
    title: 'Influx — Time-Series Vibration & Current Telemetry',
    category: 'Time-Series DB',
    type: 'service',
    index: 5,
    path: 'panelId=5'
  },
  logs: {
    title: 'Logs / Stream — Kafka Telemetry & Event Pipeline',
    category: 'Diagnostic Pipeline',
    type: 'service',
    index: 6,
    path: 'panelId=6'
  },

  // 6 Telemetry Metrics
  UPH: {
    title: 'UPH — Units Per Hour Throughput Telemetry',
    category: 'Throughput',
    type: 'metric',
    index: 7,
    path: 'panelId=7'
  },
  PPR: {
    title: 'PPR — Pick & Put Station Rate Index',
    category: 'Productivity',
    type: 'metric',
    index: 8,
    path: 'panelId=8'
  },
  R2R: {
    title: 'R2R — Rack-to-Robot Transit & Cycle Time',
    category: 'Robotics',
    type: 'metric',
    index: 9,
    path: 'panelId=9'
  },
  KPI: {
    title: 'KPI — Operational SLA & Fulfillment Health',
    category: 'SLA Target',
    type: 'metric',
    index: 10,
    path: 'panelId=10'
  },
  DISK: {
    title: 'DISK — Storage I/O Volume & Capacity Pool',
    category: 'Infrastructure',
    type: 'metric',
    index: 11,
    path: 'panelId=11'
  },
  MEM: {
    title: 'MEM — Memory Buffer Allocation & GC Metrics',
    category: 'Infrastructure',
    type: 'metric',
    index: 12,
    path: 'panelId=12'
  }
};

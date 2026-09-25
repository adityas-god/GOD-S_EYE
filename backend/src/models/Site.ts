import mongoose, { Schema, Document } from 'mongoose';

export type SiteCategory = 'RTP_TTP' | 'RMS' | 'RA' | 'RIL' | 'CASE_PICK';

export interface IVmIp {
  id: string;
  hostname: string;
  ip: string;
  role: string;
  status: 'ONLINE' | 'STANDBY' | 'MAINTENANCE' | 'DEGRADED';
  specs?: string;
}

export interface IDashboardLink {
  id: string;
  title: string;
  url: string;
  category: string;
  description?: string;
}

export interface ICemInfo {
  name: string;
  email: string;
  phone: string;
  slack: string;
}

export interface IRecentDeployment {
  version: string;
  deployedAt: string;
  deployedBy: string;
  commitHash: string;
  environment: string;
  notes: string;
}

export interface IAlertItem {
  id: string;
  alertKey: string;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  subsystem: string;
  sourceComponent: string;
  status: 'FIRING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SILENCED';
  timestamp: string;
  value: string;
  metricValue?: string;
  threshold?: string;
  description: string;
  remediation?: string;
  acknowledgedBy?: string;
  runbookUrl?: string;
}

export interface ISite extends Document {
  siteId: string;
  code: string;
  name: string;
  category: SiteCategory;
  categoryLabel: string;
  region: string;
  timezone: string;
  isActive: boolean;
  
  // Site Intelligence & Integrations
  slackChannelName: string;
  slackChannelUrl: string;
  warRoomUrl: string;
  warRoomName: string;
  warRoomMeetingId?: string;
  warRoomPasscode?: string;
  cem: ICemInfo;
  recentDeployment: IRecentDeployment;
  vmIps: IVmIp[];
  dashboardLinks: IDashboardLink[];
  siteNotes: string;
  alerts: IAlertItem[];

  createdAt: Date;
  updatedAt: Date;
}

const VmIpSchema = new Schema(
  {
    id: { type: String, required: true },
    hostname: { type: String, required: true },
    ip: { type: String, required: true },
    role: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['ONLINE', 'STANDBY', 'MAINTENANCE', 'DEGRADED'], 
      default: 'ONLINE' 
    },
    specs: { type: String, default: 'Ubuntu 22.04 LTS (8 vCPU, 32GB RAM)' }
  },
  { _id: false }
);

const DashboardLinkSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
    category: { type: String, default: 'General' },
    description: { type: String, default: '' }
  },
  { _id: false }
);

const CemSchema = new Schema(
  {
    name: { type: String, default: 'Unassigned CEM' },
    email: { type: String, default: 'support@greyorange.com' },
    phone: { type: String, default: '+1 (800) 555-0199' },
    slack: { type: String, default: '@support-leads' }
  },
  { _id: false }
);

const RecentDeploymentSchema = new Schema(
  {
    version: { type: String, default: 'v4.19.0' },
    deployedAt: { type: String, default: '2026-09-10 14:00 UTC' },
    deployedBy: { type: String, default: 'DevOps Automation' },
    commitHash: { type: String, default: 'a1b2c3d' },
    environment: { type: String, default: 'Production Cluster' },
    notes: { type: String, default: 'Standard scheduled release update.' }
  },
  { _id: false }
);

const AlertSchema = new Schema(
  {
    id: { type: String, required: true },
    alertKey: { type: String, required: true },
    title: { type: String, required: true },
    severity: { 
      type: String, 
      enum: ['CRITICAL', 'WARNING', 'INFO'], 
      default: 'WARNING' 
    },
    subsystem: { type: String, required: true },
    sourceComponent: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['FIRING', 'ACKNOWLEDGED', 'RESOLVED', 'SILENCED'], 
      default: 'FIRING' 
    },
    timestamp: { type: String, required: true },
    value: { type: String, default: '' },
    metricValue: { type: String, default: '' },
    threshold: { type: String, default: '' },
    description: { type: String, default: '' },
    remediation: { type: String, default: '' },
    acknowledgedBy: { type: String, default: '' },
    runbookUrl: { type: String, default: '' }
  },
  { _id: false }
);

const SiteSchema: Schema = new Schema(
  {
    siteId: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, index: true },
    name: { type: String, required: true, index: true },
    category: { 
      type: String, 
      required: true, 
      enum: ['RTP_TTP', 'RMS', 'RA', 'RIL', 'CASE_PICK'],
      index: true 
    },
    categoryLabel: { type: String, required: true },
    region: { type: String, default: 'Global' },
    timezone: { type: String, default: 'America/New_York' },
    isActive: { type: Boolean, default: true },

    // Slack Integration
    slackChannelName: { type: String, default: '#ops-general' },
    slackChannelUrl: { type: String, default: 'https://slack.com' },

    // War Room / Zoom Bridge Integration
    warRoomUrl: { type: String, default: 'https://zoom.us' },
    warRoomName: { type: String, default: 'Incident War Room' },
    warRoomMeetingId: { type: String, default: '' },
    warRoomPasscode: { type: String, default: '' },

    // CEM Info
    cem: { type: CemSchema, default: () => ({}) },

    // Recent Deployment
    recentDeployment: { type: RecentDeploymentSchema, default: () => ({}) },

    // VM IPs list
    vmIps: { type: [VmIpSchema], default: [] },

    // Dashboard Links
    dashboardLinks: { type: [DashboardLinkSchema], default: [] },

    // Site Notes
    siteNotes: { type: String, default: '' },

    // Alert Pool
    alerts: { type: [AlertSchema], default: [] }
  },
  {
    timestamps: true,
    collection: 'sites'
  }
);

export const Site: any = mongoose.models.Site || mongoose.model<ISite>('Site', SiteSchema);

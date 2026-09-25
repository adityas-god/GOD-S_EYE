import mongoose, { Schema, Document } from 'mongoose';

export interface ISitePanel extends Document {
  panelId: string; // e.g. "panel_rtp_sams_atl_1"
  siteId: string; // e.g. "rtp_sams_atl"
  siteName: string;
  panelIndex: number; // 1 to 12
  title: string;
  embedUrl: string;
  categoryTag: string; // e.g. "Throughput", "Fleet", "Sorter", "Infrastructure"
  refreshInterval: string;
  theme: 'dark' | 'light';
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const SitePanelSchema: Schema = new Schema(
  {
    panelId: { type: String, required: true, unique: true, index: true },
    siteId: { type: String, required: true, index: true },
    siteName: { type: String, required: true },
    panelIndex: { type: Number, required: true, min: 1, max: 12, index: true },
    title: { type: String, required: true },
    embedUrl: { type: String, required: true },
    categoryTag: { type: String, default: 'Telemetry' },
    refreshInterval: { type: String, default: '5s' },
    theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
    updatedBy: { type: String, default: 'Admin' }
  },
  {
    timestamps: true,
    collection: 'site_panels'
  }
);

// Ensure unique panelIndex per site
SitePanelSchema.index({ siteId: 1, panelIndex: 1 }, { unique: true });

export const SitePanel = mongoose.models.SitePanel || mongoose.model<ISitePanel>('SitePanel', SitePanelSchema);

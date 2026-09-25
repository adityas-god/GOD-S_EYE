import mongoose, { Schema, Document } from 'mongoose';

export type TicketSeverity = 'SEV1' | 'SEV2' | 'SEV3';
export type ServiceComponent = 'Butler' | 'Bridge' | 'Elastic' | 'Platform' | 'Influx' | 'Logs';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface ISalesforceTicket extends Document {
  ticketId: string; // e.g. "INC-SAM-ATL-90101"
  siteId: string; // e.g. "rtp_sams_atl"
  siteName: string;
  category: 'RTP_TTP' | 'RMS' | 'RA' | 'RIL' | 'CASE_PICK';
  severity: TicketSeverity;
  receivedDate: string; // "YYYY-MM-DD" e.g. "2025-05-15"
  receivedTime: string; // e.g. "08:15 AM EDT"
  serviceComponent: ServiceComponent;
  status: TicketStatus;
  subject: string;
  description: string;
  assignee: {
    name: string;
    role: string;
    email: string;
  };
  mttrMinutes?: number;
  rootCause?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SalesforceTicketSchema: Schema = new Schema(
  {
    ticketId: { type: String, required: true, unique: true, index: true },
    siteId: { type: String, required: true, index: true },
    siteName: { type: String, required: true },
    category: { type: String, required: true, index: true },
    severity: { 
      type: String, 
      required: true, 
      enum: ['SEV1', 'SEV2', 'SEV3'],
      index: true 
    },
    receivedDate: { type: String, required: true, index: true }, // "YYYY-MM-DD"
    receivedTime: { type: String, default: '09:00 AM EDT' },
    serviceComponent: { 
      type: String, 
      required: true, 
      enum: ['Butler', 'Bridge', 'Elastic', 'Platform', 'Influx', 'Logs'],
      index: true 
    },
    status: { 
      type: String, 
      required: true, 
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true 
    },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    assignee: {
      name: { type: String, default: 'Automation Specialist' },
      role: { type: String, default: 'Robotics Technician' },
      email: { type: String, default: 'ops@greyorange.com' }
    },
    mttrMinutes: { type: Number, default: 45 },
    rootCause: { type: String, default: 'Sensor misalignment / Overcurrent' }
  },
  {
    timestamps: true,
    collection: 'salesforce_tickets'
  }
);

// Compound index for high performance calendar and trend queries
SalesforceTicketSchema.index({ siteId: 1, receivedDate: 1 });
SalesforceTicketSchema.index({ siteId: 1, severity: 1 });

export const SalesforceTicket: any = mongoose.models.SalesforceTicket || mongoose.model<ISalesforceTicket>('SalesforceTicket', SalesforceTicketSchema);

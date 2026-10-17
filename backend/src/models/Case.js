import mongoose from 'mongoose';
import { isDbConnected } from '../config/db.js';

const caseSchema = new mongoose.Schema(
  {
    case_id: { type: String, required: true, unique: true, index: true },
    case_number: { type: String, required: true, index: true },
    subject: { type: String, default: null },
    status: { type: String, required: true, index: true },
    description: { type: String, default: null },
    account_id: { type: String, default: null, index: true },
    account_name: { type: String, default: null, index: true },
    site_name: { type: String, default: null, index: true },
    customer_location: { type: String, default: null },
    is_site_down: { type: Boolean, default: false },
    created_date: { type: Date, default: null },
    last_modified_date: { type: Date, default: null },
    closed_date: { type: Date, default: null },
    end_time: { type: Date, default: null },
    raw_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  }
);

export const CaseModel = mongoose.models.Case || mongoose.model('Case', caseSchema);

// In-memory fallback repository
const inMemoryCases = new Map();

export const CaseRepository = {
  async upsert(caseData) {
    if (isDbConnected()) {
      return CaseModel.findOneAndUpdate(
        { case_id: caseData.case_id },
        { $set: caseData },
        { upsert: true, new: true }
      ).lean();
    }
    const existing = inMemoryCases.get(caseData.case_id) || {};
    const updated = { ...existing, ...caseData };
    inMemoryCases.set(caseData.case_id, updated);
    return updated;
  },

  async bulkUpsert(casesList) {
    const results = [];
    for (const c of casesList) {
      const res = await this.upsert(c);
      results.push(res);
    }
    return results;
  },

  /**
   * Find open cases that are NOT on hold for a specific site or account.
   */
  async findOpenCasesForSite({ siteName, accountId, siteAliases = [] }) {
    const notAllowedStatuses = ['Closed', 'On Hold', 'closed', 'on hold', 'Resolved', 'resolved'];

    if (isDbConnected()) {
      const filter = {
        status: { $nin: notAllowedStatuses },
        closed_date: { $in: [null, undefined] },
        end_time: { $in: [null, undefined] },
        $or: [],
      };

      if (accountId) {
        filter.$or.push({ account_id: accountId });
      }

      if (siteName) {
        const regex = new RegExp(siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or.push(
          { site_name: regex },
          { account_name: regex },
          { customer_location: regex }
        );
      }

      for (const alias of siteAliases) {
        if (!alias) continue;
        const aliasRegex = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or.push({ site_name: aliasRegex }, { account_name: aliasRegex });
      }

      if (filter.$or.length === 0) {
        delete filter.$or;
      }

      return CaseModel.find(filter).sort({ last_modified_date: -1 }).lean();
    }

    // In-memory filter
    const matches = [];
    const lowerSite = (siteName || '').toLowerCase();
    const lowerAliases = siteAliases.map(a => (a || '').toLowerCase()).filter(Boolean);

    for (const c of inMemoryCases.values()) {
      if (notAllowedStatuses.includes(c.status)) continue;
      // Exclude tickets with end time, closed date, or downtime > 0
      const hasEnd =
        c.end_time ||
        c.closed_date ||
        c.End_Time__c ||
        c.ClosedDate ||
        c.End_Time_of_Incident__c ||
        c.end_time_of_incident ||
        c.Actual_End_Time__c ||
        c.actual_end_time ||
        (c.Downtime__c !== undefined && c.Downtime__c !== null && Number(c.Downtime__c) > 0) ||
        (c.downtime !== undefined && c.downtime !== null && Number(c.downtime) > 0);
      if (hasEnd) continue;

      let matched = false;
      if (accountId && c.account_id === accountId) matched = true;

      if (!matched && lowerSite) {
        const cSite = (c.site_name || '').toLowerCase();
        const cAcc = (c.account_name || '').toLowerCase();
        const cLoc = (c.customer_location || '').toLowerCase();
        if (cSite.includes(lowerSite) || cAcc.includes(lowerSite) || cLoc.includes(lowerSite)) {
          matched = true;
        }
      }

      if (!matched && lowerAliases.length > 0) {
        const cSite = (c.site_name || '').toLowerCase();
        const cAcc = (c.account_name || '').toLowerCase();
        for (const alias of lowerAliases) {
          if (cSite.includes(alias) || cAcc.includes(alias)) {
            matched = true;
            break;
          }
        }
      }

      if (matched || (!siteName && !accountId)) {
        matches.push(c);
      }
    }

    return matches.sort((a, b) => new Date(b.last_modified_date || 0) - new Date(a.last_modified_date || 0));
  },

  async findAllOpenCases() {
    const notAllowedStatuses = ['Closed', 'On Hold', 'closed', 'on hold', 'Resolved', 'resolved'];
    if (isDbConnected()) {
      return CaseModel.find({
        status: { $nin: notAllowedStatuses },
        closed_date: { $in: [null, undefined] },
        end_time: { $in: [null, undefined] },
      })
        .sort({ last_modified_date: -1 })
        .limit(100)
        .lean();
    }
    return Array.from(inMemoryCases.values())
      .filter(c => {
        if (notAllowedStatuses.includes(c.status)) return false;
        const hasEnd =
          c.end_time ||
          c.closed_date ||
          c.End_Time__c ||
          c.ClosedDate ||
          c.End_Time_of_Incident__c ||
          c.end_time_of_incident ||
          c.Actual_End_Time__c ||
          c.actual_end_time ||
          (c.Downtime__c !== undefined && c.Downtime__c !== null && Number(c.Downtime__c) > 0) ||
          (c.downtime !== undefined && c.downtime !== null && Number(c.downtime) > 0);
        return !hasEnd;
      })
      .sort((a, b) => new Date(b.last_modified_date || 0) - new Date(a.last_modified_date || 0));
  },
};

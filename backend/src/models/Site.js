import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDbConnected } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const siteSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    product_line: { type: String, default: null },
    opsgenie_tag: { type: String, default: null },
    salesforce_account_id: { type: String, default: null, index: true },
    salesforce_site_name: { type: String, default: null },
    account_name: { type: String, default: null },
    location: { type: String, default: null },
    position: { type: Number, default: 0 },
    open_cases_count: { type: Number, default: 0 },
    is_down: { type: Boolean, default: false },
    source: { type: String, default: 'salesforce' },
    last_synced_at: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const SiteModel = mongoose.models.Site || mongoose.model('Site', siteSchema);

import { defaultSites } from '../data/defaultSites.js';

// In-memory fallback repository when MongoDB server is not actively connected
const inMemorySites = new Map();

function loadAuthoritativeSitesSnapshot() {
  const candidatePaths = [
    path.resolve(__dirname, '../data/sites.json'),
    path.resolve(__dirname, '../../../Frontend/src/data/sites.json'),
    path.resolve(process.cwd(), 'src/data/sites.json'),
    path.resolve(process.cwd(), '../Frontend/src/data/sites.json'),
  ];

  for (const jsonPath of candidatePaths) {
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        const sites = JSON.parse(raw);
        if (Array.isArray(sites) && sites.length > 0) {
          // Keep local backend copy in sync if possible
          const backendDataPath = path.resolve(__dirname, '../data/sites.json');
          if (!fs.existsSync(backendDataPath)) {
            try {
              const dir = path.dirname(backendDataPath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(backendDataPath, raw, 'utf8');
            } catch {}
          }
          return sites;
        }
      } catch {}
    }
  }
  return defaultSites;
}

try {
  const sites = loadAuthoritativeSitesSnapshot();
  for (const s of sites) {
    const id = `sf-site-${String(s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    inMemorySites.set(id, {
      id,
      name: s.name,
      product_line: s.product_line || null,
      opsgenie_tag: s.opsgenie_tag || null,
      salesforce_account_id: s.salesforce_account_id || null,
      salesforce_site_name: s.name,
      account_name: s.name,
      position: s.position,
      open_cases_count: 0,
      is_down: false,
      source: 'authoritative_snapshot',
      last_synced_at: new Date(),
    });
  }
} catch {
  // Graceful fallback
}

export const SiteRepository = {
  async findAll() {
    let sites = [];
    if (isDbConnected()) {
      sites = await SiteModel.find().sort({ position: 1, name: 1 }).lean();
      if (sites.length < inMemorySites.size) {
        const dbSiteKeys = new Set(sites.map(s => (s.name || '').trim().toLowerCase()));
        for (const [id, memSite] of inMemorySites.entries()) {
          const key = (memSite.name || '').trim().toLowerCase();
          if (!dbSiteKeys.has(key)) {
            sites.push(memSite);
          }
        }
      }
    } else {
      sites = Array.from(inMemorySites.values()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }

    const seen = new Map();
    const duplicateIdsToDelete = [];

    for (const site of sites) {
      if (!site || !site.name) continue;
      const key = site.name.trim().toLowerCase();
      // Ensure salesforce_account_id is always synced from authoritative snapshot
      for (const memSite of inMemorySites.values()) {
        if (memSite.name.trim().toLowerCase() === key && memSite.salesforce_account_id) {
          site.salesforce_account_id = memSite.salesforce_account_id;
          break;
        }
      }

      if (!seen.has(key)) {
        seen.set(key, site);
      } else {
        const existing = seen.get(key);
        // Track duplicate MongoDB record to clean it up permanently
        if (site._id) {
          duplicateIdsToDelete.push(site._id);
        }
        // Preserve richest metadata
        if (!existing.salesforce_account_id && site.salesforce_account_id) {
          existing.salesforce_account_id = site.salesforce_account_id;
        }
        if ((site.open_cases_count ?? 0) > (existing.open_cases_count ?? 0)) {
          existing.open_cases_count = site.open_cases_count;
        }
        if (site.product_line && !existing.product_line) {
          existing.product_line = site.product_line;
        }
        if (site.location && !existing.location) {
          existing.location = site.location;
        }
      }
    }

    // Automatically purge duplicate records from MongoDB
    if (isDbConnected() && duplicateIdsToDelete.length > 0) {
      SiteModel.deleteMany({ _id: { $in: duplicateIdsToDelete } })
        .then(res => {
          console.log(`[SiteRepository] Purged ${res.deletedCount} duplicate site records from MongoDB.`);
        })
        .catch(err => {
          console.warn(`[SiteRepository] Deduplication purge notice: ${err.message}`);
        });
    }

    return Array.from(seen.values());
  },

  async findById(id) {
    if (isDbConnected()) {
      return SiteModel.findOne({ id }).lean();
    }
    return inMemorySites.get(id) || null;
  },

  async findByName(name) {
    const clean = String(name || '').trim();
    if (isDbConnected()) {
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return SiteModel.findOne({ name: new RegExp(`^${escaped}$`, 'i') }).lean();
    }
    const lower = clean.toLowerCase();
    for (const site of inMemorySites.values()) {
      if (site.name.trim().toLowerCase() === lower) return site;
    }
    return null;
  },

  async upsert(siteData) {
    if (!siteData || !siteData.name) return null;
    const cleanName = siteData.name.trim();
    const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (isDbConnected()) {
      // Check if site already exists by ID or by case-insensitive name
      const existing = await SiteModel.findOne({
        $or: [
          { id: siteData.id },
          { name: new RegExp(`^${escapedName}$`, 'i') },
        ],
      });

      if (existing) {
        Object.assign(existing, siteData, {
          name: cleanName,
          last_synced_at: new Date(),
        });
        return existing.save();
      }

      return SiteModel.create({
        ...siteData,
        name: cleanName,
        last_synced_at: new Date(),
      });
    }

    const key = cleanName.toLowerCase();
    let targetId = siteData.id;
    for (const [id, s] of inMemorySites.entries()) {
      if (id === siteData.id || s.name.trim().toLowerCase() === key) {
        targetId = id;
        break;
      }
    }
    const existing = inMemorySites.get(targetId) || {};
    const updated = { ...existing, ...siteData, name: cleanName, id: targetId, last_synced_at: new Date() };
    inMemorySites.set(targetId, updated);
    return updated;
  },

  async bulkUpsert(sitesList) {
    const results = [];
    for (const s of sitesList) {
      const res = await this.upsert(s);
      results.push(res);
    }
    return results;
  },

  async replaceAll(sitesList) {
    inMemorySites.clear();
    for (const s of sitesList) {
      inMemorySites.set(s.id, s);
    }

    if (isDbConnected()) {
      try {
        await SiteModel.deleteMany({});
        if (sitesList && sitesList.length > 0) {
          await SiteModel.insertMany(sitesList, { ordered: false });
        }
      } catch (err) {
        console.warn(`[SiteRepository] replaceAll notice: ${err.message}. Ensuring all sites via upsert.`);
        for (const s of sitesList) {
          try {
            await this.upsert(s);
          } catch {}
        }
      }
      return SiteModel.find().sort({ position: 1, name: 1 }).lean();
    }
    return sitesList;
  },

  async count() {
    if (isDbConnected()) {
      return SiteModel.countDocuments();
    }
    return inMemorySites.size;
  },

  async updateOpenCasesCount(siteIdentifier, count, isDown = false) {
    if (isDbConnected()) {
      await SiteModel.updateOne(
        {
          $or: [
            { id: siteIdentifier },
            { name: siteIdentifier },
            { salesforce_account_id: siteIdentifier },
            { salesforce_site_name: siteIdentifier },
          ],
        },
        { $set: { open_cases_count: count, is_down: isDown, last_synced_at: new Date() } }
      );
    } else {
      for (const [id, site] of inMemorySites.entries()) {
        if (
          site.id === siteIdentifier ||
          site.name === siteIdentifier ||
          site.salesforce_account_id === siteIdentifier ||
          site.salesforce_site_name === siteIdentifier
        ) {
          site.open_cases_count = count;
          site.is_down = isDown;
          site.last_synced_at = new Date();
          inMemorySites.set(id, site);
          break;
        }
      }
    }
  },
};

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
    // 1️⃣ MONITORING LINKS (Table format, editable)
    monitoring_links: [
      {
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        title: { type: String, required: true },
        url: { type: String, required: true },
        category: { type: String, default: 'General' },
        updated_at: { type: Date, default: Date.now },
      },
    ],
    // 2️⃣ ZOOM CALL (Live bridge or "No call in progress")
    zoom_call: {
      url: { type: String, default: null },
      topic: { type: String, default: null },
      is_active: { type: Boolean, default: false },
      last_started_at: { type: Date, default: null },
    },
    // 3️⃣ VM IP LIST (Table format, editable)
    vm_ips: [
      {
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        title: { type: String, required: true },
        ip_address: { type: String, required: true },
        role: { type: String, default: 'Node' },
        ssh_command: { type: String, default: null },
        notes: { type: String, default: null },
      },
    ],
    // 4️⃣ SLACK CHANNEL (Direct deep-link)
    slack: {
      channel_name: { type: String, default: null },
      channel_url: { type: String, default: null },
      is_configured: { type: Boolean, default: false },
    },
    // 5️⃣ SITE HANDOVERS & RECENT DEPLOYMENTS
    deployments: [
      {
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        version: { type: String, required: true },
        deployed_at: { type: Date, default: Date.now },
        deployed_by: { type: String, default: 'DevOps' },
        status: { type: String, default: 'Success' },
        notes: { type: String, default: null },
      },
    ],
    handovers: [
      {
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        created_at: { type: Date, default: Date.now },
        author: { type: String, default: 'Shift Lead' },
        shift: { type: String, default: 'Morning' },
        commands_used: { type: String, default: '' },
        what_is_working: { type: String, default: '' },
        open_questions: { type: String, default: '' },
        cautions: { type: String, default: '' },
      },
    ],
    // 6️⃣ SITE CONFIGS (Timestamped History Log)
    site_configs: [
      {
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        config_key: { type: String, required: true },
        config_value: { type: String, required: true },
        created_at: { type: Date, default: Date.now },
        updated_by: { type: String, default: 'Admin' },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        notes: { type: String, default: null },
      },
    ],
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
    if (!id) return null;
    const cleanId = String(id).trim();
    if (isDbConnected()) {
      let doc = await SiteModel.findOne({ id: cleanId }).lean();
      if (!doc) {
        // Fallback to name or slug match
        doc = await SiteModel.findOne({
          $or: [
            { name: new RegExp(`^${cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { salesforce_site_name: new RegExp(`^${cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          ],
        }).lean();
      }
      return doc ? normalizeRunbook(doc) : null;
    }

    let site = inMemorySites.get(cleanId);
    if (!site) {
      const lower = cleanId.toLowerCase();
      for (const s of inMemorySites.values()) {
        if (s.id.toLowerCase() === lower || s.name.trim().toLowerCase() === lower) {
          site = s;
          break;
        }
      }
    }
    return site ? normalizeRunbook(site) : null;
  },

  async findByName(name) {
    if (!name) return null;
    const clean = String(name).trim();
    if (isDbConnected()) {
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const doc = await SiteModel.findOne({ name: new RegExp(`^${escaped}$`, 'i') }).lean();
      return doc ? normalizeRunbook(doc) : null;
    }
    const lower = clean.toLowerCase();
    for (const site of inMemorySites.values()) {
      if (site.name.trim().toLowerCase() === lower) return normalizeRunbook(site);
    }
    return null;
  },

  async upsert(siteData) {
    if (!siteData || !siteData.name) return null;
    const cleanName = siteData.name.trim();
    const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (isDbConnected()) {
      // Find existing by ID or name
      const existing = await SiteModel.findOne({
        $or: [
          { id: siteData.id },
          { name: new RegExp(`^${escapedName}$`, 'i') },
        ],
      });

      if (existing) {
        // Non-destructive update: ONLY update base metadata, NEVER wipe runbook arrays!
        existing.name = cleanName;
        if (siteData.product_line !== undefined) existing.product_line = siteData.product_line;
        if (siteData.salesforce_account_id !== undefined) existing.salesforce_account_id = siteData.salesforce_account_id;
        if (siteData.salesforce_site_name !== undefined) existing.salesforce_site_name = siteData.salesforce_site_name;
        if (siteData.account_name !== undefined) existing.account_name = siteData.account_name;
        if (siteData.opsgenie_tag !== undefined) existing.opsgenie_tag = siteData.opsgenie_tag;
        if (siteData.position !== undefined) existing.position = siteData.position;
        if (siteData.location !== undefined) existing.location = siteData.location;
        existing.last_synced_at = new Date();
        const saved = await existing.save();
        return normalizeRunbook(saved.toObject ? saved.toObject() : saved);
      }

      const created = await SiteModel.create({
        ...siteData,
        name: cleanName,
        monitoring_links: siteData.monitoring_links || [],
        zoom_call: siteData.zoom_call || { url: null, topic: null, is_active: false, last_started_at: null },
        vm_ips: siteData.vm_ips || [],
        slack: siteData.slack || { channel_name: null, channel_url: null, is_configured: false },
        deployments: siteData.deployments || [],
        handovers: siteData.handovers || [],
        site_configs: siteData.site_configs || [],
        last_synced_at: new Date(),
      });
      return normalizeRunbook(created.toObject ? created.toObject() : created);
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
    const updated = {
      ...existing,
      ...siteData,
      name: cleanName,
      id: targetId,
      // Preserve existing runbooks in memory
      monitoring_links: existing.monitoring_links || siteData.monitoring_links || [],
      zoom_call: existing.zoom_call || siteData.zoom_call || { url: null, topic: null, is_active: false, last_started_at: null },
      vm_ips: existing.vm_ips || siteData.vm_ips || [],
      slack: existing.slack || siteData.slack || { channel_name: null, channel_url: null, is_configured: false },
      deployments: existing.deployments || siteData.deployments || [],
      handovers: existing.handovers || siteData.handovers || [],
      site_configs: existing.site_configs || siteData.site_configs || [],
      last_synced_at: new Date(),
    };
    inMemorySites.set(targetId, updated);
    return normalizeRunbook(updated);
  },

  async bulkUpsert(sitesList) {
    const results = [];
    for (const s of sitesList) {
      const res = await this.upsert(s);
      results.push(res);
    }
    return results;
  },

  // Non-destructive replaceAll: Seeds base sites without dropping user runbook data
  async replaceAll(sitesList) {
    for (const s of sitesList) {
      await this.upsert(s);
    }
    return this.findAll();
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

  // ==========================================
  // OPERATIONAL RUNBOOK CRUD METHODS
  // ==========================================

  // 1️⃣ MONITORING LINKS
  async addMonitoringLink(siteId, link) {
    const newLink = {
      id: new mongoose.Types.ObjectId().toString(),
      title: link.title,
      url: link.url,
      category: link.category || 'General',
      updated_at: new Date(),
    };

    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $push: { monitoring_links: newLink } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site) {
      site.monitoring_links = site.monitoring_links || [];
      site.monitoring_links.push(newLink);
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },

  async updateMonitoringLink(siteId, linkId, linkUpdate) {
    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }], 'monitoring_links.id': linkId },
        {
          $set: {
            'monitoring_links.$.title': linkUpdate.title,
            'monitoring_links.$.url': linkUpdate.url,
            'monitoring_links.$.category': linkUpdate.category || 'General',
            'monitoring_links.$.updated_at': new Date(),
          },
        },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site && site.monitoring_links) {
      const idx = site.monitoring_links.findIndex(l => l.id === linkId);
      if (idx !== -1) {
        site.monitoring_links[idx] = {
          ...site.monitoring_links[idx],
          ...linkUpdate,
          updated_at: new Date(),
        };
        inMemorySites.set(site.id, site);
        return normalizeRunbook(site);
      }
    }
    return null;
  },

  async deleteMonitoringLink(siteId, linkId) {
    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $pull: { monitoring_links: { id: linkId } } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site && site.monitoring_links) {
      site.monitoring_links = site.monitoring_links.filter(l => l.id !== linkId);
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },

  // 2️⃣ ZOOM CALL
  async updateZoomCall(siteId, zoomData) {
    const update = {
      url: zoomData.url || null,
      topic: zoomData.topic || null,
      is_active: Boolean(zoomData.is_active),
      last_started_at: zoomData.is_active ? new Date() : (zoomData.last_started_at || null),
    };

    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $set: { zoom_call: update } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site) {
      site.zoom_call = update;
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },

  // 3️⃣ VM IP LIST
  async addVmIp(siteId, vm) {
    const newVm = {
      id: new mongoose.Types.ObjectId().toString(),
      title: vm.title,
      ip_address: vm.ip_address,
      role: vm.role || 'Node',
      ssh_command: vm.ssh_command || `ssh ${vm.ip_address}`,
      notes: vm.notes || null,
    };

    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $push: { vm_ips: newVm } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site) {
      site.vm_ips = site.vm_ips || [];
      site.vm_ips.push(newVm);
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },

  async updateVmIp(siteId, vmId, vmUpdate) {
    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }], 'vm_ips.id': vmId },
        {
          $set: {
            'vm_ips.$.title': vmUpdate.title,
            'vm_ips.$.ip_address': vmUpdate.ip_address,
            'vm_ips.$.role': vmUpdate.role || 'Node',
            'vm_ips.$.ssh_command': vmUpdate.ssh_command || `ssh ${vmUpdate.ip_address}`,
            'vm_ips.$.notes': vmUpdate.notes || null,
          },
        },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site && site.vm_ips) {
      const idx = site.vm_ips.findIndex(v => v.id === vmId);
      if (idx !== -1) {
        site.vm_ips[idx] = {
          ...site.vm_ips[idx],
          ...vmUpdate,
        };
        inMemorySites.set(site.id, site);
        return normalizeRunbook(site);
      }
    }
    return null;
  },

  async deleteVmIp(siteId, vmId) {
    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $pull: { vm_ips: { id: vmId } } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site && site.vm_ips) {
      site.vm_ips = site.vm_ips.filter(v => v.id !== vmId);
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },

  // 4️⃣ SLACK
  async updateSlack(siteId, slackData) {
    const update = {
      channel_name: slackData.channel_name || null,
      channel_url: slackData.channel_url || null,
      is_configured: Boolean(slackData.channel_name || slackData.channel_url),
    };

    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $set: { slack: update } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site) {
      site.slack = update;
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },

  // 5️⃣ DEPLOYMENTS & HANDOVERS
  async addDeployment(siteId, dep) {
    const newDep = {
      id: new mongoose.Types.ObjectId().toString(),
      version: dep.version,
      deployed_at: dep.deployed_at ? new Date(dep.deployed_at) : new Date(),
      deployed_by: dep.deployed_by || 'DevOps',
      status: dep.status || 'Success',
      notes: dep.notes || null,
    };

    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $push: { deployments: { $each: [newDep], $position: 0 } } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site) {
      site.deployments = site.deployments || [];
      site.deployments.unshift(newDep);
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },

  async addHandover(siteId, ho) {
    const newHo = {
      id: new mongoose.Types.ObjectId().toString(),
      created_at: new Date(),
      author: ho.author || 'Shift Lead',
      shift: ho.shift || 'Morning',
      commands_used: ho.commands_used || '',
      what_is_working: ho.what_is_working || '',
      open_questions: ho.open_questions || '',
      cautions: ho.cautions || '',
    };

    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $push: { handovers: { $each: [newHo], $position: 0 } } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site) {
      site.handovers = site.handovers || [];
      site.handovers.unshift(newHo);
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },

  // 6️⃣ SITE CONFIGS
  async addSiteConfig(siteId, cfg) {
    const newCfg = {
      id: new mongoose.Types.ObjectId().toString(),
      config_key: cfg.config_key,
      config_value: cfg.config_value,
      created_at: new Date(),
      updated_by: cfg.updated_by || 'Admin',
      metadata: cfg.metadata || {},
      notes: cfg.notes || null,
    };

    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $push: { site_configs: { $each: [newCfg], $position: 0 } } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site) {
      site.site_configs = site.site_configs || [];
      site.site_configs.unshift(newCfg);
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },

  // Batch insert site configs (Auto-parsed from multi-line env paste)
  async addSiteConfigsBatch(siteId, cfgsArray, author = 'Admin', notes = null) {
    if (!Array.isArray(cfgsArray) || cfgsArray.length === 0) {
      return this.findById(siteId);
    }

    const newConfigs = cfgsArray.map(item => ({
      id: new mongoose.Types.ObjectId().toString(),
      config_key: item.config_key,
      config_value: item.config_value,
      created_at: new Date(),
      updated_by: item.updated_by || author || 'Admin',
      metadata: item.metadata || {},
      notes: item.notes || notes || null,
    }));

    if (isDbConnected()) {
      const doc = await SiteModel.findOneAndUpdate(
        { $or: [{ id: siteId }, { name: siteId }] },
        { $push: { site_configs: { $each: newConfigs, $position: 0 } } },
        { new: true }
      ).lean();
      return doc ? normalizeRunbook(doc) : null;
    }

    const site = await this.findById(siteId);
    if (site) {
      site.site_configs = site.site_configs || [];
      site.site_configs.unshift(...newConfigs);
      inMemorySites.set(site.id, site);
      return normalizeRunbook(site);
    }
    return null;
  },
};

function normalizeRunbook(site) {
  if (!site) return null;
  return {
    ...site,
    monitoring_links: Array.isArray(site.monitoring_links) ? site.monitoring_links : [],
    zoom_call: site.zoom_call || { url: null, topic: null, is_active: false, last_started_at: null },
    vm_ips: Array.isArray(site.vm_ips) ? site.vm_ips : [],
    slack: site.slack || { channel_name: null, channel_url: null, is_configured: false },
    deployments: Array.isArray(site.deployments) ? site.deployments : [],
    handovers: Array.isArray(site.handovers) ? site.handovers : [],
    site_configs: Array.isArray(site.site_configs) ? site.site_configs : [],
  };
}

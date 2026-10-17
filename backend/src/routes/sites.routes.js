import { Router } from 'express';
import { SiteRepository } from '../models/Site.js';
import { syncSitesFromSalesforce, fetchOpenCasesForSite } from '../services/salesforce.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { defaultSites } from '../data/defaultSites.js';
import { getSfConfig } from '../services/salesforce.service.js';

let _initialSyncAttempted = false;

// Helper to seed or sync active sites from sites.json or embedded defaultSites
async function ensureInitialSites(forceSync = false) {
  if (_initialSyncAttempted && !forceSync) {
    return;
  }
  _initialSyncAttempted = true;

  try {
    const candidatePaths = [
      path.resolve(__dirname, '../data/sites.json'),
      path.resolve(__dirname, '../../../Frontend/src/data/sites.json'),
      path.resolve(process.cwd(), 'src/data/sites.json'),
      path.resolve(process.cwd(), '../Frontend/src/data/sites.json'),
    ];

    let sites = null;
    for (const jsonPath of candidatePaths) {
      if (fs.existsSync(jsonPath)) {
        try {
          const raw = fs.readFileSync(jsonPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sites = parsed;
            break;
          }
        } catch {}
      }
    }

    if (!Array.isArray(sites) || sites.length === 0) {
      sites = defaultSites;
    }

    if (Array.isArray(sites) && sites.length > 0) {
      const count = await SiteRepository.count();
      // If count is less than the authoritative active sites, or forceSync is true, reset cleanly
      if (count < sites.length || forceSync) {
        const toInsert = sites.map((s, idx) => {
          const pLines = Array.isArray(s.product_lines) && s.product_lines.length > 0
            ? s.product_lines
            : (s.product_line ? s.product_line.split(',').map(x => x.trim()).filter(Boolean) : []);
          const pLine = s.product_line || (pLines.length > 0 ? pLines.join(', ') : null);
          return {
            id: `sf-site-${String(s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
            name: s.name,
            product_line: pLine,
            product_lines: pLines,
            opsgenie_tag: s.opsgenie_tag || null,
            salesforce_account_id: s.salesforce_account_id || null,
            salesforce_site_name: s.name,
            account_name: s.name,
            position: s.position || idx + 1,
            open_cases_count: 0,
            is_down: false,
            source: 'authoritative_snapshot',
          };
        });
        await SiteRepository.replaceAll(toInsert);
        console.log(`[Sites] Seeded exactly ${toInsert.length} active sites into MongoDB repository.`);
      } else {
        // Fast batch check: avoid 77 individual round trips to remote database
        const existingSites = await SiteRepository.findAll();
        const existingKeys = new Set(existingSites.map(s => (s.name || '').trim().toLowerCase()));
        for (const s of sites) {
          if (!s || !s.name) continue;
          const key = s.name.trim().toLowerCase();
          if (!existingKeys.has(key)) {
            const id = `sf-site-${String(s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
            const pLines = Array.isArray(s.product_lines) && s.product_lines.length > 0
              ? s.product_lines
              : (s.product_line ? s.product_line.split(',').map(x => x.trim()).filter(Boolean) : []);
            const pLine = s.product_line || (pLines.length > 0 ? pLines.join(', ') : null);
            await SiteRepository.upsert({
              id,
              name: s.name,
              product_line: pLine,
              product_lines: pLines,
              opsgenie_tag: s.opsgenie_tag || null,
              salesforce_account_id: s.salesforce_account_id || null,
              salesforce_site_name: s.name,
              account_name: s.name,
              position: s.position || sites.indexOf(s) + 1,
              open_cases_count: 0,
              is_down: false,
              source: 'authoritative_snapshot',
            });
            existingKeys.add(key);
            console.log(`[Sites] Added missing site: ${s.name} (${id})`);
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[Sites] Note during active sites seed: ${err.message}`);
  }
}

/**
 * GET /api/sites
 * List all configured sites in MongoDB
 */
router.get('/', async (req, res) => {
  try {
    const forceReset = req.query.reset === 'true';
    await ensureInitialSites(forceReset);
    const sites = await SiteRepository.findAll();
    res.json({
      success: true,
      count: sites.length,
      sites,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET & POST /api/sites/sync-salesforce
 * Retrieve exact sites from GreyOrange Salesforce org database and configure them in MongoDB & sites.json
 */
async function handleSalesforceSync(req, res) {
  try {
    const authoritative = req.query.authoritative !== 'false';
    const synced = await syncSitesFromSalesforce({ authoritative });
    res.json({
      success: true,
      message: `Successfully synchronized ${synced.length} sites from GreyOrange Salesforce org database into MongoDB and sites.json.`,
      count: synced.length,
      sites: synced,
    });
  } catch (error) {
    console.error('[Salesforce Sync Error]', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

router.get('/sync-salesforce', handleSalesforceSync);
router.post('/sync-salesforce', handleSalesforceSync);


/**
 * GET /api/sites/:siteId
 * Retrieve specific site details
 */
router.get('/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    let site = await SiteRepository.findById(siteId);
    if (!site) {
      site = await SiteRepository.findByName(siteId);
    }

    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    res.json({ success: true, site });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 1️⃣ MONITORING LINKS CRUD
// ==========================================

router.post('/:siteId/links', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { title, url, category } = req.body;
    if (!title || !url) {
      return res.status(400).json({ success: false, error: 'Title and URL are required' });
    }
    const updatedSite = await SiteRepository.addMonitoringLink(siteId, { title, url, category });
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:siteId/links/:linkId', async (req, res) => {
  try {
    const { siteId, linkId } = req.params;
    const { title, url, category } = req.body;
    const updatedSite = await SiteRepository.updateMonitoringLink(siteId, linkId, { title, url, category });
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site or link not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:siteId/links/:linkId', async (req, res) => {
  try {
    const { siteId, linkId } = req.params;
    const updatedSite = await SiteRepository.deleteMonitoringLink(siteId, linkId);
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2️⃣ VM IP LIST CRUD
// ==========================================

router.post('/:siteId/vms', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { title, ip_address, role, ssh_command, notes } = req.body;
    if (!title || !ip_address) {
      return res.status(400).json({ success: false, error: 'Title and IP address are required' });
    }
    const updatedSite = await SiteRepository.addVmIp(siteId, { title, ip_address, role, ssh_command, notes });
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:siteId/vms/:vmId', async (req, res) => {
  try {
    const { siteId, vmId } = req.params;
    const { title, ip_address, role, ssh_command, notes } = req.body;
    const updatedSite = await SiteRepository.updateVmIp(siteId, vmId, { title, ip_address, role, ssh_command, notes });
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site or VM not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:siteId/vms/:vmId', async (req, res) => {
  try {
    const { siteId, vmId } = req.params;
    const updatedSite = await SiteRepository.deleteVmIp(siteId, vmId);
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3️⃣ ZOOM & SLACK CRUD
// ==========================================

router.patch('/:siteId/zoom', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { url, topic, is_active } = req.body;
    const updatedSite = await SiteRepository.updateZoomCall(siteId, { url, topic, is_active });
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:siteId/slack', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { channel_name, channel_url } = req.body;
    const updatedSite = await SiteRepository.updateSlack(siteId, { channel_name, channel_url });
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 4️⃣ DEPLOYMENTS & HANDOVERS
// ==========================================

router.post('/:siteId/deployments', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { version, deployed_by, status, notes, deployed_at } = req.body;
    if (!version) {
      return res.status(400).json({ success: false, error: 'Version is required' });
    }
    const updatedSite = await SiteRepository.addDeployment(siteId, { version, deployed_by, status, notes, deployed_at });
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:siteId/handovers', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { author, shift, commands_used, what_is_working, open_questions, cautions } = req.body;
    const updatedSite = await SiteRepository.addHandover(siteId, {
      author,
      shift,
      commands_used,
      what_is_working,
      open_questions,
      cautions,
    });
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5️⃣ SITE CONFIGS
// ==========================================

router.post('/:siteId/configs', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { config_key, config_value, updated_by, notes, metadata, configs } = req.body;

    // Support batch insertion (e.g., auto-detected .env multi-line paste)
    if (Array.isArray(configs) && configs.length > 0) {
      const updatedSite = await SiteRepository.addSiteConfigsBatch(siteId, configs, updated_by, notes);
      if (!updatedSite) {
        return res.status(404).json({ success: false, error: 'Site not found' });
      }
      return res.json({ success: true, site: updatedSite });
    }

    if (!config_key || config_value === undefined) {
      return res.status(400).json({ success: false, error: 'Config key and value are required' });
    }
    const updatedSite = await SiteRepository.addSiteConfig(siteId, {
      config_key,
      config_value,
      updated_by,
      notes,
      metadata,
    });
    if (!updatedSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site: updatedSite });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/:siteId/cases
 * Fetch all open cases that are NOT on hold for a specific site
 */
router.get('/:siteId/cases', async (req, res) => {
  try {
    const { siteId } = req.params;
    let site = await SiteRepository.findById(siteId);
    if (!site) {
      site = await SiteRepository.findByName(siteId);
    }

    const siteName = site ? site.name : siteId;
    const accountId = site ? site.salesforce_account_id : null;

    const result = await fetchOpenCasesForSite({
      siteId: site ? site.id : siteId,
      siteName,
      accountId,
    });

    res.json({
      success: true,
      site: {
        ...(site || { id: siteId, name: siteName }),
        product_line: result.product_line || site?.product_line || null,
        product_lines: result.product_lines || site?.product_lines || [],
      },
      totalOpenCases: result.totalOpenCases,
      cases: result.cases,
      alerts: result.alerts,
      closed: result.closed || [],
    });
  } catch (error) {
    console.error('[Site Cases Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

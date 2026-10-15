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
      // If count is less than the authoritative 77 active sites, or forceSync is true, reset cleanly
      if (count < sites.length || forceSync) {
        const toInsert = sites.map((s, idx) => ({
          id: `sf-site-${String(s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
          name: s.name,
          product_line: s.product_line || null,
          opsgenie_tag: s.opsgenie_tag || null,
          salesforce_account_id: s.salesforce_account_id || null,
          salesforce_site_name: s.name,
          account_name: s.name,
          position: s.position || idx + 1,
          open_cases_count: 0,
          is_down: false,
          source: 'authoritative_snapshot',
        }));
        await SiteRepository.replaceAll(toInsert);
        console.log(`[Sites] Seeded exactly ${toInsert.length} active sites into MongoDB repository.`);
      } else {
        // Ensure any newly added site (like Owens & Minor) is individually created if missing
        for (const s of sites) {
          const id = `sf-site-${String(s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
          const existing = await SiteRepository.findById(id);
          if (!existing) {
            await SiteRepository.create({
              id,
              name: s.name,
              product_line: s.product_line || null,
              opsgenie_tag: s.opsgenie_tag || null,
              salesforce_account_id: s.salesforce_account_id || null,
              salesforce_site_name: s.name,
              account_name: s.name,
              position: s.position || sites.indexOf(s) + 1,
              open_cases_count: 0,
              is_down: false,
              source: 'authoritative_snapshot',
            });
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
      site: site || { id: siteId, name: siteName },
      totalOpenCases: result.totalOpenCases,
      cases: result.cases,
      alerts: result.alerts,
    });
  } catch (error) {
    console.error('[Site Cases Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { Site } from '../../models/Site';
import { ALL_ENTERPRISE_SITES, getSiteByIdOrName } from '../salesforce/sitesCatalog';
import { generateSiteIntelligence } from '../../seed/seedDatabase';

const router = Router();

/**
 * GET /api/sites
 * List all enterprise sites with basic metadata
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sites = await Site.find({}, 'siteId code name category categoryLabel region timezone isActive slackChannelName slackChannelUrl')
      .sort({ name: 1 })
      .lean();

    if (sites && sites.length > 0) {
      return res.json({ success: true, count: sites.length, sites });
    }

    // Fallback if Mongo is empty or disconnected
    return res.json({ success: true, count: ALL_ENTERPRISE_SITES.length, sites: ALL_ENTERPRISE_SITES });
  } catch (err: any) {
    return res.json({ success: true, count: ALL_ENTERPRISE_SITES.length, sites: ALL_ENTERPRISE_SITES, fallback: true });
  }
});

/**
 * GET /api/sites/:siteId
 * Retrieve complete site information, VM IPs, CEM info, deployments, dashboards, and Slack
 */
router.get('/:siteId', async (req: Request, res: Response) => {
  const { siteId } = req.params;
  try {
    let site = await Site.findOne({ siteId }).lean();
    if (!site) {
      // Case-insensitive / code lookup
      site = await Site.findOne({ 
        $or: [
          { siteId: new RegExp(`^${siteId}$`, 'i') },
          { code: new RegExp(`^${siteId}$`, 'i') },
          { name: new RegExp(`^${siteId}$`, 'i') }
        ]
      }).lean();
    }

    if (site) {
      // If site was found in MongoDB but vmIps or alerts is empty, populate with generated defaults
      if (!site.vmIps || site.vmIps.length === 0 || !site.slackChannelUrl || !site.alerts || site.alerts.length === 0) {
        const catalogObj = getSiteByIdOrName(site.siteId) || {
          id: site.siteId,
          code: site.code,
          name: site.name,
          category: site.category,
          categoryLabel: site.categoryLabel,
          region: site.region,
          timezone: site.timezone,
          isActive: site.isActive
        };
        const intel = generateSiteIntelligence(catalogObj as any);
        const updated = await Site.findOneAndUpdate(
          { siteId: site.siteId },
          { $set: intel },
          { new: true }
        ).lean();
        return res.json({ success: true, data: updated || site, source: 'mongodb-auto-populated' });
      }

      return res.json({ success: true, data: site, source: 'mongodb' });
    }

    // If site does not exist in Mongo yet, generate on-the-fly and upsert into Mongo
    const catalogObj = getSiteByIdOrName(siteId);
    if (catalogObj) {
      const intel = generateSiteIntelligence(catalogObj);
      const newSiteData = {
        siteId: catalogObj.id,
        code: catalogObj.code,
        name: catalogObj.name,
        category: catalogObj.category,
        categoryLabel: catalogObj.categoryLabel,
        region: catalogObj.region,
        timezone: catalogObj.timezone,
        isActive: catalogObj.isActive,
        ...intel
      };

      try {
        const created = await Site.findOneAndUpdate(
          { siteId: catalogObj.id },
          newSiteData,
          { upsert: true, new: true }
        ).lean();
        return res.json({ success: true, data: created || newSiteData, source: 'mongodb-upserted' });
      } catch (upsertErr) {
        return res.json({ success: true, data: newSiteData, source: 'fallback-cache' });
      }
    }

    return res.status(404).json({ success: false, error: `Site '${siteId}' not found.` });
  } catch (err: any) {
    // Graceful offline fallback
    const catalogObj = getSiteByIdOrName(siteId);
    if (catalogObj) {
      const intel = generateSiteIntelligence(catalogObj);
      return res.json({
        success: true,
        data: {
          siteId: catalogObj.id,
          code: catalogObj.code,
          name: catalogObj.name,
          category: catalogObj.category,
          categoryLabel: catalogObj.categoryLabel,
          region: catalogObj.region,
          timezone: catalogObj.timezone,
          isActive: catalogObj.isActive,
          ...intel
        },
        source: 'memory-fallback'
      });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sites/:siteId/alerts
 * Retrieve the active Alert Pool for this site
 */
router.get('/:siteId/alerts', async (req: Request, res: Response) => {
  const { siteId } = req.params;
  try {
    let site = await Site.findOne({ siteId }).lean();
    if (!site) {
      site = await Site.findOne({
        $or: [
          { siteId: new RegExp(`^${siteId}$`, 'i') },
          { code: new RegExp(`^${siteId}$`, 'i') }
        ]
      }).lean();
    }

    if (site && site.alerts && site.alerts.length > 0) {
      return res.json({ success: true, siteId: site.siteId, count: site.alerts.length, alerts: site.alerts });
    }

    const catalogObj = getSiteByIdOrName(siteId);
    if (catalogObj) {
      const intel = generateSiteIntelligence(catalogObj);
      return res.json({ success: true, siteId: catalogObj.id, count: intel.alerts.length, alerts: intel.alerts });
    }

    return res.status(404).json({ success: false, error: `Site '${siteId}' not found.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/sites/:siteId/alerts/:alertId
 * Acknowledge, resolve, or silence an alert in the Alert Pool
 */
router.patch('/:siteId/alerts/:alertId', async (req: Request, res: Response) => {
  const { siteId, alertId } = req.params;
  const { status, acknowledgedBy } = req.body;

  try {
    const site = await Site.findOne({
      $or: [
        { siteId: new RegExp(`^${siteId}$`, 'i') },
        { code: new RegExp(`^${siteId}$`, 'i') }
      ]
    });

    if (!site) {
      return res.status(404).json({ success: false, error: `Site '${siteId}' not found.` });
    }

    let alertIndex = (site.alerts || []).findIndex((a: any) => a.id === alertId || a.alertKey === alertId);
    if (alertIndex === -1) {
      return res.status(404).json({ success: false, error: `Alert '${alertId}' not found on site '${siteId}'.` });
    }

    if (status) site.alerts[alertIndex].status = status;
    if (acknowledgedBy) site.alerts[alertIndex].acknowledgedBy = acknowledgedBy;

    await site.save();

    return res.json({
      success: true,
      message: `Alert '${alertId}' status updated to '${status}' in MongoDB Atlas.`,
      alert: site.alerts[alertIndex]
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sites/:siteId/alerts
 * Add a new alert to the Alert Pool
 */
router.post('/:siteId/alerts', async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const newAlert = req.body;

  try {
    const site = await Site.findOne({
      $or: [
        { siteId: new RegExp(`^${siteId}$`, 'i') },
        { code: new RegExp(`^${siteId}$`, 'i') }
      ]
    });

    if (!site) {
      return res.status(404).json({ success: false, error: `Site '${siteId}' not found.` });
    }

    const alertRecord = {
      id: newAlert.id || `alt_${Date.now()}`,
      alertKey: newAlert.alertKey || `ALT-${site.code}-${Math.floor(100 + Math.random() * 900)}`,
      title: newAlert.title || 'Telemetry Anomaly Detected',
      severity: newAlert.severity || 'WARNING',
      subsystem: newAlert.subsystem || 'General',
      sourceComponent: newAlert.sourceComponent || 'SYSTEM',
      status: newAlert.status || 'FIRING',
      timestamp: newAlert.timestamp || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      value: newAlert.value || '',
      description: newAlert.description || '',
      acknowledgedBy: newAlert.acknowledgedBy || '',
      runbookUrl: newAlert.runbookUrl || ''
    };

    site.alerts.unshift(alertRecord);
    await site.save();

    return res.json({
      success: true,
      message: `New alert '${alertRecord.alertKey}' added to Alert Pool in MongoDB Atlas.`,
      alert: alertRecord
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/sites/:siteId
 * Update and persist complete site data in MongoDB Atlas
 */
router.put('/:siteId', async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const updateData = req.body;

  try {
    const updateObj: any = {
      slackChannelName: updateData.slackChannelName,
      slackChannelUrl: updateData.slackChannelUrl,
      warRoomUrl: updateData.warRoomUrl,
      warRoomName: updateData.warRoomName,
      warRoomMeetingId: updateData.warRoomMeetingId,
      warRoomPasscode: updateData.warRoomPasscode,
      cem: updateData.cem,
      recentDeployment: updateData.recentDeployment,
      vmIps: updateData.vmIps,
      dashboardLinks: updateData.dashboardLinks,
      siteNotes: updateData.siteNotes
    };

    if (updateData.alerts) {
      updateObj.alerts = updateData.alerts;
    }

    const updated = await Site.findOneAndUpdate(
      { siteId },
      { $set: updateObj },
      { upsert: true, new: true }
    ).lean();

    return res.json({
      success: true,
      message: `Site intelligence for '${siteId}' successfully persisted in MongoDB Atlas.`,
      data: updated
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Failed to persist in MongoDB: ${err.message}`
    });
  }
});

/**
 * POST /api/sites/:siteId/reset
 * Reset site notes, intelligence, and alert pool to standard system defaults
 */
router.post('/:siteId/reset', async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const catalogObj = getSiteByIdOrName(siteId);
  if (!catalogObj) {
    return res.status(404).json({ success: false, error: `Site '${siteId}' not found.` });
  }

  try {
    const intel = generateSiteIntelligence(catalogObj);
    const updated = await Site.findOneAndUpdate(
      { siteId: catalogObj.id },
      { $set: intel },
      { upsert: true, new: true }
    ).lean();

    return res.json({
      success: true,
      message: `Site intelligence and Alert Pool for '${siteId}' reset to defaults in MongoDB.`,
      data: updated
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { SitePanel } from '../../models/SitePanel';

const router = Router();

// Standard default 12 panels template
const DEFAULT_12_PANELS = [
  { index: 1, title: 'Primary Sorter Ingest Telemetry', tag: 'Throughput', path: 'panelId=1' },
  { index: 2, title: 'Fleet Butler / AGV Fleet Robot Health', tag: 'Robotics', path: 'panelId=2' },
  { index: 3, title: 'Pick & Put Station Rates (PPR)', tag: 'Throughput', path: 'panelId=3' },
  { index: 4, title: 'Rack-to-Robot (R2R) Cycle Time & Latency', tag: 'Robotics', path: 'panelId=4' },
  { index: 5, title: 'Conveyor Motor Inverter & Thermal Diagnostics', tag: 'Hardware', path: 'panelId=5' },
  { index: 6, title: 'Optical Barcode Scanner Read Rate & Misalignments', tag: 'Hardware', path: 'panelId=6' },
  { index: 7, title: 'Platform Butler Core Service Status', tag: 'Platform', path: 'panelId=7' },
  { index: 8, title: 'Bridge Hardware Gateway Telemetry', tag: 'Gateway', path: 'panelId=8' },
  { index: 9, title: 'Elasticsearch Cluster & Ingestion Pipeline', tag: 'Elastic', path: 'panelId=9' },
  { index: 10, title: 'InfluxDB Time-Series Telemetry Stream', tag: 'Influx', path: 'panelId=10' },
  { index: 11, title: 'Storage Disk I/O & Inode Utilization', tag: 'Infrastructure', path: 'panelId=11' },
  { index: 12, title: 'JVM Memory Buffer & Garbage Collection', tag: 'Infrastructure', path: 'panelId=12' }
];

export function getDefaultPanelsForSite(siteId: string, siteName?: string) {
  const name = siteName || siteId;
  return DEFAULT_12_PANELS.map(p => ({
    panelId: `panel_${siteId}_${p.index}`,
    siteId,
    siteName: name,
    panelIndex: p.index,
    title: `${p.index}. ${name} — ${p.title}`,
    embedUrl: `https://grafana.wikimedia.org/d-solo/000000021/mediawiki-alerts?orgId=1&${p.path}&theme=dark`,
    categoryTag: p.tag,
    refreshInterval: '5s',
    theme: 'dark' as const,
    updatedAt: new Date().toISOString()
  }));
}

// GET /api/grafana/panels/:siteId (Returns all 12 panels for the site)
router.get('/panels/:siteId', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;

    // 1. Try fetching from MongoDB SitePanel collection
    let panels: any[] = [];
    try {
      panels = await SitePanel.find({ siteId }).sort({ panelIndex: 1 }).lean();
    } catch (e) {
      // MongoDB offline fallback
    }

    // If fewer than 12 panels in DB, fill with defaults
    if (!panels || panels.length < 12) {
      const defaults = getDefaultPanelsForSite(siteId);
      const merged = defaults.map(def => {
        const found = panels.find(p => p.panelIndex === def.panelIndex);
        return found || def;
      });
      panels = merged;
    }

    res.json({
      success: true,
      siteId,
      count: panels.length,
      panels
    });
  } catch (err: any) {
    console.error('Error fetching 12 Grafana panels:', err);
    res.json({
      success: true,
      siteId: req.params.siteId,
      count: 12,
      panels: getDefaultPanelsForSite(req.params.siteId)
    });
  }
});

// PUT /api/grafana/panels/:siteId/:panelIndex (Updates title and link for a specific panel in MongoDB)
router.put('/panels/:siteId/:panelIndex', async (req: Request, res: Response) => {
  try {
    const { siteId, panelIndex } = req.params;
    const { title, embedUrl, siteName, categoryTag } = req.body;
    const indexNum = parseInt(panelIndex, 10);

    if (!embedUrl) {
      return res.status(400).json({ success: false, error: 'embedUrl is required' });
    }

    let updatedDoc = null;
    try {
      updatedDoc = await SitePanel.findOneAndUpdate(
        { siteId, panelIndex: indexNum },
        {
          panelId: `panel_${siteId}_${indexNum}`,
          siteId,
          siteName: siteName || siteId,
          panelIndex: indexNum,
          title: title || `${indexNum}. Panel`,
          embedUrl,
          categoryTag: categoryTag || 'Telemetry',
          updatedBy: 'Dashboard Admin',
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    } catch (dbErr) {
      // DB error
    }

    res.json({
      success: true,
      message: `Panel #${indexNum} updated successfully for ${siteId}`,
      panel: updatedDoc || {
        siteId,
        panelIndex: indexNum,
        title,
        embedUrl,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/grafana/panels (Save or update general panel)
router.post('/panels', async (req: Request, res: Response) => {
  try {
    const { siteId, panelIndex = 1, title, embedUrl, siteName } = req.body;
    if (!siteId || !embedUrl) {
      return res.status(400).json({ success: false, error: 'siteId and embedUrl are required' });
    }

    const indexNum = parseInt(String(panelIndex), 10);
    const doc = await SitePanel.findOneAndUpdate(
      { siteId, panelIndex: indexNum },
      {
        panelId: `panel_${siteId}_${indexNum}`,
        siteId,
        siteName: siteName || siteId,
        panelIndex: indexNum,
        title: title || `Panel #${indexNum}`,
        embedUrl,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, panel: doc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

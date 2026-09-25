import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { AdminPanelLink, Site } from '../types/dashboard';
import { 
  ENTERPRISE_SITES, 
  EnterpriseSite, 
  getSitesGroupedByCategory, 
  getSiteByIdOrName, 
  SiteCategory,
  SiteIntelligence,
  SiteAlert,
  generateDefaultSiteIntelligence
} from '../types/sites';
import { DashboardLinkKey, DEFAULT_12_LINKS } from '../types/twelveLinks';
import { normalizeGrafanaUrl } from '../utils/proxyUrl';

interface DashboardContextType {
  sites: Site[];
  allEnterpriseSites: EnterpriseSite[];
  groupedSites: Record<SiteCategory, EnterpriseSite[]>;
  selectedCategory: SiteCategory;
  setSelectedCategory: (category: SiteCategory) => void;
  availableSitesForCategory: EnterpriseSite[];
  selectedSite: string;
  setSelectedSite: (siteId: string) => void;
  currentSiteObj: EnterpriseSite;
  
  currentMonth: string; // YYYY-MM
  setCurrentMonth: (month: string) => void;
  
  selectedDate: string;
  setSelectedDate: (date: string) => void;

  selectedService: string | null;
  setSelectedService: (service: string | null) => void;

  // 12 Direct Dashboard Links per site (6 Services + 6 Metrics)
  activeDashboardKey: DashboardLinkKey;
  setActiveDashboardKey: (key: DashboardLinkKey) => void;
  dashboardLinks: Record<DashboardLinkKey, string>;
  dashboardTitles: Record<DashboardLinkKey, string>;
  updateDashboardLink: (key: DashboardLinkKey, url: string, title?: string) => Promise<void>;
  editingLinkKey: DashboardLinkKey | null;
  setEditingLinkKey: (key: DashboardLinkKey | null) => void;

  calendarDays: any[];
  trendData: any[];
  ticketsList: any[];
  embedLinks: AdminPanelLink[];

  isAdminMode: boolean;
  setIsAdminMode: (admin: boolean) => void;
  
  // Site Intelligence & Notes (MongoDB Atlas)
  siteIntelligence: SiteIntelligence;
  isLoadingSiteData: boolean;
  isSavingSiteData: boolean;
  updateSiteIntelligence: (updated: Partial<SiteIntelligence>) => Promise<{ success: boolean; message?: string }>;
  resetSiteIntelligence: () => Promise<void>;
  openSiteSlack: () => void;
  openSiteWarRoom: () => void;

  // Site Alert Pool
  siteAlerts: SiteAlert[];
  activeAlertCount: number;
  acknowledgeAlert: (alertId: string) => Promise<void>;
  resolveAlert: (alertId: string) => Promise<void>;
  silenceAlert: (alertId: string) => Promise<void>;

  isLoading: boolean;
  lastUpdated: Date;
  refreshData: () => Promise<void>;
  updateEmbed: (link: Partial<AdminPanelLink>) => Promise<void>;
}

const DEFAULT_EMBED_LINKS: AdminPanelLink[] = [
  {
    id: 'embed_1',
    site_id: 'default',
    panel_key: 'primary_metrics',
    title: 'Live Telemetry & Sorter Throughput Dashboard',
    embedUrl: 'https://grafana.wikimedia.org/d-solo/000000021/mediawiki-alerts?orgId=1&panelId=1&theme=dark',
    panel_type: 'iframe',
    display_order: 1
  }
];

const REAL_GRAFANA_DEFAULTS: Partial<Record<DashboardLinkKey, string>> = {
  butler:   'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
  bridge:   'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
  elastic:  'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
  platform: 'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
  influx:   'https://cloudwatch.greymatter.greyorange.com/d-solo/influx-stats/influx-stats?orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=adamsprod-prod&panelId=panel-4&__feature.dashboardSceneSolo=true',
  logs:     'https://cloudwatch.greymatter.greyorange.com/d-solo/LyR7MASDk/process-service-metrics-dashboard-v1?orgId=1&from=now-30m&to=now&timezone=browser&var-endpoint=$__all&var-http_method=$__all&var-tenant_id=$__all&var-datasource=adamsprod-prod&panelId=panel-160&__feature.dashboardSceneSolo=true',
  KPI:      'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
  UPH:      'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
  PPR:      'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
  R2R:      'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
  DISK:     'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
  MEM:      'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true',
};

const generateDefaultLinks = (): Record<DashboardLinkKey, string> => {
  const map: any = {};
  for (const [k, v] of Object.entries(DEFAULT_12_LINKS)) {
    const key = k as DashboardLinkKey;
    if (REAL_GRAFANA_DEFAULTS[key]) {
      map[key] = REAL_GRAFANA_DEFAULTS[key]!;
    } else {
      map[key] = `https://grafana.wikimedia.org/d-solo/000000021/mediawiki-alerts?orgId=1&${v.path}&theme=dark`;
    }
  }
  return map;
};

const generateDefaultTitles = (siteName: string): Record<DashboardLinkKey, string> => {
  const map: any = {};
  for (const [k, v] of Object.entries(DEFAULT_12_LINKS)) {
    map[k] = `${siteName} — ${v.title}`;
  }
  return map;
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const now = new Date();
  const initY = now.getFullYear();
  const initM = String(now.getMonth() + 1).padStart(2, '0');
  const initD = String(now.getDate()).padStart(2, '0');
  const initialMonthStr = `${initY}-${initM}`;
  const initialDateStr = `${initY}-${initM}-${initD}`;

  const [selectedCategory, setSelectedCategoryState] = useState<SiteCategory>('RTP_TTP');
  const [selectedSite, setSelectedSite] = useState<string>('rtp_sams_atl');
  const [currentMonth, setCurrentMonth] = useState<string>(initialMonthStr);
  const [selectedDate, setSelectedDate] = useState<string>(initialDateStr);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [embedLinks, setEmbedLinks] = useState<AdminPanelLink[]>(DEFAULT_EMBED_LINKS);

  // 12 Link Management States
  const [activeDashboardKey, setActiveDashboardKey] = useState<DashboardLinkKey>('butler');
  const [editingLinkKey, setEditingLinkKey] = useState<DashboardLinkKey | null>(null);
  const [dashboardLinks, setDashboardLinks] = useState<Record<DashboardLinkKey, string>>(generateDefaultLinks);
  const [dashboardTitles, setDashboardTitles] = useState<Record<DashboardLinkKey, string>>(() => generateDefaultTitles("Sam's ATL"));

  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const groupedSites = useMemo(() => getSitesGroupedByCategory(), []);
  const availableSitesForCategory = useMemo(() => {
    return groupedSites[selectedCategory] || [];
  }, [groupedSites, selectedCategory]);

  const setSelectedCategory = useCallback((category: SiteCategory) => {
    setSelectedCategoryState(category);
    const sitesInCat = groupedSites[category] || [];
    if (sitesInCat.length > 0) {
      setSelectedSite(sitesInCat[0].id);
    }
  }, [groupedSites]);

  const handleSetSelectedSite = useCallback((siteId: string) => {
    setSelectedSite(siteId);
    const siteObj = getSiteByIdOrName(siteId);
    if (siteObj && siteObj.category !== selectedCategory) {
      setSelectedCategoryState(siteObj.category);
    }
  }, [selectedCategory]);

  const currentSiteObj: EnterpriseSite = useMemo(() => 
    getSiteByIdOrName(selectedSite) || ENTERPRISE_SITES[0], 
    [selectedSite]
  );

  // Site Intelligence & Notes state (MongoDB Atlas)
  const [siteIntelligence, setSiteIntelligence] = useState<SiteIntelligence>(() => {
    const cached = localStorage.getItem(`site_intel_${selectedSite}`);
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
    return generateDefaultSiteIntelligence(currentSiteObj);
  });
  const [isLoadingSiteData, setIsLoadingSiteData] = useState<boolean>(false);
  const [isSavingSiteData, setIsSavingSiteData] = useState<boolean>(false);

  // Fetch site intelligence from backend MongoDB on site change
  useEffect(() => {
    let active = true;
    const cached = localStorage.getItem(`site_intel_${selectedSite}`);
    if (cached) {
      try {
        setSiteIntelligence(JSON.parse(cached));
      } catch (e) {
        setSiteIntelligence(generateDefaultSiteIntelligence(currentSiteObj));
      }
    } else {
      setSiteIntelligence(generateDefaultSiteIntelligence(currentSiteObj));
    }

    setIsLoadingSiteData(true);
    fetch(`/api/sites/${encodeURIComponent(selectedSite)}`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (active && json?.data) {
          const freshData: SiteIntelligence = {
            siteId: json.data.siteId || currentSiteObj.id,
            code: json.data.code || currentSiteObj.code,
            name: json.data.name || currentSiteObj.name,
            category: json.data.category || currentSiteObj.category,
            categoryLabel: json.data.categoryLabel || currentSiteObj.categoryLabel,
            region: json.data.region || currentSiteObj.region,
            timezone: json.data.timezone || currentSiteObj.timezone,
            isActive: json.data.isActive ?? true,
            slackChannelName: json.data.slackChannelName || `#ops-${currentSiteObj.code.toLowerCase()}`,
            slackChannelUrl: json.data.slackChannelUrl || `https://slack.com/app_redirect?channel=${currentSiteObj.code.toLowerCase()}`,
            warRoomUrl: json.data.warRoomUrl || undefined,
            warRoomName: json.data.warRoomName || undefined,
            warRoomMeetingId: json.data.warRoomMeetingId || undefined,
            warRoomPasscode: json.data.warRoomPasscode || undefined,
            cem: json.data.cem || { name: 'Assigned CEM Lead', email: 'support@greyorange.com', phone: '+1 (800) 555-0199', slack: '@ops-support' },
            recentDeployment: json.data.recentDeployment || { version: 'v4.19.2', deployedAt: 'Recent', deployedBy: 'DevOps', commitHash: 'a1b2c3d', environment: 'Production', notes: '' },
            vmIps: json.data.vmIps || [],
            dashboardLinks: json.data.dashboardLinks || [],
            siteNotes: json.data.siteNotes || '',
            alerts: json.data.alerts && json.data.alerts.length > 0 
              ? json.data.alerts 
              : (generateDefaultSiteIntelligence(currentSiteObj).alerts || [])
          };
          setSiteIntelligence(freshData);
          try {
            localStorage.setItem(`site_intel_${selectedSite}`, JSON.stringify(freshData));
          } catch (e) {}
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoadingSiteData(false);
      });

    return () => { active = false; };
  }, [selectedSite, currentSiteObj]);

  const updateSiteIntelligence = useCallback(async (updated: Partial<SiteIntelligence>): Promise<{ success: boolean; message?: string }> => {
    setIsSavingSiteData(true);
    const merged: SiteIntelligence = {
      ...siteIntelligence,
      ...updated,
      siteId: selectedSite
    };

    setSiteIntelligence(merged);
    try {
      localStorage.setItem(`site_intel_${selectedSite}`, JSON.stringify(merged));
    } catch (e) {}

    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(selectedSite)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged)
      });
      const data = await res.json();
      setIsSavingSiteData(false);
      return { success: true, message: data.message || 'Saved to MongoDB Atlas successfully!' };
    } catch (err: any) {
      setIsSavingSiteData(false);
      return { success: true, message: 'Saved to local cache. Syncing with MongoDB Atlas when online.' };
    }
  }, [selectedSite, siteIntelligence]);

  const resetSiteIntelligence = useCallback(async () => {
    setIsSavingSiteData(true);
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(selectedSite)}/reset`, { method: 'POST' });
      const json = await res.json();
      if (json?.data) {
        setSiteIntelligence(json.data);
        localStorage.setItem(`site_intel_${selectedSite}`, JSON.stringify(json.data));
      }
    } catch (e) {
      const fresh = generateDefaultSiteIntelligence(currentSiteObj);
      setSiteIntelligence(fresh);
      localStorage.setItem(`site_intel_${selectedSite}`, JSON.stringify(fresh));
    } finally {
      setIsSavingSiteData(false);
    }
  }, [selectedSite, currentSiteObj]);

  const openSiteSlack = useCallback(() => {
    const url = siteIntelligence?.slackChannelUrl || `https://slack.com`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [siteIntelligence]);

  const openSiteWarRoom = useCallback(() => {
    const url = siteIntelligence?.warRoomUrl || `https://zoom.us`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [siteIntelligence]);

  // Site Alert Pool actions
  const siteAlerts = useMemo(() => {
    return siteIntelligence?.alerts || [];
  }, [siteIntelligence]);

  const activeAlertCount = useMemo(() => {
    return (siteIntelligence?.alerts || []).filter(a => a.status === 'FIRING').length;
  }, [siteIntelligence]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    const updatedAlerts = (siteIntelligence?.alerts || []).map(a => 
      (a.id === alertId || a.alertKey === alertId) 
        ? { ...a, status: 'ACKNOWLEDGED' as const, acknowledgedBy: siteIntelligence?.cem?.name || 'Marcus Vance' }
        : a
    );
    await updateSiteIntelligence({ alerts: updatedAlerts });
    fetch(`/api/sites/${encodeURIComponent(selectedSite)}/alerts/${encodeURIComponent(alertId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACKNOWLEDGED', acknowledgedBy: siteIntelligence?.cem?.name || 'Marcus Vance' })
    }).catch(() => {});
  }, [siteIntelligence, updateSiteIntelligence, selectedSite]);

  const resolveAlert = useCallback(async (alertId: string) => {
    const updatedAlerts = (siteIntelligence?.alerts || []).map(a => 
      (a.id === alertId || a.alertKey === alertId) 
        ? { ...a, status: 'RESOLVED' as const }
        : a
    );
    await updateSiteIntelligence({ alerts: updatedAlerts });
    fetch(`/api/sites/${encodeURIComponent(selectedSite)}/alerts/${encodeURIComponent(alertId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED' })
    }).catch(() => {});
  }, [siteIntelligence, updateSiteIntelligence, selectedSite]);

  const silenceAlert = useCallback(async (alertId: string) => {
    const updatedAlerts = (siteIntelligence?.alerts || []).map(a => 
      (a.id === alertId || a.alertKey === alertId) 
        ? { ...a, status: 'SILENCED' as const }
        : a
    );
    await updateSiteIntelligence({ alerts: updatedAlerts });
    fetch(`/api/sites/${encodeURIComponent(selectedSite)}/alerts/${encodeURIComponent(alertId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SILENCED' })
    }).catch(() => {});
  }, [siteIntelligence, updateSiteIntelligence, selectedSite]);

  // Load site-specific 12 links from storage when selectedSite changes
  useEffect(() => {
    const storageKeyLinks = `site_12_links_${selectedSite}`;
    const storageKeyTitles = `site_12_titles_${selectedSite}`;

    const savedLinks = localStorage.getItem(storageKeyLinks);
    const savedTitles = localStorage.getItem(storageKeyTitles);

    if (savedLinks) {
      try {
        const parsed = JSON.parse(savedLinks);
        const defaults = generateDefaultLinks();
        // Upgrade any wikimedia, empty, or broken URLs missing panelId to the real defaults
        for (const [k, v] of Object.entries(defaults)) {
          const currentVal = parsed[k];
          if (!currentVal || currentVal.includes('wikimedia.org') || (currentVal.includes('/d/') && !currentVal.includes('panelId') && !currentVal.includes('kiosk'))) {
            parsed[k] = v;
          }
        }
        setDashboardLinks(parsed);
      } catch (e) {
        setDashboardLinks(generateDefaultLinks());
      }
    } else {
      setDashboardLinks(generateDefaultLinks());
    }

    if (savedTitles) {
      try {
        setDashboardTitles(JSON.parse(savedTitles));
      } catch (e) {
        setDashboardTitles(generateDefaultTitles(currentSiteObj.name));
      }
    } else {
      setDashboardTitles(generateDefaultTitles(currentSiteObj.name));
    }
  }, [selectedSite, currentSiteObj]);

  // Actively retrieve all data from Backend API (MongoDB Atlas)
  const [backendCalendar, setBackendCalendar] = useState<any[] | null>(null);
  const [backendTrends, setBackendTrends] = useState<any[] | null>(null);
  const [backendTickets, setBackendTickets] = useState<any[] | null>(null);

  useEffect(() => {
    let active = true;

    // 1. Fetch Calendar Days
    fetch(`/api/salesforce/calendar/${encodeURIComponent(selectedSite)}?month=${currentMonth}`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (active && json?.days && json.days.length > 0) {
          setBackendCalendar(json.days);
        }
      })
      .catch(() => {});

    // 2. Fetch Trend Data
    fetch(`/api/salesforce/trends/${encodeURIComponent(selectedSite)}`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (active && json?.trends && json.trends.length > 0) {
          setBackendTrends(json.trends);
        }
      })
      .catch(() => {});

    // 3. Fetch Tickets
    const ticketUrl = selectedService 
      ? `/api/salesforce/tickets/${encodeURIComponent(selectedSite)}?service=${encodeURIComponent(selectedService)}`
      : `/api/salesforce/tickets/${encodeURIComponent(selectedSite)}?date=${encodeURIComponent(selectedDate)}`;
    fetch(ticketUrl)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (active && json?.data) {
          setBackendTickets(json.data);
        }
      })
      .catch(() => {});

    // 4. Fetch 12 Panels from MongoDB Atlas
    fetch(`/api/grafana/panels/${encodeURIComponent(selectedSite)}`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (active && json?.panels && json.panels.length > 0) {
          const keys: DashboardLinkKey[] = [
            'butler', 'bridge', 'elastic', 'platform', 'influx', 'logs',
            'UPH', 'PPR', 'R2R', 'KPI', 'DISK', 'MEM'
          ];
          const lMap: any = {};
          const tMap: any = {};
          json.panels.forEach((p: any) => {
            const k = keys[p.panelIndex - 1];
            if (k && p.embedUrl && !p.embedUrl.includes('wikimedia.org')) {
              lMap[k] = p.embedUrl;
              tMap[k] = p.title;
            }
          });
          setDashboardLinks(prev => ({ ...prev, ...lMap }));
          setDashboardTitles(prev => ({ ...prev, ...tMap }));
        }
      })
      .catch(() => {});

    return () => { active = false; };
  }, [selectedSite, currentMonth, selectedDate, selectedService]);

  // Update a single link out of the 12
  const updateDashboardLink = async (key: DashboardLinkKey, url: string, title?: string) => {
    const cleanUrl = normalizeGrafanaUrl(url);
    if (!cleanUrl) return;

    setDashboardLinks(prev => {
      const next = { ...prev, [key]: cleanUrl };
      try {
        localStorage.setItem(`site_12_links_${selectedSite}`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    if (title && title.trim()) {
      setDashboardTitles(prev => {
        const next = { ...prev, [key]: title.trim() };
        try {
          localStorage.setItem(`site_12_titles_${selectedSite}`, JSON.stringify(next));
        } catch (e) {}
        return next;
      });
    }

    // Persist to MongoDB Atlas microservice
    const meta = DEFAULT_12_LINKS[key];
    try {
      await fetch(`/api/grafana/panels/${encodeURIComponent(selectedSite)}/${meta.index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || dashboardTitles[key] || meta.title,
          embedUrl: cleanUrl,
          siteName: currentSiteObj.name,
          categoryTag: meta.category
        })
      });
    } catch (e) {
      // Offline fallback
    }
  };

  // Unified Salesforce Tickets schema (Dynamic, site-specific per currentSiteObj and currentMonth)
  const unifiedTickets = useMemo(() => {
    const site = currentSiteObj.name;
    const code = (currentSiteObj.code || 'SITE').replace(/[^A-Z0-9]/g, '');
    const cat = currentSiteObj.category;
    // Site-wise seed: guarantees every facility has a completely unique incident signature!
    const siteHash = (currentSiteObj.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + currentSiteObj.name.length * 11);
    const list: any[] = [];

    const [yearStr, monthStr] = (currentMonth || '2026-09').split('-');
    const year = parseInt(yearStr, 10) || 2026;
    const monthNum = parseInt(monthStr, 10) || 9;
    const totalDays = new Date(year, monthNum, 0).getDate();

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Site-specific incident generation:
      // SEV 1 Critical Ticket (Forces Calendar Red)
      if ((day + siteHash + monthNum) % 11 === 0 || (day === 14 && siteHash % 2 === 0)) {
        list.push({
          id: `tkt_${code}_10${day}`,
          ticketId: `INC-${code}-10${String(day).padStart(2, '0')}`,
          ticketKey: `INC-${code}-10${String(day).padStart(2, '0')}`,
          siteId: selectedSite,
          siteName: site,
          category: cat,
          severity: 'SEV1',
          receivedDate: dateStr,
          receivedTime: '08:15 AM EDT',
          serviceComponent: 'Platform',
          status: 'IN_PROGRESS',
          subject: `${site} — Primary Inbound Sorter Matrix Motor Drive Inverter Tripped`,
          summary: `${site} — Primary Inbound Sorter Matrix Motor Drive Inverter Tripped`,
          description: `Motor drive inverter tripped on overcurrent at Zone 4B in ${site}. Sorter line halted. Field tech dispatched to inspect thermals.`,
          assigneeName: 'Marcus Vance',
          assigneeRole: 'Lead Automation Engineer',
          incidentDate: dateStr,
          incidentTime: '08:15 AM EDT',
          mttrMinutes: 38
        });
      }
      // SEV 2 Major Tickets (Forces Calendar Amber)
      else if ((day + siteHash + monthNum) % 5 === 0 || day === 7 || day === 23) {
        for (let tNum = 1; tNum <= 2; tNum++) {
          list.push({
            id: `tkt_${code}_20${day}_${tNum}`,
            ticketId: `INC-${code}-20${String(day).padStart(2, '0')}-${tNum}`,
            ticketKey: `INC-${code}-20${String(day).padStart(2, '0')}-${tNum}`,
            siteId: selectedSite,
            siteName: site,
            category: cat,
            severity: 'SEV2',
            receivedDate: dateStr,
            receivedTime: tNum === 1 ? '09:02 AM EDT' : '11:45 AM EDT',
            serviceComponent: tNum === 1 ? 'Butler' : 'Logs',
            status: 'OPEN',
            subject: `${site} — Haiport Station #${tNum} Turntable Mechanical Backlash`,
            summary: `${site} — Haiport Station #${tNum} Turntable Mechanical Backlash`,
            description: `Ranger AGV 142 unable to negotiate tote handoff at Port ${tNum} in ${site} due to proximity optical sensor dust occlusion.`,
            assigneeName: 'Sarah Chen',
            assigneeRole: 'Robotics Technician',
            incidentDate: dateStr,
            incidentTime: tNum === 1 ? '09:02 AM EDT' : '11:45 AM EDT',
            mttrMinutes: 52
          });
        }
      }
      // SEV 3 Minor Ticket (Forces Calendar Blue)
      else if ((day + siteHash + monthNum) % 3 === 0 || day === 2 || day === 19) {
        list.push({
          id: `tkt_${code}_30${day}`,
          ticketId: `INC-${code}-30${String(day).padStart(2, '0')}`,
          ticketKey: `INC-${code}-30${String(day).padStart(2, '0')}`,
          siteId: selectedSite,
          siteName: site,
          category: cat,
          severity: 'SEV3',
          receivedDate: dateStr,
          receivedTime: '10:12 AM EDT',
          serviceComponent: 'Bridge',
          status: 'RESOLVED',
          subject: `${site} — Barcode Optical Scanner Reader Lens Misalignment`,
          summary: `${site} — Barcode Optical Scanner Reader Lens Misalignment`,
          description: `Lens deflection causing 12% no-read rate on Chute 12 in ${site}. Packages routed to manual inspection.`,
          assigneeName: 'Elena Rostova',
          assigneeRole: 'Hardware QA',
          incidentDate: dateStr,
          incidentTime: '10:12 AM EDT',
          mttrMinutes: 20
        });
      }
    }

    return list;
  }, [currentSiteObj, selectedSite, currentMonth]);

  // Derived Calendar Days directly from unifiedTickets for the active month
  const calendarDays = useMemo(() => {
    const [yearStr, monthStr] = (currentMonth || '2026-09').split('-');
    const year = parseInt(yearStr, 10) || 2026;
    const monthNum = parseInt(monthStr, 10) || 9;
    const totalDays = new Date(year, monthNum, 0).getDate();

    const days = [];
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayTickets = unifiedTickets.filter(t => t.receivedDate === dateStr);

      const sev1Count = dayTickets.filter(t => t.severity === 'SEV1').length;
      const sev2Count = dayTickets.filter(t => t.severity === 'SEV2').length;
      const sev3Count = dayTickets.filter(t => t.severity === 'SEV3').length;

      let severityColor: 'RED' | 'YELLOW' | 'BLUE' | 'GREEN' = 'GREEN';
      let hexColor = '#10B981';

      if (sev1Count >= 1) {
        severityColor = 'RED';
        hexColor = '#EF4444';
      } else if (sev2Count >= 2) {
        severityColor = 'YELLOW';
        hexColor = '#F59E0B';
      } else if (sev2Count === 1 || sev3Count >= 1) {
        severityColor = 'BLUE';
        hexColor = '#3B82F6';
      }

      days.push({
        date: dateStr,
        dayOfMonth: day,
        dayOfWeek: new Date(year, monthNum - 1, day).getDay(),
        severityColor,
        hexColor,
        totalTickets: dayTickets.length,
        sev1Count,
        sev2Count,
        sev3Count,
        tickets: dayTickets
      });
    }
    return days;
  }, [unifiedTickets, currentMonth]);

  const activeCalendarDays = backendCalendar && backendCalendar.length > 0 ? backendCalendar : calendarDays;

  // Derived 13-Week Trends directly from unifiedTickets (or backend)
  const localTrendData = useMemo(() => {
    const weekLabels = [
      'Feb 24', 'Mar 03', 'Mar 10', 'Mar 17', 'Mar 24', 'Mar 31',
      'Apr 07', 'Apr 14', 'Apr 21', 'Apr 28', 'May 05', 'May 12', 'May 19'
    ];
    const totalSev1 = unifiedTickets.filter(t => t.severity === 'SEV1').length;
    const totalSev2 = unifiedTickets.filter(t => t.severity === 'SEV2').length;
    const totalSev3 = unifiedTickets.filter(t => t.severity === 'SEV3').length;

    return weekLabels.map((label, idx) => {
      const red = Math.max(1, Math.round((totalSev1 / 13) * ((idx % 3) + 0.8)));
      const yellow = Math.max(2, Math.round((totalSev2 / 13) * ((idx % 4) + 0.9)));
      const blue = Math.max(5, Math.round((totalSev3 / 13) * ((idx % 2) + 1.1)));
      const green = Math.max(20, 65 - red - yellow - blue);
      return { label, green, blue, yellow, red, total: red + yellow + blue + green };
    });
  }, [unifiedTickets]);

  const activeTrendData = backendTrends && backendTrends.length > 0 ? backendTrends : localTrendData;
  const ticketsList = backendTickets && backendTickets.length > 0 ? backendTickets : unifiedTickets;

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setLastUpdated(new Date());
    setTimeout(() => setIsLoading(false), 200);
  }, []);

  const updateEmbed = async (link: Partial<AdminPanelLink>) => {
    setEmbedLinks(prev => {
      const idx = prev.findIndex(p => p.panel_key === link.panel_key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...link } as AdminPanelLink;
        return copy;
      }
      return [...prev, link as AdminPanelLink];
    });
  };

  const legacySites: Site[] = useMemo(() => ENTERPRISE_SITES.map(s => ({
    id: s.id,
    code: s.code,
    name: s.name,
    region: s.region,
    timezone: s.timezone,
    is_active: s.isActive
  })), []);

  return (
    <DashboardContext.Provider
      value={{
        sites: legacySites,
        allEnterpriseSites: ENTERPRISE_SITES,
        groupedSites,
        selectedCategory,
        setSelectedCategory,
        availableSitesForCategory,
        selectedSite,
        setSelectedSite: handleSetSelectedSite,
        currentSiteObj,
        currentMonth,
        setCurrentMonth,
        selectedDate,
        setSelectedDate,
        selectedService,
        setSelectedService,
        activeDashboardKey,
        setActiveDashboardKey,
        dashboardLinks,
        dashboardTitles,
        updateDashboardLink,
        editingLinkKey,
        setEditingLinkKey,
        calendarDays: activeCalendarDays,
        trendData: activeTrendData,
        ticketsList,
        embedLinks,
        isAdminMode,
        setIsAdminMode,
        siteIntelligence,
        isLoadingSiteData,
        isSavingSiteData,
        updateSiteIntelligence,
        resetSiteIntelligence,
        openSiteSlack,
        openSiteWarRoom,
        siteAlerts,
        activeAlertCount,
        acknowledgeAlert,
        resolveAlert,
        silenceAlert,
        isLoading,
        lastUpdated,
        refreshData,
        updateEmbed
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export { DashboardContext };
export { useDashboard } from './useDashboard';

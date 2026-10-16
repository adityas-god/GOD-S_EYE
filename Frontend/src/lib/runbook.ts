export interface MonitoringLink {
  id: string;
  title: string;
  url: string;
  category: string;
  updated_at?: string;
}

export interface ZoomCall {
  url: string | null;
  topic: string | null;
  is_active: boolean;
  last_started_at?: string | null;
}

export interface VmIp {
  id: string;
  title: string;
  ip_address: string;
  role: string;
  ssh_command: string | null;
  notes?: string | null;
}

export interface SlackConfig {
  channel_name: string | null;
  channel_url: string | null;
  is_configured: boolean;
}

export interface DeploymentRecord {
  id: string;
  version: string;
  deployed_at: string;
  deployed_by: string;
  status: 'Success' | 'Failed' | 'Rolled Back' | string;
  notes?: string | null;
}

export interface HandoverRecord {
  id: string;
  created_at: string;
  author: string;
  shift: 'Morning' | 'Evening' | 'Night' | string;
  commands_used: string;
  what_is_working: string;
  open_questions: string;
  cautions: string;
}

export interface SiteConfigRecord {
  id: string;
  config_key: string;
  config_value: string;
  created_at: string;
  updated_by: string;
  metadata?: Record<string, any>;
  notes?: string | null;
}

export interface SiteRunbook {
  id: string;
  name: string;
  product_line?: string | null;
  location?: string | null;
  monitoring_links: MonitoringLink[];
  zoom_call: ZoomCall;
  vm_ips: VmIp[];
  slack: SlackConfig;
  deployments: DeploymentRecord[];
  handovers: HandoverRecord[];
  site_configs: SiteConfigRecord[];
}

export const defaultRunbook: SiteRunbook = {
  id: '',
  name: '',
  monitoring_links: [],
  zoom_call: { url: null, topic: null, is_active: false, last_started_at: null },
  vm_ips: [],
  slack: { channel_name: null, channel_url: null, is_configured: false },
  deployments: [],
  handovers: [],
  site_configs: [],
};

export async function fetchSiteRunbook(siteId: string): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch site runbook: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success || !json.site) {
    throw new Error(json.error || 'Site not found');
  }
  return {
    ...defaultRunbook,
    ...json.site,
    monitoring_links: Array.isArray(json.site.monitoring_links) ? json.site.monitoring_links : [],
    zoom_call: json.site.zoom_call || defaultRunbook.zoom_call,
    vm_ips: Array.isArray(json.site.vm_ips) ? json.site.vm_ips : [],
    slack: json.site.slack || defaultRunbook.slack,
    deployments: Array.isArray(json.site.deployments) ? json.site.deployments : [],
    handovers: Array.isArray(json.site.handovers) ? json.site.handovers : [],
    site_configs: Array.isArray(json.site.site_configs) ? json.site.site_configs : [],
  };
}

export async function apiAddMonitoringLink(
  siteId: string,
  link: { title: string; url: string; category?: string }
): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(link),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to add link');
  return json.site;
}

export async function apiUpdateMonitoringLink(
  siteId: string,
  linkId: string,
  link: { title: string; url: string; category?: string }
): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/links/${encodeURIComponent(linkId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(link),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to update link');
  return json.site;
}

export async function apiDeleteMonitoringLink(siteId: string, linkId: string): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/links/${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to delete link');
  return json.site;
}

export async function apiAddVmIp(
  siteId: string,
  vm: { title: string; ip_address: string; role?: string; ssh_command?: string; notes?: string }
): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/vms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vm),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to add VM');
  return json.site;
}

export async function apiUpdateVmIp(
  siteId: string,
  vmId: string,
  vm: { title: string; ip_address: string; role?: string; ssh_command?: string; notes?: string }
): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/vms/${encodeURIComponent(vmId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vm),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to update VM');
  return json.site;
}

export async function apiDeleteVmIp(siteId: string, vmId: string): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/vms/${encodeURIComponent(vmId)}`, {
    method: 'DELETE',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to delete VM');
  return json.site;
}

export async function apiUpdateZoom(
  siteId: string,
  zoom: { url: string | null; topic?: string | null; is_active: boolean }
): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/zoom`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(zoom),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to update Zoom call');
  return json.site;
}

export async function apiUpdateSlack(
  siteId: string,
  slack: { channel_name: string | null; channel_url: string | null }
): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/slack`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slack),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to update Slack');
  return json.site;
}

export async function apiAddDeployment(
  siteId: string,
  deployment: { version: string; deployed_by?: string; status?: string; notes?: string; deployed_at?: string }
): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/deployments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deployment),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to add deployment');
  return json.site;
}

export async function apiAddHandover(
  siteId: string,
  handover: {
    author?: string;
    shift?: string;
    commands_used?: string;
    what_is_working?: string;
    open_questions?: string;
    cautions?: string;
  }
): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/handovers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(handover),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to add handover');
  return json.site;
}

export async function apiAddSiteConfig(
  siteId: string,
  cfg: {
    config_key: string;
    config_value: string;
    updated_by?: string;
    notes?: string;
    metadata?: any;
  }
): Promise<SiteRunbook> {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/configs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to add config');
  return json.site;
}

import React, { useState } from 'react';
import {
  Link2,
  ExternalLink,
  Video,
  Server,
  MessageSquare,
  History,
  Settings,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Check,
  Clock,
  User,
  Terminal,
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  SiteRunbook,
  MonitoringLink,
  VmIp,
  apiAddMonitoringLink,
  apiUpdateMonitoringLink,
  apiDeleteMonitoringLink,
  apiAddVmIp,
  apiUpdateVmIp,
  apiDeleteVmIp,
  apiUpdateZoom,
  apiUpdateSlack,
  apiAddDeployment,
  apiAddHandover,
  apiAddSiteConfig,
  apiAddSiteConfigsBatch,
} from '@/lib/runbook';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type RunbookTabKey = 'links' | 'zoom' | 'vms' | 'slack' | 'handovers' | 'configs';

export interface SiteRunbookPanelProps {
  siteId: string;
  runbook: SiteRunbook;
  onRefresh: (updated: SiteRunbook) => void;
  activeTab: RunbookTabKey;
  onBackToMonitoring?: () => void;
}

export function SiteRunbookPanel({
  siteId,
  runbook,
  onRefresh,
  activeTab,
  onBackToMonitoring,
}: SiteRunbookPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal / Form state for inline creation & editing
  const [modalType, setModalType] = useState<
    'link_add' | 'link_edit' | 'vm_add' | 'vm_edit' | 'zoom_edit' | 'slack_edit' | 'dep_add' | 'handover_add' | 'config_add' | null
  >(null);

  const [editingItem, setEditingItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form inputs
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkCategory, setLinkCategory] = useState('Metrics');

  const [vmTitle, setVmTitle] = useState('');
  const [vmIp, setVmIp] = useState('');
  const [vmRole, setVmRole] = useState('RMS Server');
  const [vmSsh, setVmSsh] = useState('');
  const [vmNotes, setVmNotes] = useState('');

  const [zoomUrl, setZoomUrl] = useState('');
  const [zoomTopic, setZoomTopic] = useState('');
  const [zoomActive, setZoomActive] = useState(false);

  const [slackName, setSlackName] = useState('');
  const [slackUrl, setSlackUrl] = useState('');

  const [depVersion, setDepVersion] = useState('');
  const [depBy, setDepBy] = useState('');
  const [depStatus, setDepStatus] = useState('Success');
  const [depNotes, setDepNotes] = useState('');

  const [hoAuthor, setHoAuthor] = useState('');
  const [hoShift, setHoShift] = useState('Morning');
  const [hoCommands, setHoCommands] = useState('');
  const [hoWorking, setHoWorking] = useState('');
  const [hoQuestions, setHoQuestions] = useState('');
  const [hoCautions, setHoCautions] = useState('');

  const [cfgKey, setCfgKey] = useState('');
  const [cfgValue, setCfgValue] = useState('');
  const [cfgAuthor, setCfgAuthor] = useState('');
  const [cfgNotes, setCfgNotes] = useState('');
  const [cfgPasteMode, setCfgPasteMode] = useState<'single' | 'bulk'>('single');
  const [cfgBulkRaw, setCfgBulkRaw] = useState('');
  const [cfgParsedPairs, setCfgParsedPairs] = useState<Array<{ key: string; value: string }>>([]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const closeModal = () => {
    setModalType(null);
    setEditingItem(null);
    setErrorMsg(null);
  };

  const openAddLink = () => {
    setLinkTitle('');
    setLinkUrl('');
    setLinkCategory('Metrics');
    setModalType('link_add');
  };

  const openEditLink = (l: MonitoringLink) => {
    setEditingItem(l);
    setLinkTitle(l.title);
    setLinkUrl(l.url);
    setLinkCategory(l.category || 'General');
    setModalType('link_edit');
  };

  const openAddVm = () => {
    setVmTitle('');
    setVmIp('');
    setVmRole('RMS Server');
    setVmSsh('');
    setVmNotes('');
    setModalType('vm_add');
  };

  const openEditVm = (v: VmIp) => {
    setEditingItem(v);
    setVmTitle(v.title);
    setVmIp(v.ip_address);
    setVmRole(v.role || 'Node');
    setVmSsh(v.ssh_command || `ssh ${v.ip_address}`);
    setVmNotes(v.notes || '');
    setModalType('vm_edit');
  };

  const openEditZoom = () => {
    setZoomUrl(runbook.zoom_call?.url || '');
    setZoomTopic(runbook.zoom_call?.topic || '');
    setZoomActive(Boolean(runbook.zoom_call?.is_active));
    setModalType('zoom_edit');
  };

  const openEditSlack = () => {
    setSlackName(runbook.slack?.channel_name || '');
    setSlackUrl(runbook.slack?.channel_url || '');
    setModalType('slack_edit');
  };

  const openAddDep = () => {
    setDepVersion('');
    setDepBy('DevOps');
    setDepStatus('Success');
    setDepNotes('');
    setModalType('dep_add');
  };

  const openAddHandover = () => {
    setHoAuthor('Shift Lead');
    setHoShift('Morning');
    setHoCommands('');
    setHoWorking('');
    setHoQuestions('');
    setHoCautions('');
    setModalType('handover_add');
  };

  // Auto-detect & parse .env format like Vercel / Render / Docker
  const parseEnvText = (raw: string): Array<{ key: string; value: string }> => {
    const lines = raw.split(/\r?\n/);
    const results: Array<{ key: string; value: string }> = [];

    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      // Strip export prefix if present
      if (line.startsWith('export ')) {
        line = line.replace(/^export\s+/, '').trim();
      }

      // Check for KEY=VALUE or KEY: VALUE
      let sepIdx = line.indexOf('=');
      if (sepIdx === -1) {
        sepIdx = line.indexOf(':');
      }

      if (sepIdx !== -1) {
        const k = line.substring(0, sepIdx).trim();
        let v = line.substring(sepIdx + 1).trim();

        // Strip surrounding matching quotes
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.substring(1, v.length - 1);
        }

        if (k) {
          results.push({ key: k, value: v });
        }
      }
    }
    return results;
  };

  const openAddConfig = () => {
    setCfgKey('');
    setCfgValue('');
    setCfgAuthor('Admin');
    setCfgNotes('');
    setCfgPasteMode('single');
    setCfgBulkRaw('');
    setCfgParsedPairs([]);
    setModalType('config_add');
  };

  // Submit handlers
  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle.trim() || !linkUrl.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      let updated: SiteRunbook;
      if (modalType === 'link_add') {
        updated = await apiAddMonitoringLink(siteId, {
          title: linkTitle.trim(),
          url: linkUrl.trim(),
          category: linkCategory.trim(),
        });
      } else {
        updated = await apiUpdateMonitoringLink(siteId, editingItem.id, {
          title: linkTitle.trim(),
          url: linkUrl.trim(),
          category: linkCategory.trim(),
        });
      }
      onRefresh(updated);
      closeModal();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to remove this monitoring link?')) return;
    try {
      const updated = await apiDeleteMonitoringLink(siteId, linkId);
      onRefresh(updated);
    } catch (err: any) {
      alert(`Error deleting link: ${err.message}`);
    }
  };

  const handleSaveVm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vmTitle.trim() || !vmIp.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      let updated: SiteRunbook;
      if (modalType === 'vm_add') {
        updated = await apiAddVmIp(siteId, {
          title: vmTitle.trim(),
          ip_address: vmIp.trim(),
          role: vmRole.trim(),
          ssh_command: vmSsh.trim() || `ssh ${vmIp.trim()}`,
          notes: vmNotes.trim() || undefined,
        });
      } else {
        updated = await apiUpdateVmIp(siteId, editingItem.id, {
          title: vmTitle.trim(),
          ip_address: vmIp.trim(),
          role: vmRole.trim(),
          ssh_command: vmSsh.trim() || `ssh ${vmIp.trim()}`,
          notes: vmNotes.trim() || undefined,
        });
      }
      onRefresh(updated);
      closeModal();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVm = async (vmId: string) => {
    if (!confirm('Are you sure you want to delete this VM record?')) return;
    try {
      const updated = await apiDeleteVmIp(siteId, vmId);
      onRefresh(updated);
    } catch (err: any) {
      alert(`Error deleting VM: ${err.message}`);
    }
  };

  const handleSaveZoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const updated = await apiUpdateZoom(siteId, {
        url: zoomUrl.trim() || null,
        topic: zoomTopic.trim() || null,
        is_active: zoomActive,
      });
      onRefresh(updated);
      closeModal();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSlack = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const updated = await apiUpdateSlack(siteId, {
        channel_name: slackName.trim() || null,
        channel_url: slackUrl.trim() || null,
      });
      onRefresh(updated);
      closeModal();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depVersion.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const updated = await apiAddDeployment(siteId, {
        version: depVersion.trim(),
        deployed_by: depBy.trim() || 'DevOps',
        status: depStatus,
        notes: depNotes.trim() || undefined,
      });
      onRefresh(updated);
      closeModal();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const updated = await apiAddHandover(siteId, {
        author: hoAuthor.trim() || 'Shift Lead',
        shift: hoShift,
        commands_used: hoCommands.trim(),
        what_is_working: hoWorking.trim(),
        open_questions: hoQuestions.trim(),
        cautions: hoCautions.trim(),
      });
      onRefresh(updated);
      closeModal();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      if (cfgPasteMode === 'bulk') {
        const pairs = cfgParsedPairs.length > 0 ? cfgParsedPairs : parseEnvText(cfgBulkRaw);
        if (pairs.length === 0) {
          throw new Error('No valid KEY=VALUE environment variables detected.');
        }
        const updated = await apiAddSiteConfigsBatch(siteId, {
          configs: pairs.map(p => ({
            config_key: p.key,
            config_value: p.value,
            notes: cfgNotes.trim() || undefined,
          })),
          updated_by: cfgAuthor.trim() || 'Admin',
          notes: cfgNotes.trim() || undefined,
        });
        onRefresh(updated);
        closeModal();
      } else {
        if (!cfgKey.trim() || !cfgValue.trim()) {
          throw new Error('Config key and value are required');
        }
        const updated = await apiAddSiteConfig(siteId, {
          config_key: cfgKey.trim(),
          config_value: cfgValue.trim(),
          updated_by: cfgAuthor.trim() || 'Admin',
          notes: cfgNotes.trim() || undefined,
        });
        onRefresh(updated);
        closeModal();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Return to Site Monitoring Header */}
      {onBackToMonitoring && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <button
            onClick={onBackToMonitoring}
            className="back-link"
            style={{
              margin: 0,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--soft-orange)',
              fontWeight: 500,
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Back to site monitoring (Salesforce cases & Opsgenie alerts)
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={onBackToMonitoring}
            style={{ fontSize: 11, gap: 6 }}
          >
            Back to buckets
          </Button>
        </div>
      )}

      {/* 1️⃣ MONITORING LINKS PANEL */}
      {activeTab === 'links' && (
        <section className="data-panel">
          <div className="data-panel-heading">
            <div className="provider-symbol" style={{ background: 'var(--blue-surface)', color: 'var(--blue)' }}>
              <Link2 style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <span className="eyebrow">SITE OPERATIONS RUNBOOK</span>
              <h2>Monitoring Links</h2>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Button size="sm" variant="outline" onClick={openAddLink} style={{ gap: 6, fontSize: 11 }}>
                <Plus style={{ width: 13, height: 13 }} />
                Add Link
              </Button>
            </div>
          </div>

          <div className="data-panel-toolbar">
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              Direct access dashboards (Grafana, Kibana, Datadog, CloudWatch, RMS logs)
            </span>
          </div>

          {runbook.monitoring_links.length === 0 ? (
            <div className="source-empty" style={{ minHeight: 180, padding: 30 }}>
              <Link2 style={{ width: 32, height: 32, color: 'var(--muted-foreground)', opacity: 0.6 }} />
              <h3 style={{ fontSize: 15, margin: '14px 0 4px', color: 'var(--foreground)' }}>
                No monitoring links configured
              </h3>
              <p style={{ fontSize: 11, maxWidth: 320, color: 'var(--muted-foreground)' }}>
                Add Grafana, Kibana, or telemetry dashboard links for {runbook.name}.
              </p>
              <Button size="sm" variant="outline" onClick={openAddLink} style={{ gap: 6 }}>
                <Plus style={{ width: 13, height: 13 }} />
                Add Link
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      textTransform: 'uppercase',
                    }}
                  >
                    <th style={{ padding: '12px 20px' }}>Title & Description</th>
                    <th style={{ padding: '12px 16px' }}>Category</th>
                    <th style={{ padding: '12px 16px' }}>Target URL</th>
                    <th style={{ padding: '12px 20px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runbook.monitoring_links.map(link => (
                    <tr
                      key={link.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <td style={{ padding: '12px 20px', fontWeight: 500, color: 'var(--foreground)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Link2 style={{ width: 14, height: 14, color: 'var(--muted-foreground)' }} />
                          <span>{link.title}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'var(--secondary)',
                            border: '1px solid var(--border)',
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--foreground)',
                          }}
                        >
                          {link.category || 'General'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: 'var(--blue)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            maxWidth: 360,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span>{link.url}</span>
                          <ExternalLink style={{ width: 11, height: 11, flexShrink: 0 }} />
                        </a>
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Button size="sm" variant="ghost" onClick={() => openEditLink(link)} style={{ padding: 6, height: 28 }}>
                            <Edit2 style={{ width: 12, height: 12 }} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteLink(link.id)} style={{ padding: 6, height: 28, color: 'var(--destructive)' }}>
                            <Trash2 style={{ width: 12, height: 12 }} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 2️⃣ ZOOM CALL PANEL */}
      {activeTab === 'zoom' && (
        <section className="data-panel">
          <div className="data-panel-heading">
            <div
              className="provider-symbol"
              style={{
                background: runbook.zoom_call?.is_active ? 'var(--orange-surface)' : 'var(--secondary)',
                color: runbook.zoom_call?.is_active ? 'var(--destructive)' : 'var(--muted-foreground)',
              }}
            >
              <Video style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <span className="eyebrow">SITE OPERATIONS RUNBOOK</span>
              <h2>Incident Zoom Bridge</h2>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  background: runbook.zoom_call?.is_active ? 'var(--destructive)' : 'var(--secondary)',
                  color: runbook.zoom_call?.is_active ? '#ffffff' : 'var(--muted-foreground)',
                }}
              >
                {runbook.zoom_call?.is_active ? 'LIVE BRIDGE ACTIVE' : 'NO CALL IN PROGRESS'}
              </span>
            </div>
          </div>

          <div style={{ padding: 24, maxWidth: 650 }}>
            <div
              style={{
                padding: 20,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>
                  {runbook.zoom_call?.topic || 'Sev 1 / Sev 2 Incident War-Room'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                  {runbook.zoom_call?.is_active
                    ? 'Active war-room bridge currently in progress for this site.'
                    : 'No active incident bridge running right now.'}
                </p>
              </div>

              {runbook.zoom_call?.url ? (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 6,
                    background: 'var(--secondary)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--foreground)' }}>
                    {runbook.zoom_call.url}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(runbook.zoom_call?.url || '', 'zoom-copy')}
                      style={{ height: 28, padding: '0 8px' }}
                    >
                      {copiedId === 'zoom-copy' ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                    </Button>
                    <Button
                      size="sm"
                      asChild
                      style={{
                        height: 28,
                        background: runbook.zoom_call.is_active ? 'var(--destructive)' : 'var(--blue)',
                        color: '#ffffff',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      <a href={runbook.zoom_call.url} target="_blank" rel="noreferrer">
                        <ExternalLink style={{ width: 12, height: 12, marginRight: 5 }} />
                        Join Bridge
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 0', color: 'var(--muted-foreground)', fontSize: 12 }}>
                  No Zoom bridge configured for {runbook.name}. Add the meeting URL below.
                </div>
              )}

              <div>
                <Button size="sm" variant="outline" onClick={openEditZoom} style={{ fontSize: 11, gap: 6 }}>
                  <Edit2 style={{ width: 12, height: 12 }} />
                  Configure Zoom Call
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3️⃣ VM IP LIST PANEL */}
      {activeTab === 'vms' && (
        <section className="data-panel">
          <div className="data-panel-heading">
            <div className="provider-symbol" style={{ background: 'var(--green-surface)', color: 'var(--success)' }}>
              <Server style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <span className="eyebrow">SITE OPERATIONS RUNBOOK</span>
              <h2>VM IP List</h2>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Button size="sm" variant="outline" onClick={openAddVm} style={{ gap: 6, fontSize: 11 }}>
                <Plus style={{ width: 13, height: 13 }} />
                Add VM
              </Button>
            </div>
          </div>

          <div className="data-panel-toolbar">
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              Master nodes, bastions, and jump host IP addresses with 1-click SSH copy
            </span>
          </div>

          {runbook.vm_ips.length === 0 ? (
            <div className="source-empty" style={{ minHeight: 180, padding: 30 }}>
              <Server style={{ width: 32, height: 32, color: 'var(--muted-foreground)', opacity: 0.6 }} />
              <h3 style={{ fontSize: 15, margin: '14px 0 4px', color: 'var(--foreground)' }}>
                No VM IP records configured
              </h3>
              <p style={{ fontSize: 11, maxWidth: 320, color: 'var(--muted-foreground)' }}>
                Store master nodes, RMS servers, and database host IPs for fast SSH access during triage.
              </p>
              <Button size="sm" variant="outline" onClick={openAddVm} style={{ gap: 6 }}>
                <Plus style={{ width: 13, height: 13 }} />
                Add VM
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      textTransform: 'uppercase',
                    }}
                  >
                    <th style={{ padding: '12px 20px' }}>Node / Host Title</th>
                    <th style={{ padding: '12px 16px' }}>Role</th>
                    <th style={{ padding: '12px 16px' }}>IP Address</th>
                    <th style={{ padding: '12px 16px' }}>SSH Quick Command</th>
                    <th style={{ padding: '12px 20px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runbook.vm_ips.map(vm => {
                    const sshCmd = vm.ssh_command || `ssh ${vm.ip_address}`;
                    return (
                      <tr
                        key={vm.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <td style={{ padding: '12px 20px', fontWeight: 500, color: 'var(--foreground)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <Server style={{ width: 14, height: 14, color: 'var(--muted-foreground)' }} />
                              <span>{vm.title}</span>
                            </div>
                            {vm.notes && (
                              <span style={{ fontSize: 10, color: 'var(--muted-foreground)', paddingLeft: 21 }}>
                                {vm.notes}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'var(--secondary)',
                              border: '1px solid var(--border)',
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--foreground)',
                            }}
                          >
                            {vm.role || 'Node'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: 'var(--foreground)' }}>{vm.ip_address}</span>
                            <button
                              onClick={() => handleCopy(vm.ip_address, `ip-${vm.id}`)}
                              title="Copy IP"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--muted-foreground)',
                                cursor: 'pointer',
                                padding: 2,
                              }}
                            >
                              {copiedId === `ip-${vm.id}` ? (
                                <Check style={{ width: 12, height: 12, color: 'var(--success)' }} />
                              ) : (
                                <Copy style={{ width: 12, height: 12 }} />
                              )}
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              background: 'var(--secondary)',
                              padding: '3px 8px',
                              borderRadius: 4,
                              border: '1px solid var(--border)',
                            }}
                          >
                            <Terminal style={{ width: 11, height: 11, color: 'var(--blue)' }} />
                            <code style={{ color: 'var(--foreground)' }}>{sshCmd}</code>
                            <button
                              onClick={() => handleCopy(sshCmd, `ssh-${vm.id}`)}
                              title="Copy SSH Command"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--muted-foreground)',
                                cursor: 'pointer',
                                padding: 2,
                              }}
                            >
                              {copiedId === `ssh-${vm.id}` ? (
                                <Check style={{ width: 12, height: 12, color: 'var(--success)' }} />
                              ) : (
                                <Copy style={{ width: 12, height: 12 }} />
                              )}
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Button size="sm" variant="ghost" onClick={() => openEditVm(vm)} style={{ padding: 6, height: 28 }}>
                              <Edit2 style={{ width: 12, height: 12 }} />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteVm(vm.id)} style={{ padding: 6, height: 28, color: 'var(--destructive)' }}>
                              <Trash2 style={{ width: 12, height: 12 }} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 4️⃣ SLACK CHANNEL PANEL */}
      {activeTab === 'slack' && (
        <section className="data-panel">
          <div className="data-panel-heading">
            <div className="provider-symbol" style={{ background: 'var(--blue-surface)', color: 'var(--blue)' }}>
              <MessageSquare style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <span className="eyebrow">SITE OPERATIONS RUNBOOK</span>
              <h2>Slack Channel</h2>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  background: runbook.slack?.is_configured ? 'var(--blue)' : 'var(--secondary)',
                  color: runbook.slack?.is_configured ? '#ffffff' : 'var(--muted-foreground)',
                }}
              >
                {runbook.slack?.is_configured ? 'LINKED' : 'NOT CONFIGURED'}
              </span>
            </div>
          </div>

          <div style={{ padding: 24, maxWidth: 650 }}>
            <div
              style={{
                padding: 20,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>
                  {runbook.slack?.channel_name || 'Slack Ops Channel'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                  {runbook.slack?.is_configured
                    ? 'Direct triage channel linked for this site.'
                    : 'No Slack channel configured.'}
                </p>
              </div>

              {runbook.slack?.channel_url ? (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 6,
                    background: 'var(--secondary)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--foreground)' }}>
                    {runbook.slack.channel_url}
                  </span>
                  <Button
                    size="sm"
                    asChild
                    style={{
                      height: 28,
                      background: 'var(--blue)',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    <a href={runbook.slack.channel_url} target="_blank" rel="noreferrer">
                      <ExternalLink style={{ width: 12, height: 12, marginRight: 5 }} />
                      Open Slack
                    </a>
                  </Button>
                </div>
              ) : (
                <div style={{ padding: '12px 0', color: 'var(--muted-foreground)', fontSize: 12 }}>
                  No deep-link channel configured for {runbook.name}. Add the triage channel URL below.
                </div>
              )}

              <div>
                <Button size="sm" variant="outline" onClick={openEditSlack} style={{ fontSize: 11, gap: 6 }}>
                  <Edit2 style={{ width: 12, height: 12 }} />
                  Configure Slack Channel
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 5️⃣ HANDOVERS & DEPLOYMENTS PANEL */}
      {activeTab === 'handovers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Recent Deployments */}
          <section className="data-panel">
            <div className="data-panel-heading">
              <div className="provider-symbol" style={{ background: 'var(--yellow-surface)', color: 'var(--yellow)' }}>
                <History style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <span className="eyebrow">SOFTWARE RELEASES</span>
                <h2>Recent Deployments</h2>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Button size="sm" variant="outline" onClick={openAddDep} style={{ gap: 6, fontSize: 11 }}>
                  <Plus style={{ width: 12, height: 12 }} />
                  Record Deployment
                </Button>
              </div>
            </div>

            {runbook.deployments.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                No deployment records on file for {runbook.name}.
              </div>
            ) : (
              <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {runbook.deployments.map(dep => (
                  <div
                    key={dep.id}
                    style={{
                      padding: 14,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12.5, color: 'var(--foreground)' }}>
                        {dep.version}
                      </span>
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: 4,
                          fontSize: 9.5,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          background: dep.status === 'Success' ? 'var(--success)' : dep.status === 'Failed' ? 'var(--destructive)' : 'var(--yellow)',
                          color: '#ffffff',
                        }}
                      >
                        {dep.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10.5, color: 'var(--muted-foreground)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <User style={{ width: 11, height: 11 }} />
                        {dep.deployed_by}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock style={{ width: 11, height: 11 }} />
                        {new Date(dep.deployed_at).toLocaleDateString()}
                      </span>
                    </div>
                    {dep.notes && (
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--foreground)' }}>
                        {dep.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Shift Handovers */}
          <section className="data-panel">
            <div className="data-panel-heading">
              <div className="provider-symbol" style={{ background: 'var(--orange-surface)', color: 'var(--soft-orange)' }}>
                <Terminal style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <span className="eyebrow">OPERATIONS SHIFTS</span>
                <h2>Shift Handover Notes</h2>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Button size="sm" variant="outline" onClick={openAddHandover} style={{ gap: 6, fontSize: 11 }}>
                  <Plus style={{ width: 12, height: 12 }} />
                  New Handover
                </Button>
              </div>
            </div>

            {runbook.handovers.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                No shift handovers on file for {runbook.name}.
              </div>
            ) : (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {runbook.handovers.map(ho => (
                  <div
                    key={ho.id}
                    style={{
                      padding: 16,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'var(--secondary)',
                            border: '1px solid var(--border)',
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--foreground)',
                          }}
                        >
                          {ho.shift} Shift
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
                          {ho.author}
                        </span>
                      </div>
                      <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(ho.created_at).toLocaleString()}
                      </span>
                    </div>

                    {ho.commands_used && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                          Commands Executed:
                        </span>
                        <pre
                          style={{
                            margin: 0,
                            padding: '8px 10px',
                            background: 'var(--secondary)',
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: 'var(--blue)',
                            overflowX: 'auto',
                          }}
                        >
                          {ho.commands_used}
                        </pre>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 4 }}>
                      {ho.what_is_working && (
                        <div style={{ fontSize: 11.5 }}>
                          <span style={{ fontSize: 9.5, color: 'var(--success)', fontFamily: 'var(--font-mono)', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                            WHAT IS WORKING:
                          </span>
                          <span style={{ color: 'var(--foreground)' }}>{ho.what_is_working}</span>
                        </div>
                      )}
                      {ho.open_questions && (
                        <div style={{ fontSize: 11.5 }}>
                          <span style={{ fontSize: 9.5, color: 'var(--yellow)', fontFamily: 'var(--font-mono)', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                            OPEN QUESTIONS:
                          </span>
                          <span style={{ color: 'var(--foreground)' }}>{ho.open_questions}</span>
                        </div>
                      )}
                      {ho.cautions && (
                        <div style={{ fontSize: 11.5 }}>
                          <span style={{ fontSize: 9.5, color: 'var(--destructive)', fontFamily: 'var(--font-mono)', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                            CAUTIONS / DO NOT TOUCH:
                          </span>
                          <span style={{ color: 'var(--foreground)' }}>{ho.cautions}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 6️⃣ SITE CONFIGS PANEL */}
      {activeTab === 'configs' && (
        <section className="data-panel">
          <div className="data-panel-heading">
            <div className="provider-symbol" style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}>
              <Settings style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <span className="eyebrow">SITE OPERATIONS RUNBOOK</span>
              <h2>Site Config History</h2>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Button size="sm" variant="outline" onClick={openAddConfig} style={{ gap: 6, fontSize: 11 }}>
                <Plus style={{ width: 13, height: 13 }} />
                Add Config
              </Button>
            </div>
          </div>

          <div className="data-panel-toolbar">
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              Append-only audit log of configuration keys, threshold overrides, and site flags
            </span>
          </div>

          {runbook.site_configs.length === 0 ? (
            <div className="source-empty" style={{ minHeight: 180, padding: 30 }}>
              <Settings style={{ width: 32, height: 32, color: 'var(--muted-foreground)', opacity: 0.6 }} />
              <h3 style={{ fontSize: 15, margin: '14px 0 4px', color: 'var(--foreground)' }}>
                No site configuration history recorded
              </h3>
              <p style={{ fontSize: 11, maxWidth: 320, color: 'var(--muted-foreground)' }}>
                Record parameters such as max queue tasks, bot limits, or sync flags for {runbook.name}.
              </p>
              <Button size="sm" variant="outline" onClick={openAddConfig} style={{ gap: 6 }}>
                <Plus style={{ width: 13, height: 13 }} />
                Add Config
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      textTransform: 'uppercase',
                    }}
                  >
                    <th style={{ padding: '12px 20px' }}>Configuration Key</th>
                    <th style={{ padding: '12px 16px' }}>Value</th>
                    <th style={{ padding: '12px 16px' }}>Logged At</th>
                    <th style={{ padding: '12px 16px' }}>Author</th>
                    <th style={{ padding: '12px 20px' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {runbook.site_configs.map(cfg => (
                    <tr
                      key={cfg.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <td style={{ padding: '12px 20px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--blue)' }}>
                        {cfg.config_key}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)' }}>
                        <code style={{ background: 'var(--secondary)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                          {cfg.config_value}
                        </code>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                        {new Date(cfg.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--foreground)' }}>
                        {cfg.updated_by}
                      </td>
                      <td style={{ padding: '12px 20px', color: 'var(--muted-foreground)', fontSize: 11 }}>
                        {cfg.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ======================================================== */}
      {/* DIALOGS FOR INLINE ADD / EDIT (THEMED LIGHT & DARK)      */}
      {/* ======================================================== */}
      {modalType && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(2px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              width: '100%',
              maxWidth: 480,
              padding: 24,
              boxShadow: 'var(--shadow)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>
                {modalType === 'link_add' && 'Add Monitoring Link'}
                {modalType === 'link_edit' && 'Edit Monitoring Link'}
                {modalType === 'vm_add' && 'Add VM IP Entry'}
                {modalType === 'vm_edit' && 'Edit VM IP Entry'}
                {modalType === 'zoom_edit' && 'Configure Incident Zoom Bridge'}
                {modalType === 'slack_edit' && 'Configure Slack Channel'}
                {modalType === 'dep_add' && 'Record Deployment'}
                {modalType === 'handover_add' && 'Add Shift Handover'}
                {modalType === 'config_add' && 'Record Config History'}
              </h3>
              <button
                onClick={closeModal}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {errorMsg && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'var(--orange-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--destructive)',
                  fontSize: 11.5,
                  marginBottom: 14,
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* FORM: LINK */}
            {(modalType === 'link_add' || modalType === 'link_edit') && (
              <form onSubmit={handleSaveLink} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Link Title
                  </label>
                  <Input
                    placeholder="e.g. Grafana Dashboard, Kibana Logs"
                    value={linkTitle}
                    onChange={e => setLinkTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Category
                  </label>
                  <Input
                    placeholder="e.g. Metrics, Logs, Alerts, RMS"
                    value={linkCategory}
                    onChange={e => setLinkCategory(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Link'}
                  </Button>
                </div>
              </form>
            )}

            {/* FORM: VM IP */}
            {(modalType === 'vm_add' || modalType === 'vm_edit') && (
              <form onSubmit={handleSaveVm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Server / Host Title
                  </label>
                  <Input
                    placeholder="e.g. Master Node 1, Bastion Jump"
                    value={vmTitle}
                    onChange={e => setVmTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    IP Address
                  </label>
                  <Input
                    placeholder="e.g. 10.20.104.55"
                    value={vmIp}
                    onChange={e => setVmIp(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Role
                  </label>
                  <Input
                    placeholder="e.g. RMS Server, Database, Gateway, Worker"
                    value={vmRole}
                    onChange={e => setVmRole(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Custom SSH Command (Optional)
                  </label>
                  <Input
                    placeholder="e.g. ssh admin@10.20.104.55"
                    value={vmSsh}
                    onChange={e => setVmSsh(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Notes (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Production cluster primary"
                    value={vmNotes}
                    onChange={e => setVmNotes(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save VM'}
                  </Button>
                </div>
              </form>
            )}

            {/* FORM: ZOOM */}
            {modalType === 'zoom_edit' && (
              <form onSubmit={handleSaveZoom} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Meeting URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://zoom.us/j/123456789"
                    value={zoomUrl}
                    onChange={e => setZoomUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Topic / Channel Name
                  </label>
                  <Input
                    placeholder="e.g. Sev 1 War Room"
                    value={zoomTopic}
                    onChange={e => setZoomTopic(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  <input
                    type="checkbox"
                    id="zoomActiveCheck"
                    checked={zoomActive}
                    onChange={e => setZoomActive(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <label htmlFor="zoomActiveCheck" style={{ fontSize: 12, cursor: 'pointer', color: 'var(--foreground)' }}>
                    Bridge is active right now (Call in progress)
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Zoom Settings'}
                  </Button>
                </div>
              </form>
            )}

            {/* FORM: SLACK */}
            {modalType === 'slack_edit' && (
              <form onSubmit={handleSaveSlack} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Channel Name
                  </label>
                  <Input
                    placeholder="e.g. #cac-ops-kenco"
                    value={slackName}
                    onChange={e => setSlackName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Slack Channel Deep-link URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://slack.com/app_redirect?channel=..."
                    value={slackUrl}
                    onChange={e => setSlackUrl(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Slack Settings'}
                  </Button>
                </div>
              </form>
            )}

            {/* FORM: DEPLOYMENT */}
            {modalType === 'dep_add' && (
              <form onSubmit={handleSaveDep} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Software Version
                  </label>
                  <Input
                    placeholder="e.g. v4.2.1-hotfix"
                    value={depVersion}
                    onChange={e => setDepVersion(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Deployed By
                  </label>
                  <Input
                    placeholder="e.g. DevOps, SRE Team"
                    value={depBy}
                    onChange={e => setDepBy(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Status
                  </label>
                  <select
                    value={depStatus}
                    onChange={e => setDepStatus(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '0 10px',
                      color: 'var(--foreground)',
                      fontSize: 12,
                    }}
                  >
                    <option value="Success">Success</option>
                    <option value="Failed">Failed</option>
                    <option value="Rolled Back">Rolled Back</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Notes (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Fixes RMS sync race condition"
                    value={depNotes}
                    onChange={e => setDepNotes(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Record'}
                  </Button>
                </div>
              </form>
            )}

            {/* FORM: HANDOVER */}
            {modalType === 'handover_add' && (
              <form onSubmit={handleSaveHandover} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                      Author
                    </label>
                    <Input
                      placeholder="e.g. Shift Lead"
                      value={hoAuthor}
                      onChange={e => setHoAuthor(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                      Shift
                    </label>
                    <select
                      value={hoShift}
                      onChange={e => setHoShift(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '0 10px',
                        color: 'var(--foreground)',
                        fontSize: 12,
                      }}
                    >
                      <option value="Morning">Morning</option>
                      <option value="Evening">Evening</option>
                      <option value="Night">Night</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Commands Used
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. systemctl restart rms-sync; docker ps"
                    value={hoCommands}
                    onChange={e => setHoCommands(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      color: 'var(--foreground)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    What Is Working
                  </label>
                  <Input
                    placeholder="e.g. Ingestion active, orders processing"
                    value={hoWorking}
                    onChange={e => setHoWorking(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Open Questions
                  </label>
                  <Input
                    placeholder="e.g. Waiting on client response for network latency"
                    value={hoQuestions}
                    onChange={e => setHoQuestions(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                    Cautions / Do Not Touch
                  </label>
                  <Input
                    placeholder="e.g. Do not reboot node-2 until queue is drained"
                    value={hoCautions}
                    onChange={e => setHoCautions(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Add Handover'}
                  </Button>
                </div>
              </form>
            )}

            {/* FORM: CONFIG (SINGLE OR BULK ENV AUTO-DETECT) */}
            {modalType === 'config_add' && (
              <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Mode Selector */}
                <div
                  style={{
                    display: 'flex',
                    background: 'var(--secondary)',
                    padding: 3,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    gap: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setCfgPasteMode('single')}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: cfgPasteMode === 'single' ? 'var(--card)' : 'transparent',
                      color: cfgPasteMode === 'single' ? 'var(--foreground)' : 'var(--muted-foreground)',
                      boxShadow: cfgPasteMode === 'single' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    Single Key / Value
                  </button>
                  <button
                    type="button"
                    onClick={() => setCfgPasteMode('bulk')}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: cfgPasteMode === 'bulk' ? 'var(--card)' : 'transparent',
                      color: cfgPasteMode === 'bulk' ? 'var(--foreground)' : 'var(--muted-foreground)',
                      boxShadow: cfgPasteMode === 'bulk' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    Paste .env (Auto-detect)
                  </button>
                </div>

                {cfgPasteMode === 'single' ? (
                  <>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                        Config Key
                      </label>
                      <Input
                        placeholder="e.g. MAX_CONCURRENT_TASKS"
                        value={cfgKey}
                        onChange={e => {
                          const val = e.target.value;
                          // If user accidentally pastes a full KEY=VALUE or multi-line block into the key field, auto-switch to bulk!
                          if (val.includes('=') || val.includes('\n')) {
                            setCfgPasteMode('bulk');
                            setCfgBulkRaw(val);
                            setCfgParsedPairs(parseEnvText(val));
                          } else {
                            setCfgKey(val);
                          }
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                        Config Value
                      </label>
                      <Input
                        placeholder="e.g. 50"
                        value={cfgValue}
                        onChange={e => setCfgValue(e.target.value)}
                        required
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)' }}>
                          Paste Environment Variables (.env / docker-compose / render / vercel)
                        </label>
                        {cfgParsedPairs.length > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              background: 'var(--success)',
                              color: '#ffffff',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            ✓ {cfgParsedPairs.length} variables detected
                          </span>
                        )}
                      </div>
                      <textarea
                        rows={7}
                        placeholder={`# Paste your .env file or variables here (like Vercel / Render):
DB_HOST=10.20.15.42
MAX_CONCURRENCY=100
API_SECRET="sk_live_xyz987"
export CACHE_TTL=3600`}
                        value={cfgBulkRaw}
                        onChange={e => {
                          const text = e.target.value;
                          setCfgBulkRaw(text);
                          setCfgParsedPairs(parseEnvText(text));
                        }}
                        style={{
                          width: '100%',
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          padding: '10px',
                          color: 'var(--foreground)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11.5,
                          lineHeight: '1.5',
                        }}
                        required
                      />
                    </div>

                    {/* Live Parsed Preview Table like Vercel */}
                    {cfgParsedPairs.length > 0 && (
                      <div
                        style={{
                          maxHeight: 160,
                          overflowY: 'auto',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--secondary)',
                        }}
                      >
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', fontSize: 9, fontFamily: 'var(--font-mono)' }}>
                              <th style={{ padding: '6px 10px' }}>KEY</th>
                              <th style={{ padding: '6px 10px' }}>VALUE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cfgParsedPairs.map((p, idx) => (
                              <tr key={idx} style={{ borderBottom: idx < cfgParsedPairs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--blue)' }}>
                                  {p.key}
                                </td>
                                <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', color: 'var(--foreground)' }}>
                                  {p.value}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                      Logged By
                    </label>
                    <Input
                      placeholder="e.g. Admin / SRE Lead"
                      value={cfgAuthor}
                      onChange={e => setCfgAuthor(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                      Notes (Optional)
                    </label>
                    <Input
                      placeholder="e.g. Imported from staging config"
                      value={cfgNotes}
                      onChange={e => setCfgNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving || (cfgPasteMode === 'bulk' && cfgParsedPairs.length === 0)}>
                    {saving
                      ? 'Saving…'
                      : cfgPasteMode === 'bulk'
                      ? `Save ${cfgParsedPairs.length} Config${cfgParsedPairs.length === 1 ? '' : 's'}`
                      : 'Record Config'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

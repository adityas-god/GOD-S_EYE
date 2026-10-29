import React, { useState, useEffect, useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Video,
  Radio,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Plus,
  X,
  MapPin,
  Flame,
  Clock,
  ArrowLeft,
  ArrowUpRight,
  ArrowRight,
  Search,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  User,
  Building2,
  Calendar,
  SlidersHorizontal,
  LayoutGrid,
  List,
  ChevronDown,
  RefreshCw,
  Edit2,
  Bell,
  Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ZoomIcon } from '@/components/zoom-icon';
import {
  fetchActiveWarRooms,
  createActiveWarRoom,
  removeActiveWarRoom,
  updateActiveWarRoom,
  type WarRoom,
} from '@/lib/war-rooms';
import { sitesQueryOptions, type Site } from '@/lib/sites';
import {
  sfFetchLiveCasesOverview,
  type SFCase,
  detectSeverity,
  detectCaseCategory,
  compileSites,
  findBestSiteForCase,
  areSameSite,
  getAssigneeDisplayName,
  isLiveOpenCase,
  isOpenAlert,
  isAlertCase,
} from '@/integrations/salesforce/client';

export const Route = createFileRoute('/war-rooms')({
  head: () => ({
    meta: [
      { title: 'Active War Rooms — Sitepulse' },
      { name: 'description', content: 'Active incident triage bridges, site performance analytics, and incident flow telemetry.' },
    ],
  }),
  component: WarRoomsPage,
});

// Convert a Date to "YYYY-MM-DDTHH:mm" for datetime-local input fields
function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

// Formats date nicely (e.g. "Oct 28, 08:30 PM")
function formatDisplayDateTime(isoStr?: string | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoStr || '—';
  }
}

// Format duration between start and end dates
function formatDurationBetween(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    const diffHours = Math.max(0, (e - s) / (1000 * 60 * 60));
    if (diffHours < 1) {
      return `${Math.round(diffHours * 60)}m window`;
    }
    if (diffHours >= 24) {
      const days = (diffHours / 24).toFixed(1).replace('.0', '');
      return `${days}d window`;
    }
    return `${diffHours.toFixed(1).replace('.0', '')}h window`;
  } catch {
    return 'Active window';
  }
}

// Safely extracts creation timestamp in ms from any SF case
function getCaseCreatedMs(c: SFCase): number {
  if (!c) return 0;
  const raw = c as Record<string, unknown>;
  const dateVal =
    c.CreatedDate ||
    raw.created_date ||
    raw.created_at ||
    raw.Created_Date_Time__c ||
    raw.CreatedDate__c ||
    raw.CreatedTime ||
    c.LastModifiedDate;
  if (!dateVal) return 0;
  const t = new Date(String(dateVal)).getTime();
  return isNaN(t) ? 0 : t;
}

// Compute velocity trend statistics and chart time buckets for incidents or alerts
function computeTrendData(
  tickets: SFCase[],
  warRoom: WarRoom | null,
  primaryColor: string
) {
  if (!warRoom || tickets.length === 0) {
    return {
      trend: 'STEADY' as 'UPTREND' | 'DOWNTREND' | 'STEADY',
      trendLabel: 'STABLE / NO INFLOW',
      trendColor: '#22c55e',
      firstHalfCount: 0,
      secondHalfCount: 0,
      chartBuckets: [] as { label: string; count: number; timestamp: number }[],
    };
  }

  const startIso = warRoom.startDate || warRoom.startedAt;
  const startMs = startIso ? new Date(startIso).getTime() : Date.now() - 24 * 3600000;
  const nowMs = Date.now();
  const durationMs = Math.max(1000 * 60 * 60, nowMs - startMs);

  const BUCKET_COUNT = 6;
  const bucketInterval = durationMs / BUCKET_COUNT;
  const buckets: { label: string; count: number; timestamp: number }[] = [];

  for (let i = 0; i < BUCKET_COUNT; i++) {
    const bStart = startMs + i * bucketInterval;
    const bEnd = bStart + bucketInterval;
    const midTime = new Date(bStart + bucketInterval / 2);

    const label = midTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    });

    const count = tickets.filter(c => {
      const t = getCaseCreatedMs(c);
      if (t === 0) return false;
      return t >= bStart && (i === BUCKET_COUNT - 1 ? t <= bEnd : t < bEnd);
    }).length;

    buckets.push({ label, count, timestamp: bStart });
  }

  const half = Math.floor(BUCKET_COUNT / 2);
  const firstHalfCount = buckets.slice(0, half).reduce((sum, b) => sum + b.count, 0);
  const secondHalfCount = buckets.slice(half).reduce((sum, b) => sum + b.count, 0);

  let trend: 'UPTREND' | 'DOWNTREND' | 'STEADY' = 'STEADY';
  let trendLabel = 'STEADY INFLOW';
  let trendColor = '#3b82f6';

  if (secondHalfCount > firstHalfCount) {
    trend = 'UPTREND';
    trendLabel = 'UPTREND (INCREASING)';
    trendColor = primaryColor;
  } else if (secondHalfCount < firstHalfCount) {
    trend = 'DOWNTREND';
    trendLabel = 'DOWN TREND (STABILIZING)';
    trendColor = '#22c55e';
  }

  return {
    trend,
    trendLabel,
    trendColor,
    firstHalfCount,
    secondHalfCount,
    chartBuckets: buckets,
  };
}

export function WarRoomsPage() {
  const queryClient = useQueryClient();

  // Navigation state: null = Overview site panels view; non-null = War Room detail view
  const [selectedWarRoom, setSelectedWarRoom] = useState<WarRoom | null>(null);

  // Active bucket in War Room detail view: 'incidents' | 'alerts'
  const [activeBucket, setActiveBucket] = useState<'incidents' | 'alerts'>('incidents');

  // Form toggle & copy feedback
  const [isAdding, setIsAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Directory filters
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'SEV 1' | 'SEV 2'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Detail view tickets tab: 'open' | 'war_room' | 'last_24h'
  const [activeTicketTab, setActiveTicketTab] = useState<'open' | 'war_room' | 'last_24h'>('open');
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketSeveritySubFilter, setTicketSeveritySubFilter] = useState<'all' | 'sev1' | 'sev2'>('all');

  // Form State (Start Date & End Date required)
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [siteName, setSiteName] = useState('');
  const [severity, setSeverity] = useState('SEV 1');
  const [lead, setLead] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState(() => toLocalDatetimeString(new Date()));
  const [endDate, setEndDate] = useState(() =>
    toLocalDatetimeString(new Date(Date.now() + 24 * 60 * 60 * 1000))
  );

  // Reset form with current timestamps
  const resetForm = () => {
    setName('');
    setUrl('');
    setSiteName('');
    setSeverity('SEV 1');
    setLead('');
    setNotes('');
    setStartDate(toLocalDatetimeString(new Date()));
    setEndDate(toLocalDatetimeString(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  };

  // Fetch sites for site dropdown and matching
  const { data: sites = [] } = useQuery(sitesQueryOptions());
  const compiledSitesList = useMemo(() => compileSites(sites), [sites]);

  // Fetch active war rooms
  const { data: warRooms = [], isLoading: warRoomsLoading, isFetching: warRoomsFetching, refetch: refetchWarRooms } = useQuery({
    queryKey: ['active-war-rooms'],
    queryFn: fetchActiveWarRooms,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Keep selectedWarRoom synchronized if activeWarRooms updates
  useEffect(() => {
    if (selectedWarRoom) {
      const updated = warRooms.find(r => r.id === selectedWarRoom.id);
      if (updated) {
        setSelectedWarRoom(updated);
      }
    }
  }, [warRooms, selectedWarRoom]);

  // Cross-tab real-time listener
  useEffect(() => {
    const handleChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ['active-war-rooms'] });
    };
    window.addEventListener('war-rooms-changed', handleChanged);
    return () => window.removeEventListener('war-rooms-changed', handleChanged);
  }, [queryClient]);

  // Fetch live Salesforce overview tickets
  const { data: sfOverview, refetch: refetchOverview } = useQuery({
    queryKey: ['salesforce-overview'],
    queryFn: () => sfFetchLiveCasesOverview(),
    staleTime: 60_000,
  });

  // If a war room has a site name, also query site-specific cases
  const { data: siteCasesData } = useQuery({
    queryKey: ['cases-site', selectedWarRoom?.siteName],
    queryFn: async () => {
      if (!selectedWarRoom?.siteName) return null;
      try {
        const res = await fetch(`/api/cases/site/${encodeURIComponent(selectedWarRoom.siteName)}`);
        if (res.ok) {
          return await res.json();
        }
      } catch {}
      return null;
    },
    enabled: Boolean(selectedWarRoom?.siteName),
    staleTime: 60_000,
  });

  // Create Mutation with Instant Optimistic Update
  const addMutation = useMutation({
    mutationFn: createActiveWarRoom,
    onMutate: async (newRoomData) => {
      await queryClient.cancelQueries({ queryKey: ['active-war-rooms'] });
      const previous = queryClient.getQueryData<WarRoom[]>(['active-war-rooms']) || [];
      const optimisticRoom: WarRoom = {
        id: `wr-opt-${Date.now()}`,
        name: newRoomData.name,
        url: newRoomData.url,
        siteName: newRoomData.siteName || null,
        siteId: newRoomData.siteId || null,
        severity: newRoomData.severity || 'SEV 1',
        lead: newRoomData.lead || null,
        notes: newRoomData.notes || null,
        startedAt: newRoomData.startDate,
        startDate: newRoomData.startDate,
        endDate: newRoomData.endDate,
      };
      queryClient.setQueryData<WarRoom[]>(['active-war-rooms'], [optimisticRoom, ...previous]);
      resetForm();
      setIsAdding(false);
      toast.success(`War Room created: ${newRoomData.name}`);
      return { previous, tempId: optimisticRoom.id };
    },
    onSuccess: (savedRoom, _vars, context) => {
      queryClient.setQueryData<WarRoom[]>(['active-war-rooms'], (old = []) => [
        savedRoom,
        ...old.filter(r => r.id !== context?.tempId && r.id !== savedRoom.id),
      ]);
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['active-war-rooms'], context.previous);
      }
      toast.error('Failed to create war room');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['active-war-rooms'] });
    },
  });

  // Remove Mutation with Instant Optimistic Update
  const removeMutation = useMutation({
    mutationFn: removeActiveWarRoom,
    onMutate: async (idToDelete: string) => {
      await queryClient.cancelQueries({ queryKey: ['active-war-rooms'] });
      const previous = queryClient.getQueryData<WarRoom[]>(['active-war-rooms']) || [];
      const updated = previous.filter(r => r.id !== idToDelete);
      queryClient.setQueryData<WarRoom[]>(['active-war-rooms'], updated);
      if (selectedWarRoom?.id === idToDelete) {
        setSelectedWarRoom(null);
      }
      toast.success('War room removed');
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['active-war-rooms'], context.previous);
      }
      toast.error('Failed to remove war room');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['active-war-rooms'] });
    },
  });

  // Editing War Room Details Modal State (Dates, Call Link URL, Name, Notes)
  const [editingRoom, setEditingRoom] = useState<WarRoom | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const openEditModal = (room: WarRoom) => {
    setEditingRoom(room);
    setEditName(room.name || '');
    setEditUrl(room.url || '');
    setEditStartDate(toLocalDatetimeString(new Date(room.startDate || room.startedAt)));
    setEditEndDate(toLocalDatetimeString(new Date(room.endDate)));
    setEditNotes(room.notes || '');
  };

  const closeEditModal = () => {
    setEditingRoom(null);
  };

  const openEditDatesModal = openEditModal;
  const closeEditDatesModal = closeEditModal;

  // Update Details & Call Link Mutation with Instant Optimistic Update
  const updateRoomMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      url,
      startDate,
      endDate,
      notes,
    }: {
      id: string;
      name?: string;
      url?: string;
      startDate: string;
      endDate: string;
      notes?: string;
    }) => {
      let finalUrl = url?.trim();
      if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }
      return updateActiveWarRoom(id, {
        name: name?.trim(),
        url: finalUrl,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        startedAt: new Date(startDate).toISOString(),
        notes: notes?.trim() !== undefined ? notes.trim() : undefined,
      });
    },
    onMutate: async ({ id, name, url, startDate, endDate, notes }) => {
      await queryClient.cancelQueries({ queryKey: ['active-war-rooms'] });
      const previous = queryClient.getQueryData<WarRoom[]>(['active-war-rooms']) || [];
      const updatedStartIso = new Date(startDate).toISOString();
      const updatedEndIso = new Date(endDate).toISOString();
      let finalUrl = url?.trim();
      if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }
      const updated = previous.map(r => {
        if (r.id === id) {
          return {
            ...r,
            name: name?.trim() || r.name,
            url: finalUrl || r.url,
            startDate: updatedStartIso,
            endDate: updatedEndIso,
            startedAt: updatedStartIso,
            notes: notes !== undefined ? notes : r.notes,
          };
        }
        return r;
      });
      queryClient.setQueryData<WarRoom[]>(['active-war-rooms'], updated);
      if (selectedWarRoom?.id === id) {
        setSelectedWarRoom(prev => prev ? {
          ...prev,
          name: name?.trim() || prev.name,
          url: finalUrl || prev.url,
          startDate: updatedStartIso,
          endDate: updatedEndIso,
          startedAt: updatedStartIso,
          notes: notes !== undefined ? notes : prev.notes,
        } : null);
      }
      closeEditModal();
      toast.success('War room call link & details updated successfully');
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['active-war-rooms'], context.previous);
      }
      toast.error('Failed to update war room');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['active-war-rooms'] });
    },
  });

  const updateDatesMutation = updateRoomMutation;

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;
    if (!editUrl.trim()) {
      toast.error('War room meeting call link / URL is required');
      return;
    }
    if (!editStartDate || !editEndDate) {
      toast.error('Both Start Date and End Date are required');
      return;
    }
    const sMs = new Date(editStartDate).getTime();
    const eMs = new Date(editEndDate).getTime();
    if (isNaN(sMs) || isNaN(eMs)) {
      toast.error('Please enter valid dates');
      return;
    }
    if (eMs < sMs) {
      toast.error('End Date cannot be earlier than Start Date');
      return;
    }
    updateRoomMutation.mutate({
      id: editingRoom.id,
      name: editName.trim() || editingRoom.name,
      url: editUrl.trim(),
      startDate: editStartDate,
      endDate: editEndDate,
      notes: editNotes.trim(),
    });
  };

  const handleSaveDates = handleSaveDetails;

  const handleCopy = (link: string, id: string) => {
    try {
      void navigator.clipboard.writeText(link);
      setCopiedId(id);
      toast.success('War room link copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  const handleRefresh = async () => {
    await Promise.all([refetchWarRooms(), refetchOverview()]);
    toast.success('War room telemetry refreshed');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a war room name');
      return;
    }
    if (!url.trim()) {
      toast.error('Please enter a valid war room meeting URL');
      return;
    }
    if (!startDate) {
      toast.error('Start Date is required');
      return;
    }
    if (!endDate) {
      toast.error('End Date is required');
      return;
    }

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (isNaN(startMs) || isNaN(endMs)) {
      toast.error('Please enter valid Start and End dates');
      return;
    }
    if (endMs < startMs) {
      toast.error('End Date cannot be earlier than Start Date');
      return;
    }

    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    const matchedSite = sites.find(
      s => s.name.toLowerCase() === siteName.trim().toLowerCase()
    );

    addMutation.mutate({
      name: name.trim(),
      url: finalUrl,
      siteName: siteName.trim() || null,
      siteId: matchedSite?.id || null,
      severity,
      lead: lead.trim() || null,
      notes: notes.trim() || null,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
    });
  };

  // --------------------------------------------------------------------------
  // Helper: Get Live Open Cases & Alerts for a Given Site
  // --------------------------------------------------------------------------
  const getSiteLiveOpenCases = (targetSiteName?: string | null): SFCase[] => {
    const allLive = [
      ...(sfOverview?.cases || []).filter(isLiveOpenCase),
      ...(sfOverview?.alerts || []).filter(isOpenAlert),
    ];
    if (!targetSiteName) {
      return allLive;
    }
    return allLive.filter(c => {
      const mappedSite = findBestSiteForCase(c, compiledSitesList);
      if (mappedSite && areSameSite(mappedSite, targetSiteName)) return true;
      const candidateNames = [
        c.Snow_Sitename__c,
        c.Site_Name_Customer_Input__c,
        c.Customer_Location__c,
        c.Account_Name__c,
      ].filter(Boolean) as string[];
      return candidateNames.some(cn => areSameSite(cn, targetSiteName));
    });
  };

  // --------------------------------------------------------------------------
  // Aggregated Cases & Alerts Matching the Selected War Room
  // --------------------------------------------------------------------------
  const allCandidateCases = useMemo(() => {
    const list: SFCase[] = [];
    const seen = new Set<string>();

    const addCase = (c: SFCase) => {
      if (!c) return;
      const key = c.Id || c.CaseNumber;
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push(c);
    };

    // Add site-specific cases & alerts from endpoint if available
    if (siteCasesData?.cases && Array.isArray(siteCasesData.cases)) {
      siteCasesData.cases.forEach(addCase);
    }
    if (siteCasesData?.alerts && Array.isArray(siteCasesData.alerts)) {
      siteCasesData.alerts.forEach(addCase);
    }
    if (siteCasesData?.closed && Array.isArray(siteCasesData.closed)) {
      siteCasesData.closed.forEach(addCase);
    }

    // Add org overview cases & alerts
    if (sfOverview?.cases && Array.isArray(sfOverview.cases)) {
      sfOverview.cases.forEach(addCase);
    }
    if (sfOverview?.alerts && Array.isArray(sfOverview.alerts)) {
      sfOverview.alerts.forEach(addCase);
    }
    if (sfOverview?.closedAlerts && Array.isArray(sfOverview.closedAlerts)) {
      sfOverview.closedAlerts.forEach(addCase);
    }

    // If selected war room specifies a siteName, filter candidates to that site
    if (selectedWarRoom?.siteName) {
      const targetSite = selectedWarRoom.siteName;
      return list.filter(c => {
        const mappedSite = findBestSiteForCase(c, compiledSitesList);
        if (mappedSite && areSameSite(mappedSite, targetSite)) return true;
        const candidateNames = [
          c.Snow_Sitename__c,
          c.Site_Name_Customer_Input__c,
          c.Customer_Location__c,
          c.Account_Name__c,
        ].filter(Boolean) as string[];
        return candidateNames.some(cn => areSameSite(cn, targetSite));
      });
    }

    return list;
  }, [siteCasesData, sfOverview, selectedWarRoom, compiledSitesList]);

  // --------------------------------------------------------------------------
  // BUCKETING: STRICT SEPARATION OF INCIDENTS VS ALERTS
  // --------------------------------------------------------------------------
  const candidateIncidents = useMemo(() => {
    return allCandidateCases.filter(c => !isAlertCase(c));
  }, [allCandidateCases]);

  const candidateAlerts = useMemo(() => {
    return allCandidateCases.filter(c => isAlertCase(c));
  }, [allCandidateCases]);

  // 1. Incidents Timeframe Subsets
  const liveOpenIncidents = useMemo(() => {
    return candidateIncidents
      .filter(isLiveOpenCase)
      .sort((a, b) => getCaseCreatedMs(b) - getCaseCreatedMs(a));
  }, [candidateIncidents]);

  const incidentsSinceStart = useMemo(() => {
    if (!selectedWarRoom) return [];
    const startIso = selectedWarRoom.startDate || selectedWarRoom.startedAt;
    const startMs = startIso ? new Date(startIso).getTime() : 0;
    return candidateIncidents
      .filter(c => {
        if (!startMs || isNaN(startMs)) return true;
        const createdMs = getCaseCreatedMs(c);
        if (createdMs === 0) return false;
        return createdMs >= startMs;
      })
      .sort((a, b) => getCaseCreatedMs(b) - getCaseCreatedMs(a));
  }, [candidateIncidents, selectedWarRoom]);

  const incidentsLast24h = useMemo(() => {
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    return candidateIncidents
      .filter(c => {
        const createdMs = getCaseCreatedMs(c);
        if (createdMs === 0) return false;
        return createdMs >= cutoffMs;
      })
      .sort((a, b) => getCaseCreatedMs(b) - getCaseCreatedMs(a));
  }, [candidateIncidents]);

  // 2. Alerts Timeframe Subsets
  const liveOpenAlerts = useMemo(() => {
    return candidateAlerts
      .filter(isOpenAlert)
      .sort((a, b) => getCaseCreatedMs(b) - getCaseCreatedMs(a));
  }, [candidateAlerts]);

  const alertsSinceStart = useMemo(() => {
    if (!selectedWarRoom) return [];
    const startIso = selectedWarRoom.startDate || selectedWarRoom.startedAt;
    const startMs = startIso ? new Date(startIso).getTime() : 0;
    return candidateAlerts
      .filter(c => {
        if (!startMs || isNaN(startMs)) return true;
        const createdMs = getCaseCreatedMs(c);
        if (createdMs === 0) return false;
        return createdMs >= startMs;
      })
      .sort((a, b) => getCaseCreatedMs(b) - getCaseCreatedMs(a));
  }, [candidateAlerts, selectedWarRoom]);

  const alertsLast24h = useMemo(() => {
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    return candidateAlerts
      .filter(c => {
        const createdMs = getCaseCreatedMs(c);
        if (createdMs === 0) return false;
        return createdMs >= cutoffMs;
      })
      .sort((a, b) => getCaseCreatedMs(b) - getCaseCreatedMs(a));
  }, [candidateAlerts]);

  // Combined for top summary indicators
  const liveOpenCasesForSelected = useMemo(() => {
    return [...liveOpenIncidents, ...liveOpenAlerts];
  }, [liveOpenIncidents, liveOpenAlerts]);

  const ticketsSinceStart = useMemo(() => {
    return [...incidentsSinceStart, ...alertsSinceStart];
  }, [incidentsSinceStart, alertsSinceStart]);

  const ticketsLast24h = useMemo(() => {
    return [...incidentsLast24h, ...alertsLast24h];
  }, [incidentsLast24h, alertsLast24h]);

  // Active tickets to display depending on current bucket and tab
  const activeTicketList = useMemo(() => {
    if (activeBucket === 'incidents') {
      if (activeTicketTab === 'open') return liveOpenIncidents;
      if (activeTicketTab === 'war_room') return incidentsSinceStart;
      return incidentsLast24h;
    } else {
      if (activeTicketTab === 'open') return liveOpenAlerts;
      if (activeTicketTab === 'war_room') return alertsSinceStart;
      return alertsLast24h;
    }
  }, [activeBucket, activeTicketTab, liveOpenIncidents, incidentsSinceStart, incidentsLast24h, liveOpenAlerts, alertsSinceStart, alertsLast24h]);

  // Filtered tickets based on search and sub-severity filter
  const filteredTickets = useMemo(() => {
    let list = activeTicketList;

    if (ticketSeveritySubFilter === 'sev1') {
      list = list.filter(c => detectSeverity(c) === 'sev1');
    } else if (ticketSeveritySubFilter === 'sev2') {
      list = list.filter(c => {
        const s = detectSeverity(c);
        return s === 'sev2' || (s as string) === 'sev2_urgent' || s === 'sev2_high';
      });
    }

    if (!ticketSearch.trim()) return list;
    const q = ticketSearch.trim().toLowerCase();
    return list.filter(c => {
      const num = String(c.CaseNumber || '').toLowerCase();
      const sub = String(c.Subject || '').toLowerCase();
      const desc = String(c.Description || '').toLowerCase();
      const assignee = getAssigneeDisplayName(c).toLowerCase();
      const status = String(c.Status || '').toLowerCase();
      return (
        num.includes(q) ||
        sub.includes(q) ||
        desc.includes(q) ||
        assignee.includes(q) ||
        status.includes(q)
      );
    });
  }, [activeTicketList, ticketSearch, ticketSeveritySubFilter]);

  // --------------------------------------------------------------------------
  // Analytics for Incidents Bucket
  // --------------------------------------------------------------------------
  const incidentAnalytics = useMemo(() => {
    let sev1 = 0;
    let sev2Urgent = 0;
    let sev2High = 0;

    for (const c of liveOpenIncidents) {
      const sev = detectSeverity(c);
      if (sev === 'sev1') {
        sev1++;
      } else if (sev === 'sev2' || (sev as string) === 'sev2_urgent') {
        sev2Urgent++;
      } else if (sev === 'sev2_high') {
        sev2High++;
      }
    }

    const totalUrgent = sev1 + sev2Urgent + sev2High;
    let siteHealth: 'CRITICAL' | 'DEGRADED' | 'OPERATIONAL' = 'OPERATIONAL';
    if (sev1 > 0) {
      siteHealth = 'CRITICAL';
    } else if (sev2Urgent > 0 || sev2High > 0) {
      siteHealth = 'DEGRADED';
    }

    return {
      sev1,
      sev2Urgent,
      sev2High,
      totalUrgent,
      totalTickets: incidentsSinceStart.length,
      siteHealth,
    };
  }, [liveOpenIncidents, incidentsSinceStart]);

  // --------------------------------------------------------------------------
  // Analytics for Alerts Bucket
  // --------------------------------------------------------------------------
  const alertAnalytics = useMemo(() => {
    const onHold = liveOpenAlerts.filter(c => String(c.Status || '').toLowerCase().includes('hold')).length;
    return {
      totalOpen: liveOpenAlerts.length,
      sinceStart: alertsSinceStart.length,
      last24h: alertsLast24h.length,
      onHold,
      activeRunning: liveOpenAlerts.length - onHold,
    };
  }, [liveOpenAlerts, alertsSinceStart, alertsLast24h]);

  const analyticsData = incidentAnalytics;

  // --------------------------------------------------------------------------
  // Global Metrics across all active war room sites
  // --------------------------------------------------------------------------
  const globalWarRoomStats = useMemo(() => {
    const allWarRoomSiteNames = new Set(
      warRooms.map(r => r.siteName).filter(Boolean) as string[]
    );
    const siteNamesList = Array.from(allWarRoomSiteNames);

    let totalOpen = 0;
    let sev1Open = 0;
    let sev2Open = 0;
    let last24hTotal = 0;
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;

    if (sfOverview?.cases && Array.isArray(sfOverview.cases)) {
      for (const c of sfOverview.cases) {
        const d = c.CreatedDate ? new Date(c.CreatedDate).getTime() : 0;
        if (d >= cutoffMs) last24hTotal++;

        if (!isLiveOpenCase(c)) continue;
        const mapped = findBestSiteForCase(c, compiledSitesList);
        const isMatched = siteNamesList.some(sn => mapped && areSameSite(mapped, sn));
        if (isMatched || siteNamesList.length === 0) {
          totalOpen++;
          const s = detectSeverity(c);
          if (s === 'sev1') sev1Open++;
          else if (s === 'sev2' || (s as string) === 'sev2_urgent' || s === 'sev2_high') sev2Open++;
        }
      }
    }

    return {
      totalOpen,
      sev1Open,
      sev2Open,
      last24hTotal,
    };
  }, [warRooms, sfOverview, compiledSitesList]);

  // --------------------------------------------------------------------------
  // Respective Trend Analytics & Bucketed Graph Data for Incidents & Alerts
  // --------------------------------------------------------------------------
  const incidentTrendData = useMemo(() => {
    return computeTrendData(incidentsSinceStart, selectedWarRoom, 'var(--primary)');
  }, [incidentsSinceStart, selectedWarRoom]);

  const alertTrendData = useMemo(() => {
    return computeTrendData(alertsSinceStart, selectedWarRoom, '#38bdf8');
  }, [alertsSinceStart, selectedWarRoom]);

  const trendData = activeBucket === 'incidents' ? incidentTrendData : alertTrendData;

  // Filtered War Rooms for Directory
  const filteredWarRooms = useMemo(() => {
    let list = warRooms;

    if (severityFilter === 'SEV 1') {
      list = list.filter(r => {
        const openCases = getSiteLiveOpenCases(r.siteName);
        const openIncidents = openCases.filter(c => !isAlertCase(c));
        return openIncidents.some(c => detectSeverity(c) === 'sev1');
      });
    } else if (severityFilter === 'SEV 2') {
      list = list.filter(r => {
        const openCases = getSiteLiveOpenCases(r.siteName);
        const openIncidents = openCases.filter(c => !isAlertCase(c));
        return openIncidents.some(c => {
          const s = detectSeverity(c);
          return s === 'sev2' || (s as string) === 'sev2_urgent';
        });
      });
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(r => {
      const name = (r.name || '').toLowerCase();
      const site = (r.siteName || '').toLowerCase();
      const lead = (r.lead || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      return name.includes(q) || site.includes(q) || lead.includes(q) || notes.includes(q);
    });
  }, [warRooms, severityFilter, searchQuery, sfOverview, compiledSitesList]);

  // Helper for severity badge styles
  const getSeverityBadge = (c: SFCase) => {
    const sev = detectSeverity(c);
    if (sev === 'sev1') {
      return (
        <span
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontWeight: 700,
            fontSize: 9.5,
            padding: '2px 7px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
          }}
        >
          SEV 1 URGENT
        </span>
      );
    }
    if (sev === 'sev2' || (sev as string) === 'sev2_urgent') {
      return (
        <span
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            fontWeight: 700,
            fontSize: 9.5,
            padding: '2px 7px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
          }}
        >
          SEV 2 URGENT
        </span>
      );
    }
    if (sev === 'sev2_high') {
      return (
        <span
          style={{
            background: 'rgba(168, 85, 247, 0.15)',
            color: '#c084fc',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            fontWeight: 700,
            fontSize: 9.5,
            padding: '2px 7px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
          }}
        >
          SEV 2 HIGH
        </span>
      );
    }
    return (
      <span
        style={{
          background: 'var(--secondary)',
          color: 'var(--muted-foreground)',
          border: '1px solid var(--border)',
          fontWeight: 600,
          fontSize: 9.5,
          padding: '2px 7px',
          borderRadius: 4,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {c.Priority || c.Highest_Severity__c || 'STANDARD'}
      </span>
    );
  };

  return (
    <DashboardShell>
      <div className="page-wrap">
        {/* ==================================================================== */}
        {/* PAGE HEADING (MATCHING REST OF THE WEBSITE)                         */}
        {/* ==================================================================== */}
        <div className="page-heading">
          <div>
            <div className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
              <span style={{ background: 'var(--primary)' }} />
              LIVE INCIDENT RESPONSE &amp; TRIAGE BRIDGES
            </div>
            <h1 style={{ fontFamily: 'var(--font-sans)' }}>
              {selectedWarRoom
                ? (incidentAnalytics.sev1 > 0 || incidentAnalytics.sev2Urgent > 0
                    ? selectedWarRoom.name
                    : selectedWarRoom.name.replace(/^(?:SEV[-\s]?[12]\s*[:\-–—]?\s*)/i, '').trim() || selectedWarRoom.name)
                : 'Active war rooms'}
              <span className="heading-dot" style={{ color: 'var(--primary)' }}>.</span>
            </h1>
            <p style={{ fontFamily: 'var(--font-sans)' }}>
              {selectedWarRoom
                ? `Live incident triage bridge • ${formatDisplayDateTime(selectedWarRoom.startDate)} to ${formatDisplayDateTime(selectedWarRoom.endDate)}`
                : 'Real-time incident response bridges, site overview panels, and incident flow telemetry.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selectedWarRoom ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedWarRoom(null)}
                style={{ height: 38, fontSize: 12, gap: 6, borderRadius: 6, fontFamily: 'var(--font-sans)' }}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} />
                <span>Back to all war rooms</span>
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => void handleRefresh()}
                  disabled={warRoomsFetching}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, fontSize: 12, fontFamily: 'var(--font-sans)' }}
                >
                  <RefreshCw
                    className={warRoomsFetching ? 'animate-spin' : ''}
                    style={{ width: 14, height: 14 }}
                  />
                  <span>{warRoomsFetching ? 'Refreshing…' : 'Refresh'}</span>
                </Button>

                <Button
                  size="sm"
                  variant={isAdding ? 'secondary' : 'default'}
                  onClick={() => {
                    setIsAdding(!isAdding);
                    if (isAdding) resetForm();
                  }}
                  style={{ fontSize: 12, fontWeight: 600, height: 38, gap: 6, borderRadius: 6, fontFamily: 'var(--font-sans)' }}
                >
                  {isAdding ? (
                    <>
                      <X style={{ width: 14, height: 14 }} />
                      <span>Cancel</span>
                    </>
                  ) : (
                    <>
                      <Plus style={{ width: 14, height: 14 }} />
                      <span>Add New War Room</span>
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ==================================================================== */}
        {/* ADD WAR ROOM FORM                                                    */}
        {/* ==================================================================== */}
        {isAdding && !selectedWarRoom && (
          <form
            onSubmit={handleSubmit}
            style={{
              marginTop: 22,
              marginBottom: 24,
              padding: '20px 22px',
              borderRadius: 8,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)' }}>
                <Video style={{ width: 16, height: 16, color: 'var(--primary)' }} />
                Create Active War Room
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                * Required fields (Start &amp; End dates required)
              </span>
            </div>

            {/* Row 1: Name and Severity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
                  War Room Name *
                </label>
                <Input
                  placeholder="e.g. Walmart Mexico Sortation Outage Bridge"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  style={{ height: 38, fontSize: 13, background: 'var(--background)', fontFamily: 'var(--font-sans)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
                  Severity
                </label>
                <select
                  value={severity}
                  onChange={e => setSeverity(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    fontSize: 13,
                    borderRadius: 6,
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    padding: '0 12px',
                    fontWeight: 500,
                    outline: 'none',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <option value="SEV 1">SEV 1 (Critical Outage)</option>
                  <option value="SEV 2">SEV 2 (Major Degraded)</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="GENERAL">General Triage</option>
                </select>
              </div>
            </div>

            {/* Row 2: Meeting URL */}
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
                Meeting / Bridge Link (URL) *
              </label>
              <Input
                placeholder="https://greyorange.zoom.us/j/... or Google Meet URL"
                value={url}
                onChange={e => setUrl(e.target.value)}
                required
                style={{ height: 38, fontSize: 13, background: 'var(--background)', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            {/* Row 3: Start Date & End Date (REQUIRED) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
                  <Calendar style={{ width: 14, height: 14, color: 'var(--primary)' }} />
                  Start Date &amp; Time * (Required)
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: 38,
                    fontSize: 13,
                    borderRadius: 6,
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    padding: '0 12px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
                  <Calendar style={{ width: 14, height: 14, color: 'var(--primary)' }} />
                  End Date &amp; Time * (Required)
                </label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: 38,
                    fontSize: 13,
                    borderRadius: 6,
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    padding: '0 12px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Row 4: Associated Site & Incident Lead */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
                  Associated Site
                </label>
                <input
                  list="war-room-sites-list"
                  placeholder="Pick or type site name..."
                  value={siteName}
                  onChange={e => setSiteName(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    fontSize: 13,
                    borderRadius: 6,
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    padding: '0 12px',
                    outline: 'none',
                    fontFamily: 'var(--font-sans)',
                  }}
                />
                <datalist id="war-room-sites-list">
                  {sites.map(s => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
                  Incident Lead / Host (Optional)
                </label>
                <Input
                  placeholder="e.g. Duty Lead / CAC"
                  value={lead}
                  onChange={e => setLead(e.target.value)}
                  style={{ height: 38, fontSize: 13, background: 'var(--background)', fontFamily: 'var(--font-sans)' }}
                />
              </div>
            </div>

            {/* Row 5: Notes */}
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
                Agenda / Notes (Optional)
              </label>
              <Input
                placeholder="Impacted subsystems or current operational bridge objectives..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ height: 38, fontSize: 13, background: 'var(--background)', fontFamily: 'var(--font-sans)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  resetForm();
                }}
                style={{ fontSize: 12, height: 38, fontFamily: 'var(--font-sans)' }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={addMutation.isPending}
                style={{ fontSize: 12, fontWeight: 600, height: 38, gap: 6, fontFamily: 'var(--font-sans)' }}
              >
                <Plus style={{ width: 14, height: 14 }} />
                {addMutation.isPending ? 'Publishing…' : 'Publish Active War Room'}
              </Button>
            </div>
          </form>
        )}

        {/* ==================================================================== */}
        {/* VIEW A: OVERVIEW SITE PANELS VIEW (WHEN NO WAR ROOM SELECTED)        */}
        {/* ==================================================================== */}
        {!selectedWarRoom ? (
          <div>
            {/* Top 4-Column Overview Metrics Strip (Matching Red Zone Style) */}
            <div className="overview-metrics" style={{ marginTop: 24, marginBottom: 28 }}>
              {/* Metric 1: Active War Rooms */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)' }}>
                  <Video style={{ color: 'var(--primary)' }} />
                  ACTIVE WAR ROOMS
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: warRooms.length > 0 ? 'var(--primary)' : undefined }}>
                    {warRooms.length}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-sans)' }}>live incident triage bridges</span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span
                    className="source-dot"
                    style={{ background: warRooms.length > 0 ? 'var(--primary)' : '#22c55e' }}
                  />
                  {warRooms.length > 0 ? `${warRooms.length} active incident response bridges` : 'No active war rooms'}
                </div>
              </div>

              {/* Metric 2: Live Open Tickets */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)' }}>
                  <Flame style={{ color: 'var(--primary)' }} />
                  LIVE OPEN TICKETS
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: globalWarRoomStats.totalOpen > 0 ? 'var(--foreground)' : undefined }}>
                    {globalWarRoomStats.totalOpen}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-sans)' }}>across all active bridge sites</span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span
                    className="source-dot"
                    style={{ background: globalWarRoomStats.totalOpen > 0 ? 'var(--primary)' : '#22c55e' }}
                  />
                  {globalWarRoomStats.sev1Open} Sev-1 • {globalWarRoomStats.sev2Open} Sev-2 active
                </div>
              </div>

              {/* Metric 3: Inflow (Last 24 Hours) */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)' }}>
                  <Clock style={{ color: '#60a5fa' }} />
                  INFLOW (LAST 24H)
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>
                    {globalWarRoomStats.last24hTotal}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-sans)' }}>new tickets received in last 24h</span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span className="source-dot" style={{ background: '#60a5fa' }} />
                  Fleet-wide incident velocity
                </div>
              </div>

              {/* Metric 4: Triage Mode */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)' }}>
                  <Radio style={{ color: '#22c55e' }} />
                  OPERATION MODE
                </span>
                <div>
                  <strong style={{ fontSize: 24, lineHeight: 1.25, fontFamily: 'var(--font-mono)' }}>
                    Live Bridge
                  </strong>
                  <span style={{ fontFamily: 'var(--font-sans)' }}>real-time Salesforce sync</span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span className="neutral-dot" />
                  Continuous incident monitor
                </div>
              </div>
            </div>

            {/* Directory Section */}
            <section className="directory">
              <div className="section-title">
                <h2 style={{ fontFamily: 'var(--font-sans)' }}>
                  Active war rooms <span>{filteredWarRooms.length}</span>
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="directory-note" style={{ fontFamily: 'var(--font-mono)' }}>
                    <Flame style={{ width: 11, height: 11, color: 'var(--primary)' }} />
                    AUTOMATED SF INCIDENT MONITOR
                  </span>
                  <span className="directory-note" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span className="neutral-dot" />
                    LIVE (30s)
                  </span>
                </div>
              </div>

              {/* Directory Tools */}
              <div className="directory-tools">
                <div className="site-search">
                  <Search />
                  <Input
                    aria-label="Search war rooms"
                    placeholder="Search war rooms, sites, leads…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ fontFamily: 'var(--font-sans)' }}
                  />
                  <kbd>⌕</kbd>
                </div>

                <div className="filter-tools">
                  {/* Severity filter */}
                  <div className="filter-select">
                    <SlidersHorizontal />
                    <select
                      aria-label="Filter severity"
                      value={severityFilter}
                      onChange={e => setSeverityFilter(e.target.value as any)}
                      style={{ fontFamily: 'var(--font-sans)' }}
                    >
                      <option value="all">All bridges ({warRooms.length})</option>
                      <option value="SEV 1">SEV 1 bridges</option>
                      <option value="SEV 2">SEV 2 bridges</option>
                    </select>
                    <ChevronDown />
                  </div>

                  {/* View Toggle */}
                  <div className="view-toggle">
                    <button
                      type="button"
                      className={viewMode === 'grid' ? 'selected' : ''}
                      onClick={() => setViewMode('grid')}
                      title="Grid view"
                    >
                      <LayoutGrid />
                    </button>
                    <button
                      type="button"
                      className={viewMode === 'list' ? 'selected' : ''}
                      onClick={() => setViewMode('list')}
                      title="List view"
                    >
                      <List />
                    </button>
                  </div>
                </div>
              </div>

              {/* Sites Grid / List */}
              {warRooms.length === 0 && warRoomsLoading ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
                  Loading active war rooms…
                </div>
              ) : filteredWarRooms.length === 0 ? (
                <div
                  style={{
                    padding: '60px 20px',
                    textAlign: 'center',
                    background: 'var(--card)',
                    borderRadius: 8,
                    border: '1px dashed var(--border)',
                  }}
                >
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 12,
                      background: 'var(--secondary)',
                      display: 'grid',
                      placeItems: 'center',
                      margin: '0 auto 16px',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    <Video style={{ width: 26, height: 26 }} />
                  </div>
                  <h4 style={{ fontSize: 16, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6, fontFamily: 'var(--font-sans)' }}>
                    No Active War Rooms Found
                  </h4>
                  <p style={{ fontSize: 13, color: 'var(--muted-foreground)', maxWidth: 420, margin: '0 auto 20px', lineHeight: 1.5, fontFamily: 'var(--font-sans)' }}>
                    {searchQuery || severityFilter !== 'all'
                      ? 'No war rooms match your current search and filter criteria.'
                      : 'There are no incident triage bridges active right now. Start a new war room with start and end dates.'}
                  </p>
                  {!isAdding && (
                    <Button
                      size="sm"
                      onClick={() => setIsAdding(true)}
                      style={{ fontSize: 12, fontWeight: 600, height: 36, gap: 6, fontFamily: 'var(--font-sans)' }}
                    >
                      <Plus style={{ width: 14, height: 14 }} />
                      <span>Add New War Room</span>
                    </Button>
                  )}
                </div>
              ) : (
                /* SITE PANELS GRID - Clean Dark Card Styling matching Red Zone / Overview */
                <div className={`site-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
                  {filteredWarRooms.map((room, idx) => {
                    const windowDurationText = formatDurationBetween(room.startDate, room.endDate);
                    const openCases = getSiteLiveOpenCases(room.siteName);
                    const openIncidents = openCases.filter(c => !isAlertCase(c));
                    const openAlerts = openCases.filter(c => isAlertCase(c));
                    const sev1Open = openIncidents.filter(c => detectSeverity(c) === 'sev1').length;
                    const sev2Open = openIncidents.filter(c => {
                      const s = detectSeverity(c);
                      return s === 'sev2' || (s as string) === 'sev2_urgent';
                    }).length;
                    const cardHasUrgent = sev1Open > 0 || sev2Open > 0;
                    // Remove "SEV 1" / "SEV-1" from title unless or until a Sev 1 or Sev 2 urgent incident is going on
                    const displayRoomTitle = cardHasUrgent
                      ? room.name
                      : room.name.replace(/^(?:SEV[-\s]?[12]\s*[:\-–—]?\s*)/i, '').trim() || room.name;

                    return (
                      <article
                        key={room.id}
                        className="site-card"
                        onClick={() => setSelectedWarRoom(room)}
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s ease',
                          position: 'relative',
                        }}
                      >
                        <div className="site-button" style={{ cursor: 'pointer', textAlign: 'left', width: '100%', outline: 'none' }}>
                          {/* Top Row: Emblem, Badges & Remove */}
                          <div className="site-card-top">
                            <span className={`site-emblem emblem-${idx % 4}`}>
                              <Video />
                            </span>

                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {/* Remove SEV 1 badge unless or until a Sev 1 or Sev 2 urgent is going on */}
                              {cardHasUrgent ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    background: sev1Open > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                    color: sev1Open > 0 ? '#ef4444' : '#f59e0b',
                                    border: `1px solid ${sev1Open > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    padding: '2.5px 7px',
                                    borderRadius: 4,
                                    letterSpacing: '0.04em',
                                    fontFamily: 'var(--font-mono)',
                                  }}
                                >
                                  {sev1Open > 0 ? 'SEV 1 URGENT' : 'SEV 2 URGENT'}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    background: 'rgba(34, 197, 94, 0.12)',
                                    color: '#22c55e',
                                    border: '1px solid rgba(34, 197, 94, 0.25)',
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    padding: '2.5px 7px',
                                    borderRadius: 4,
                                    letterSpacing: '0.04em',
                                    fontFamily: 'var(--font-mono)',
                                  }}
                                >
                                  ACTIVE BRIDGE
                                </span>
                              )}

                              <span
                                className="rz-badge-pill"
                                style={{
                                  background: 'var(--secondary)',
                                  color: 'var(--foreground)',
                                  border: '1px solid var(--border)',
                                  fontSize: 9.5,
                                  padding: '2.5px 7px',
                                }}
                              >
                                LIVE BRIDGE
                              </span>

                              {/* Delete Action */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  removeMutation.mutate(room.id);
                                }}
                                style={{
                                  height: 24,
                                  width: 24,
                                  padding: 0,
                                  color: 'var(--muted-foreground)',
                                  borderRadius: 4,
                                  marginLeft: 2,
                                }}
                                title="Remove / Close War Room"
                              >
                                <Trash2 style={{ width: 13, height: 13 }} />
                              </Button>
                            </div>
                          </div>

                          {/* Card Title - SEV 1 omitted when no Sev 1/2 urgent is going on */}
                          <div className="site-card-title">
                            <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.015em', fontFamily: 'var(--font-sans)' }}>
                              {displayRoomTitle}
                            </h3>
                            <ArrowUpRight />
                          </div>

                          {/* Associated Site Badge & Scheduled Duration */}
                          <div
                            className="site-card-subtitle"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                              fontFamily: 'var(--font-sans)',
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <MapPin style={{ width: 11, height: 11, color: 'var(--muted-foreground)', flexShrink: 0 }} />
                              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {room.siteName || 'All Sites / Org Bridge'}
                              </span>
                            </div>

                            <span
                              style={{
                                fontSize: 9.5,
                                color: 'var(--muted-foreground)',
                                fontFamily: 'var(--font-mono)',
                                flexShrink: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Clock style={{ width: 10, height: 10 }} />
                              {windowDurationText}
                            </span>
                          </div>

                          {/* Separate Open Incidents and Open Alerts Strips */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              padding: '6px 10px',
                              borderRadius: 5,
                              background: 'var(--secondary)',
                              border: '1px solid var(--border)',
                              fontSize: 10.5,
                              fontFamily: 'var(--font-mono)',
                              marginBottom: 10,
                              flexWrap: 'wrap',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: openIncidents.length > 0 ? 'var(--primary)' : 'var(--muted-foreground)',
                                  fontWeight: 600,
                                }}
                              >
                                <Flame style={{ width: 11, height: 11 }} />
                                {openIncidents.length} Open Incidents
                              </span>
                              <span style={{ color: 'var(--muted-foreground)' }}>•</span>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: openAlerts.length > 0 ? '#38bdf8' : 'var(--muted-foreground)',
                                  fontWeight: 600,
                                }}
                              >
                                <Bell style={{ width: 11, height: 11 }} />
                                {openAlerts.length} Alerts
                              </span>
                            </div>
                            {cardHasUrgent && (
                              <span style={{ color: 'var(--muted-foreground)', fontSize: 9.5 }}>
                                {sev1Open > 0 ? `${sev1Open} Sev-1` : ''}
                                {sev1Open > 0 && sev2Open > 0 ? ' • ' : ''}
                                {sev2Open > 0 ? `${sev2Open} Sev-2` : ''}
                              </span>
                            )}
                          </div>

                          {/* Scheduled Start & End Time Box with Edit Call Link Option */}
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--muted-foreground)',
                              background: 'var(--background)',
                              borderRadius: 6,
                              padding: '8px 10px',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                              marginBottom: 14,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 500, color: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)', fontSize: 10.5 }}>Start:</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--foreground)' }}>
                                {formatDisplayDateTime(room.startDate)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 500, color: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)', fontSize: 10.5 }}>End:</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--foreground)' }}>
                                {formatDisplayDateTime(room.endDate)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid rgba(255, 255, 255, 0.05)', marginTop: 2 }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(room);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  padding: 0,
                                  fontSize: 10.5,
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-sans)',
                                }}
                                title="Edit War Room Call Link & Dates"
                              >
                                <Edit2 style={{ width: 10, height: 10 }} />
                                <span>Edit call link &amp; dates</span>
                              </button>
                            </div>
                          </div>

                          {/* Metric stats row matching Sitepulse card bottom */}
                          <div className="site-card-bottom" style={{ fontFamily: 'var(--font-mono)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--primary)', fontWeight: 600, fontSize: 11, fontFamily: 'var(--font-sans)' }}>
                              <span>View Bridge &amp; Analytics</span>
                            </span>
                            <ArrowRight className="card-arrow" />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : (
          /* ==================================================================== */
          /* VIEW B: WAR ROOM DETAIL VIEW (PAGE CONTENT)                         */
          /* ==================================================================== */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Top Back Link */}
            <button
              type="button"
              onClick={() => setSelectedWarRoom(null)}
              className="back-link"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--muted-foreground)',
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              Back to all war rooms
            </button>

            {/* 1. TOP BRIDGE MEETING LINK CARD */}
            <div
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      background: 'var(--secondary)',
                      border: '1px solid var(--border)',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--foreground)',
                      flexShrink: 0,
                    }}
                  >
                    <ZoomIcon size={24} />
                  </div>

                  {(() => {
                    const hasUrgentSelected = incidentAnalytics.sev1 > 0 || incidentAnalytics.sev2Urgent > 0;
                    const selectedDisplayTitle = hasUrgentSelected
                      ? selectedWarRoom.name
                      : selectedWarRoom.name.replace(/^(?:SEV[-\s]?[12]\s*[:\-–—]?\s*)/i, '').trim() || selectedWarRoom.name;

                    return (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', margin: 0, fontFamily: 'var(--font-sans)' }}>
                            {selectedDisplayTitle}
                          </h2>

                          {/* Remove SEV 1 badge unless or until a Sev 1 or Sev 2 urgent is going on */}
                          {hasUrgentSelected ? (
                            <span
                              style={{
                                background: incidentAnalytics.sev1 > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: incidentAnalytics.sev1 > 0 ? '#ef4444' : '#f59e0b',
                                border: `1px solid ${incidentAnalytics.sev1 > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                                fontWeight: 700,
                                fontSize: 10,
                                padding: '2.5px 8px',
                                borderRadius: 4,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {incidentAnalytics.sev1 > 0 ? 'SEV 1 URGENT' : 'SEV 2 URGENT'}
                            </span>
                          ) : (
                            <span
                              style={{
                                background: 'rgba(34, 197, 94, 0.12)',
                                color: '#22c55e',
                                border: '1px solid rgba(34, 197, 94, 0.25)',
                                fontWeight: 700,
                                fontSize: 10,
                                padding: '2.5px 8px',
                                borderRadius: 4,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              ACTIVE BRIDGE
                            </span>
                          )}

                          <span
                            className="rz-badge-pill"
                            style={{
                              background: 'var(--secondary)',
                              color: 'var(--primary)',
                              border: '1px solid var(--border)',
                              fontSize: 9.5,
                              fontWeight: 600,
                            }}
                          >
                            🔥 {liveOpenIncidents.length} Open Incidents
                          </span>

                          <span
                            className="rz-badge-pill"
                            style={{
                              background: 'var(--secondary)',
                              color: '#38bdf8',
                              border: '1px solid var(--border)',
                              fontSize: 9.5,
                              fontWeight: 600,
                            }}
                          >
                            🔔 {liveOpenAlerts.length} Alerts
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap', fontFamily: 'var(--font-sans)' }}>
                          {selectedWarRoom.siteName && (
                            <span
                              style={{
                                fontSize: 12,
                                color: 'var(--foreground)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                fontWeight: 600,
                              }}
                            >
                              <MapPin style={{ width: 12, height: 12, color: 'var(--muted-foreground)' }} />
                              {selectedWarRoom.siteName}
                            </span>
                          )}
                          {selectedWarRoom.lead && (
                            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                              Lead: <strong style={{ color: 'var(--foreground)' }}>{selectedWarRoom.lead}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Actions: Copy Link & Join Meeting (GreyOrange Signature Orange) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(selectedWarRoom.url, selectedWarRoom.id)}
                    style={{ height: 38, fontSize: 12, gap: 6, borderRadius: 6, fontFamily: 'var(--font-sans)' }}
                  >
                    {copiedId === selectedWarRoom.id ? (
                      <>
                        <Check style={{ width: 14, height: 14, color: '#22c55e' }} />
                        <span style={{ color: '#22c55e' }}>Copied Link</span>
                      </>
                    ) : (
                      <>
                        <Copy style={{ width: 14, height: 14 }} />
                        <span>Copy Link</span>
                      </>
                    )}
                  </Button>

                  <Button
                    asChild
                    size="sm"
                    style={{
                      height: 38,
                      fontSize: 12.5,
                      fontWeight: 600,
                      gap: 7,
                      borderRadius: 6,
                      background: 'var(--primary)',
                      color: '#ffffff',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <a href={selectedWarRoom.url} target="_blank" rel="noopener noreferrer">
                      <span>Join War Room Meeting</span>
                      <ExternalLink style={{ width: 14, height: 14 }} />
                    </a>
                  </Button>
                </div>
              </div>

              {/* URL String Display & Date Window with Edit Call Link Option */}
              <div
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ color: 'var(--muted-foreground)', fontWeight: 500, flexShrink: 0, fontFamily: 'var(--font-sans)' }}>
                    Meeting URL:
                  </span>
                  <a
                    href={selectedWarRoom.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--primary)',
                      fontFamily: 'var(--font-mono)',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedWarRoom.url}
                  </a>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>
                    <Clock style={{ width: 13, height: 13 }} />
                    <span>
                      {formatDisplayDateTime(selectedWarRoom.startDate)} → {formatDisplayDateTime(selectedWarRoom.endDate)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedWarRoom)}
                    style={{
                      background: 'var(--secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '3px 9px',
                      fontSize: 11,
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontWeight: 600,
                      fontFamily: 'var(--font-sans)',
                      transition: 'all 0.15s ease',
                    }}
                    title="Edit War Room Call Link & Schedule"
                  >
                    <Edit2 style={{ width: 11, height: 11, color: 'var(--primary)' }} />
                    <span>Edit call link &amp; dates</span>
                  </button>
                </div>
              </div>

              {selectedWarRoom.notes && (
                <div style={{ fontSize: 12, color: 'var(--foreground)', background: 'var(--background)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'var(--font-sans)' }}>
                  <strong style={{ color: 'var(--muted-foreground)' }}>Agenda &amp; Notes: </strong>
                  {selectedWarRoom.notes}
                </div>
              )}
            </div>

            {/* BUCKET SELECTOR: SEPARATE BUCKETS FOR INCIDENTS AND ALERTS */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveBucket('incidents');
                    setActiveTicketTab('open');
                    setTicketSeveritySubFilter('all');
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: activeBucket === 'incidents' ? 'var(--primary)' : 'var(--border)',
                    background: activeBucket === 'incidents' ? 'rgba(249, 115, 22, 0.12)' : 'var(--card)',
                    color: activeBucket === 'incidents' ? 'var(--primary)' : 'var(--muted-foreground)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontFamily: 'var(--font-sans)',
                    transition: 'all 0.15s ease',
                    boxShadow: activeBucket === 'incidents' ? '0 0 14px rgba(249, 115, 22, 0.2)' : 'none',
                  }}
                >
                  <Flame style={{ width: 16, height: 16 }} />
                  <span>Incidents Bucket</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: activeBucket === 'incidents' ? 'var(--primary)' : 'var(--secondary)',
                      color: activeBucket === 'incidents' ? '#ffffff' : 'var(--muted-foreground)',
                    }}
                  >
                    {liveOpenIncidents.length} open
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveBucket('alerts');
                    setActiveTicketTab('open');
                    setTicketSeveritySubFilter('all');
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: activeBucket === 'alerts' ? '#38bdf8' : 'var(--border)',
                    background: activeBucket === 'alerts' ? 'rgba(56, 189, 248, 0.12)' : 'var(--card)',
                    color: activeBucket === 'alerts' ? '#38bdf8' : 'var(--muted-foreground)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontFamily: 'var(--font-sans)',
                    transition: 'all 0.15s ease',
                    boxShadow: activeBucket === 'alerts' ? '0 0 14px rgba(56, 189, 248, 0.2)' : 'none',
                  }}
                >
                  <Bell style={{ width: 16, height: 16 }} />
                  <span>Alerts Bucket</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: activeBucket === 'alerts' ? '#38bdf8' : 'var(--secondary)',
                      color: activeBucket === 'alerts' ? '#0f172a' : 'var(--muted-foreground)',
                    }}
                  >
                    {liveOpenAlerts.length} open
                  </span>
                </button>
              </div>

              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                {activeBucket === 'incidents' ? '• REAL OPERATIONAL INCIDENTS & OUTAGES' : '• AUTOMATED MONITORING & OPSGENIE ALERTS'}
              </span>
            </div>

            {/* 2. OVERVIEW ANALYTICS (RESPECTIVE METRICS PER BUCKET) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 7, margin: 0, fontFamily: 'var(--font-sans)' }}>
                  <Activity style={{ width: 16, height: 16, color: activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8' }} />
                  {activeBucket === 'incidents' ? 'Incident Severity & Health Analytics' : 'Alert Volume & Monitoring Telemetry'}
                </h3>
                {activeBucket === 'incidents' ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      padding: '3px 10px',
                      borderRadius: 5,
                      color: incidentAnalytics.siteHealth === 'CRITICAL' ? '#ef4444' : incidentAnalytics.siteHealth === 'DEGRADED' ? '#f59e0b' : '#22c55e',
                      background: incidentAnalytics.siteHealth === 'CRITICAL' ? 'rgba(239, 68, 68, 0.12)' : incidentAnalytics.siteHealth === 'DEGRADED' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    HEALTH STATUS: {incidentAnalytics.siteHealth}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      padding: '3px 10px',
                      borderRadius: 5,
                      color: '#38bdf8',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    MONITORING: {liveOpenAlerts.length > 0 ? `${liveOpenAlerts.length} ACTIVE` : 'CLEAR'}
                  </span>
                )}
              </div>

              {/* 4 Metric Cards for Incidents vs Alerts */}
              {activeBucket === 'incidents' ? (
                <div className="overview-metrics" style={{ marginTop: 0 }}>
                  {/* Sev 1 Urgents */}
                  <div className="metric">
                    <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                      <Flame style={{ color: '#ef4444' }} />
                      SEV 1 URGENTS
                    </span>
                    <div>
                      <strong style={{ color: incidentAnalytics.sev1 > 0 ? '#ef4444' : undefined, fontFamily: 'var(--font-mono)' }}>
                        {incidentAnalytics.sev1}
                      </strong>
                      <span style={{ fontFamily: 'var(--font-sans)' }}>Critical outages</span>
                    </div>
                    <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                      <span className="source-dot" style={{ background: incidentAnalytics.sev1 > 0 ? '#ef4444' : '#22c55e' }} />
                      Target: 0 Sev-1 incidents
                    </div>
                  </div>

                  {/* Sev 2 Urgents */}
                  <div className="metric">
                    <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                      <AlertTriangle style={{ color: '#f59e0b' }} />
                      SEV 2 URGENTS
                    </span>
                    <div>
                      <strong style={{ color: incidentAnalytics.sev2Urgent > 0 ? '#f59e0b' : undefined, fontFamily: 'var(--font-mono)' }}>
                        {incidentAnalytics.sev2Urgent}
                      </strong>
                      <span style={{ fontFamily: 'var(--font-sans)' }}>Major degraded</span>
                    </div>
                    <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                      <span className="source-dot" style={{ background: incidentAnalytics.sev2Urgent >= 5 ? '#f59e0b' : 'var(--muted-foreground)' }} />
                      Threshold: &lt; 5 Sev-2
                    </div>
                  </div>

                  {/* Sev 2 Highs */}
                  <div className="metric">
                    <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                      <AlertCircle style={{ color: '#c084fc' }} />
                      SEV 2 HIGHS
                    </span>
                    <div>
                      <strong style={{ color: incidentAnalytics.sev2High > 0 ? '#c084fc' : undefined, fontFamily: 'var(--font-mono)' }}>
                        {incidentAnalytics.sev2High}
                      </strong>
                      <span style={{ fontFamily: 'var(--font-sans)' }}>High priority</span>
                    </div>
                    <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                      <span className="source-dot" style={{ background: incidentAnalytics.sev2High > 0 ? '#c084fc' : 'var(--muted-foreground)' }} />
                      Operational high priority
                    </div>
                  </div>

                  {/* Current Live Open Incidents */}
                  <div className="metric">
                    <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                      <Flame style={{ color: 'var(--primary)' }} />
                      LIVE OPEN INCIDENTS
                    </span>
                    <div>
                      <strong style={{ color: liveOpenIncidents.length > 0 ? 'var(--primary)' : undefined, fontFamily: 'var(--font-mono)' }}>
                        {liveOpenIncidents.length}
                      </strong>
                      <span style={{ fontFamily: 'var(--font-sans)' }}>Currently active &amp; unsolved</span>
                    </div>
                    <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                      <span className="source-dot" style={{ background: liveOpenIncidents.length > 0 ? 'var(--primary)' : '#22c55e' }} />
                      {incidentAnalytics.totalTickets} total incidents in window
                    </div>
                  </div>
                </div>
              ) : (
                <div className="overview-metrics" style={{ marginTop: 0 }}>
                  {/* Live Open Alerts */}
                  <div className="metric">
                    <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                      <Bell style={{ color: '#38bdf8' }} />
                      LIVE OPEN ALERTS
                    </span>
                    <div>
                      <strong style={{ color: liveOpenAlerts.length > 0 ? '#38bdf8' : undefined, fontFamily: 'var(--font-mono)' }}>
                        {liveOpenAlerts.length}
                      </strong>
                      <span style={{ fontFamily: 'var(--font-sans)' }}>Active alerts firing</span>
                    </div>
                    <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                      <span className="source-dot" style={{ background: liveOpenAlerts.length > 0 ? '#38bdf8' : '#22c55e' }} />
                      Opsgenie automated rules
                    </div>
                  </div>

                  {/* Alerts Since Start Date */}
                  <div className="metric">
                    <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                      <Clock style={{ color: '#60a5fa' }} />
                      ALERTS SINCE START
                    </span>
                    <div>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>
                        {alertAnalytics.sinceStart}
                      </strong>
                      <span style={{ fontFamily: 'var(--font-sans)' }}>Total alert triggers in window</span>
                    </div>
                    <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                      <span className="source-dot" style={{ background: '#60a5fa' }} />
                      Cumulative window volume
                    </div>
                  </div>

                  {/* Alert Inflow Last 24 Hours */}
                  <div className="metric">
                    <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                      <Activity style={{ color: '#a78bfa' }} />
                      INFLOW (LAST 24H)
                    </span>
                    <div>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>
                        {alertAnalytics.last24h}
                      </strong>
                      <span style={{ fontFamily: 'var(--font-sans)' }}>Triggered in past 24 hours</span>
                    </div>
                    <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                      <span className="source-dot" style={{ background: '#a78bfa' }} />
                      Recent telemetry velocity
                    </div>
                  </div>

                  {/* Active On-Hold / Runbooks */}
                  <div className="metric">
                    <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                      <Radio style={{ color: '#fb923c' }} />
                      ON HOLD / RUNBOOKS
                    </span>
                    <div>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>
                        {alertAnalytics.onHold}
                      </strong>
                      <span style={{ fontFamily: 'var(--font-sans)' }}>Pending runbook / on hold</span>
                    </div>
                    <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                      <span className="source-dot" style={{ background: alertAnalytics.onHold > 0 ? '#fb923c' : '#22c55e' }} />
                      {alertAnalytics.activeRunning} active investigating
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. RESPECTIVE FLOW VELOCITY & DIRECTION GRAPH (INCIDENTS GRAPH VS ALERTS GRAPH) */}
            <div
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'var(--font-sans)' }}>
                    {activeBucket === 'incidents' ? 'Incident Flow Velocity & Direction' : 'Alert Flow Velocity & Direction'}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 5,
                      color: trendData.trendColor,
                      background: `${trendData.trendColor}18`,
                      border: `1px solid ${trendData.trendColor}40`,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {trendData.trend === 'UPTREND' ? (
                      <TrendingUp style={{ width: 13, height: 13 }} />
                    ) : trendData.trend === 'DOWNTREND' ? (
                      <TrendingDown style={{ width: 13, height: 13 }} />
                    ) : (
                      <Minus style={{ width: 13, height: 13 }} />
                    )}
                    {trendData.trendLabel}
                  </span>
                </div>

                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                  1st half: {trendData.firstHalfCount} {activeBucket === 'incidents' ? 'incidents' : 'alerts'} • 2nd half: {trendData.secondHalfCount} {activeBucket === 'incidents' ? 'incidents' : 'alerts'}
                </span>
              </div>

              {/* Interactive SVG Area Chart for current bucket */}
              <div style={{ height: 130, width: '100%', position: 'relative' }}>
                {trendData.chartBuckets.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(1, ...trendData.chartBuckets.map(b => b.count));
                    const width = 900;
                    const height = 100;
                    const paddingX = 35;
                    const paddingY = 15;
                    const plotW = width - paddingX * 2;
                    const plotH = height - paddingY * 2;

                    const divisor = Math.max(1, trendData.chartBuckets.length - 1);
                    const pts = trendData.chartBuckets.map((b, idx) => {
                      const x = paddingX + (idx / divisor) * plotW;
                      const y = height - paddingY - (b.count / maxVal) * plotH;
                      return { x, y, count: b.count, label: b.label };
                    });

                    const pathD = pts.reduce((acc, p, i) => {
                      return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                    }, '');

                    const firstX = pts[0]?.x ?? paddingX;
                    const lastX = pts[pts.length - 1]?.x ?? width - paddingX;
                    const areaD = `${pathD} L ${lastX} ${height - paddingY} L ${firstX} ${height - paddingY} Z`;
                    const gradId = activeBucket === 'incidents' ? 'incidentFlowGrad' : 'alertFlowGrad';

                    return (
                      <svg
                        viewBox={`0 0 ${width} ${height + 25}`}
                        style={{ width: '100%', height: '100%', overflow: 'visible' }}
                      >
                        <defs>
                          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={trendData.trendColor} stopOpacity="0.32" />
                            <stop offset="100%" stopColor={trendData.trendColor} stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Grid line */}
                        <line
                          x1={paddingX}
                          y1={height - paddingY}
                          x2={width - paddingX}
                          y2={height - paddingY}
                          stroke="var(--border)"
                          strokeWidth="1"
                          strokeDasharray="3 3"
                        />

                        {/* Area fill */}
                        <path d={areaD} fill={`url(#${gradId})`} />

                        {/* Line stroke */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke={trendData.trendColor}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Points & Labels */}
                        {pts.map((p, idx) => (
                          <g key={idx}>
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={p.count > 0 ? 4 : 2.5}
                              fill={trendData.trendColor}
                              stroke="var(--background)"
                              strokeWidth="2"
                            />
                            {p.count > 0 && (
                              <text
                                x={p.x}
                                y={p.y - 8}
                                textAnchor="middle"
                                fill="var(--foreground)"
                                fontSize="10"
                                fontWeight="700"
                                fontFamily="var(--font-mono)"
                              >
                                {p.count}
                              </text>
                            )}
                            <text
                              x={p.x}
                              y={height + 16}
                              textAnchor="middle"
                              fill="var(--muted-foreground)"
                              fontSize="9"
                              fontFamily="var(--font-mono)"
                            >
                              {p.label}
                            </text>
                          </g>
                        ))}
                      </svg>
                    );
                  })()
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
                    No time-series {activeBucket === 'incidents' ? 'incident' : 'alert'} data recorded during this period
                  </div>
                )}
              </div>
            </div>

            {/* 4. TICKETS SECTION (RESPECTIVE 3 TABS PER BUCKET) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                {/* 3 Main Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Tab 1: Live Open Tickets */}
                  <button
                    type="button"
                    onClick={() => setActiveTicketTab('open')}
                    style={{
                      padding: '7px 13px',
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: activeTicketTab === 'open' ? (activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8') : 'var(--border)',
                      background: activeTicketTab === 'open' ? (activeBucket === 'incidents' ? 'var(--orange-surface)' : 'rgba(56, 189, 248, 0.12)') : 'var(--card)',
                      color: activeTicketTab === 'open' ? (activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8') : 'var(--foreground)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontFamily: 'var(--font-sans)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {activeBucket === 'incidents' ? <Flame style={{ width: 13, height: 13 }} /> : <Bell style={{ width: 13, height: 13 }} />}
                    <span>{activeBucket === 'incidents' ? 'Live Open Incidents' : 'Live Open Alerts'}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        padding: '1.5px 6px',
                        borderRadius: 3,
                        background: activeTicketTab === 'open' ? (activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8') : 'var(--secondary)',
                        color: activeTicketTab === 'open' ? (activeBucket === 'incidents' ? '#ffffff' : '#0f172a') : 'var(--muted-foreground)',
                      }}
                    >
                      {activeBucket === 'incidents' ? liveOpenIncidents.length : liveOpenAlerts.length}
                    </span>
                  </button>

                  {/* Tab 2: Tickets from Start Date */}
                  <button
                    type="button"
                    onClick={() => setActiveTicketTab('war_room')}
                    style={{
                      padding: '7px 13px',
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: activeTicketTab === 'war_room' ? (activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8') : 'var(--border)',
                      background: activeTicketTab === 'war_room' ? (activeBucket === 'incidents' ? 'var(--orange-surface)' : 'rgba(56, 189, 248, 0.12)') : 'var(--card)',
                      color: activeTicketTab === 'war_room' ? (activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8') : 'var(--foreground)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontFamily: 'var(--font-sans)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Clock style={{ width: 13, height: 13 }} />
                    <span>{activeBucket === 'incidents' ? 'Incidents from Start Date' : 'Alerts from Start Date'}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        padding: '1.5px 6px',
                        borderRadius: 3,
                        background: activeTicketTab === 'war_room' ? (activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8') : 'var(--secondary)',
                        color: activeTicketTab === 'war_room' ? (activeBucket === 'incidents' ? '#ffffff' : '#0f172a') : 'var(--muted-foreground)',
                      }}
                    >
                      {activeBucket === 'incidents' ? incidentsSinceStart.length : alertsSinceStart.length}
                    </span>
                  </button>

                  {/* Tab 3: Last 24 Hours */}
                  <button
                    type="button"
                    onClick={() => setActiveTicketTab('last_24h')}
                    style={{
                      padding: '7px 13px',
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: activeTicketTab === 'last_24h' ? (activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8') : 'var(--border)',
                      background: activeTicketTab === 'last_24h' ? (activeBucket === 'incidents' ? 'var(--orange-surface)' : 'rgba(56, 189, 248, 0.12)') : 'var(--card)',
                      color: activeTicketTab === 'last_24h' ? (activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8') : 'var(--foreground)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontFamily: 'var(--font-sans)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Activity style={{ width: 13, height: 13 }} />
                    <span>Last 24 Hours</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        padding: '1.5px 6px',
                        borderRadius: 3,
                        background: activeTicketTab === 'last_24h' ? (activeBucket === 'incidents' ? 'var(--primary)' : '#38bdf8') : 'var(--secondary)',
                        color: activeTicketTab === 'last_24h' ? (activeBucket === 'incidents' ? '#ffffff' : '#0f172a') : 'var(--muted-foreground)',
                      }}
                    >
                      {activeBucket === 'incidents' ? incidentsLast24h.length : alertsLast24h.length}
                    </span>
                  </button>
                </div>

                {/* Sub-Severity & Search Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 3, background: 'var(--secondary)', padding: 3, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setTicketSeveritySubFilter('all')}
                      style={{
                        padding: '4px 9px',
                        fontSize: 10.5,
                        fontWeight: ticketSeveritySubFilter === 'all' ? 700 : 500,
                        borderRadius: 4,
                        border: 'none',
                        cursor: 'pointer',
                        background: ticketSeveritySubFilter === 'all' ? 'var(--card)' : 'transparent',
                        color: ticketSeveritySubFilter === 'all' ? 'var(--foreground)' : 'var(--muted-foreground)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      All ({activeTicketList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketSeveritySubFilter('sev1')}
                      style={{
                        padding: '4px 9px',
                        fontSize: 10.5,
                        fontWeight: ticketSeveritySubFilter === 'sev1' ? 700 : 500,
                        borderRadius: 4,
                        border: 'none',
                        cursor: 'pointer',
                        background: ticketSeveritySubFilter === 'sev1' ? 'var(--card)' : 'transparent',
                        color: ticketSeveritySubFilter === 'sev1' ? '#ef4444' : 'var(--muted-foreground)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      Sev-1
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketSeveritySubFilter('sev2')}
                      style={{
                        padding: '4px 9px',
                        fontSize: 10.5,
                        fontWeight: ticketSeveritySubFilter === 'sev2' ? 700 : 500,
                        borderRadius: 4,
                        border: 'none',
                        cursor: 'pointer',
                        background: ticketSeveritySubFilter === 'sev2' ? 'var(--card)' : 'transparent',
                        color: ticketSeveritySubFilter === 'sev2' ? '#f59e0b' : 'var(--muted-foreground)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      Sev-2
                    </button>
                  </div>

                  {/* Search inside tickets */}
                  <div style={{ position: 'relative', width: 220 }}>
                    <Search style={{ width: 13, height: 13, position: 'absolute', left: 10, top: 10, color: 'var(--muted-foreground)' }} />
                    <Input
                      placeholder="Search tickets…"
                      value={ticketSearch}
                      onChange={e => setTicketSearch(e.target.value)}
                      style={{ height: 32, fontSize: 11.5, paddingLeft: 30, background: 'var(--card)', fontFamily: 'var(--font-sans)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Tickets Table */}
              <div
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {/* Table Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(260px, 1.8fr) 130px 100px 140px 120px 140px',
                    padding: '10px 16px',
                    background: 'var(--secondary)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--muted-foreground)',
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <span>{activeBucket === 'incidents' ? 'Case & Subject' : 'Alert & Subject'}</span>
                  <span>{activeBucket === 'incidents' ? 'Severity' : 'Priority'}</span>
                  <span>Product</span>
                  <span>Assigned To</span>
                  <span>Status</span>
                  <span>Created Date</span>
                </div>

                {/* Table Body */}
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {filteredTickets.length > 0 ? (
                    filteredTickets.map(c => {
                      const assignee = getAssigneeDisplayName(c);
                      const product = String(c.Product_Type__c || c.product_line || 'RMS');

                      return (
                        <div
                          key={c.Id || c.CaseNumber}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(260px, 1.8fr) 130px 100px 140px 120px 140px',
                            padding: '12px 16px',
                            alignItems: 'center',
                            borderBottom: '1px solid var(--border)',
                            fontSize: 11.5,
                            transition: 'background 0.1s ease',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* Case Number & Subject */}
                          <div style={{ minWidth: 0, paddingRight: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <a
                                href={`https://greyorangeorg.my.salesforce.com/${c.Id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  fontSize: 11.5,
                                  color: 'var(--primary)',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                                title="Open in Salesforce"
                              >
                                {c.CaseNumber}
                                <ExternalLink style={{ width: 10, height: 10 }} />
                              </a>
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--foreground)',
                                fontWeight: 500,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                marginTop: 3,
                                fontFamily: 'var(--font-sans)',
                              }}
                              title={c.Subject || ''}
                            >
                              {c.Subject || 'No Subject Provided'}
                            </div>
                          </div>

                          {/* Severity */}
                          <div>{getSeverityBadge(c)}</div>

                          {/* Product */}
                          <div>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                background: 'var(--secondary)',
                                color: 'var(--foreground)',
                                padding: '2.5px 7px',
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                fontFamily: 'var(--font-sans)',
                              }}
                            >
                              {product}
                            </span>
                          </div>

                          {/* Assignee */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              color: 'var(--muted-foreground)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontFamily: 'var(--font-sans)',
                            }}
                            title={assignee}
                          >
                            <User style={{ width: 12, height: 12, flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {assignee}
                            </span>
                          </div>

                          {/* Status */}
                          <div>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                color: 'var(--foreground)',
                                background: 'var(--secondary)',
                                padding: '2.5px 7px',
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                fontFamily: 'var(--font-sans)',
                              }}
                            >
                              {c.Status || 'Open'}
                            </span>
                          </div>

                          {/* Created Date */}
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted-foreground)' }}>
                            {formatDisplayDateTime(c.CreatedDate || (c as any).created_at)}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
                      No tickets match the selected criteria.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* EDIT WAR ROOM CALL LINK & DETAILS DIALOG                             */}
        {/* ==================================================================== */}
        <Dialog open={Boolean(editingRoom)} onOpenChange={open => !open && closeEditModal()}>
          <DialogContent
            style={{
              maxWidth: 480,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 22,
              boxShadow: '0 16px 36px rgba(0, 0, 0, 0.45)',
            }}
          >
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', color: 'var(--foreground)' }}>
                <Edit2 style={{ width: 16, height: 16, color: 'var(--primary)' }} />
                Edit War Room Call Link &amp; Details
              </DialogTitle>
              <DialogDescription style={{ fontSize: 12, color: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)' }}>
                Update the meeting call URL, window dates, or title for <strong style={{ color: 'var(--foreground)' }}>{editingRoom?.name}</strong>.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveDetails} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              {/* War Room Name */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6, fontFamily: 'var(--font-sans)' }}>
                  <Video style={{ width: 13, height: 13, color: 'var(--primary)' }} />
                  War Room Name *
                </label>
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  required
                  placeholder="e.g. Incident Bridge: System Sortation Stoppage"
                  style={{ height: 38, fontSize: 13, background: 'var(--background)', fontFamily: 'var(--font-sans)' }}
                />
              </div>

              {/* War Room Call Link / Meeting URL */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6, fontFamily: 'var(--font-sans)' }}>
                  <ExternalLink style={{ width: 13, height: 13, color: 'var(--primary)' }} />
                  War Room Meeting Call Link (URL) *
                </label>
                <Input
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  required
                  placeholder="https://greyorange.zoom.us/j/... or Google Meet URL"
                  style={{ height: 38, fontSize: 13, background: 'var(--background)', fontFamily: 'var(--font-mono)' }}
                />
                <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', marginTop: 4, display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Zoom, Google Meet, or Microsoft Teams bridge URL for live operational triage.
                </span>
              </div>

              {/* Start & End Dates Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6, fontFamily: 'var(--font-sans)' }}>
                    <Clock style={{ width: 13, height: 13, color: 'var(--primary)' }} />
                    Start Date &amp; Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={editStartDate}
                    onChange={e => setEditStartDate(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: 38,
                      fontSize: 13,
                      borderRadius: 6,
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6, fontFamily: 'var(--font-sans)' }}>
                    <Clock style={{ width: 13, height: 13, color: 'var(--muted-foreground)' }} />
                    End Date &amp; Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={editEndDate}
                    onChange={e => setEditEndDate(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: 38,
                      fontSize: 13,
                      borderRadius: 6,
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {editStartDate && editEndDate && (
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--muted-foreground)',
                    background: 'var(--secondary)',
                    padding: '6px 10px',
                    borderRadius: 5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Calendar style={{ width: 12, height: 12, color: 'var(--primary)' }} />
                  <span>
                    Window duration: {formatDurationBetween(editStartDate, editEndDate)}
                  </span>
                </div>
              )}

              {/* Notes / Agenda */}
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 5, fontFamily: 'var(--font-sans)' }}>
                  Agenda / Notes (Optional)
                </label>
                <Input
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Impacted subsystems or current bridge objectives..."
                  style={{ height: 38, fontSize: 13, background: 'var(--background)', fontFamily: 'var(--font-sans)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeEditModal}
                  style={{ height: 36, fontSize: 12, fontFamily: 'var(--font-sans)' }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updateRoomMutation.isPending}
                  style={{
                    height: 36,
                    fontSize: 12,
                    fontWeight: 600,
                    gap: 6,
                    background: 'var(--primary)',
                    color: '#ffffff',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <Check style={{ width: 14, height: 14 }} />
                  {updateRoomMutation.isPending ? 'Saving…' : 'Save Details & Link'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  CheckCircle2,
  User,
  Building2,
  Calendar,
  Edit2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchActiveWarRooms,
  getStoredWarRooms,
  createActiveWarRoom,
  removeActiveWarRoom,
  updateActiveWarRoom,
  type WarRoom,
} from '@/lib/war-rooms';
import { sitesQueryOptions, type Site } from '@/lib/sites';
import { ZoomIcon } from './zoom-icon';
import {
  sfFetchLiveCasesOverview,
  getCachedOverviewSnapshot,
  type SFCase,
  detectSeverity,
  detectCaseCategory,
  compileSites,
  findBestSiteForCase,
  areSameSite,
  getAssigneeDisplayName,
  getTicketEndTime,
  hasTicketEndTime,
  isAlertCase,
  isOpenAlert,
} from '@/integrations/salesforce/client';

interface WarRoomsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

// Format duration
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

export function WarRoomsDialog({ open, onOpenChange }: WarRoomsDialogProps) {
  const queryClient = useQueryClient();

  // Navigation state: null = Overview site panels view; non-null = War Room detail view
  const [selectedWarRoom, setSelectedWarRoom] = useState<WarRoom | null>(null);

  // Form toggle & copy feedback
  const [isAdding, setIsAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Detail view tickets tab: 'open' | 'war_room' | 'last_24h'
  const [activeTicketTab, setActiveTicketTab] = useState<'open' | 'war_room' | 'last_24h'>('open');
  const [ticketSearch, setTicketSearch] = useState('');

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

  // Fetch active war rooms (instant initialData from localStorage + background sync)
  const { data: warRooms = [], isLoading: warRoomsLoading } = useQuery({
    queryKey: ['active-war-rooms'],
    queryFn: fetchActiveWarRooms,
    initialData: getStoredWarRooms,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
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

  // Fetch live Salesforce overview tickets (instant initialData from persistent snapshot)
  const { data: sfOverview } = useQuery({
    queryKey: ['salesforce-overview'],
    queryFn: () => sfFetchLiveCasesOverview(false),
    initialData: getCachedOverviewSnapshot,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  // If a war room has a site name, also query site-specific cases (cached per-site in sessionStorage)
  const { data: siteCasesData } = useQuery({
    queryKey: ['cases-site', selectedWarRoom?.siteName],
    queryFn: async () => {
      if (!selectedWarRoom?.siteName) return null;
      try {
        const res = await fetch(`/api/cases/site/${encodeURIComponent(selectedWarRoom.siteName)}`);
        if (res.ok) {
          const data = await res.json();
          try {
            sessionStorage.setItem(`site_cases_${selectedWarRoom.siteName}`, JSON.stringify(data));
          } catch {}
          return data;
        }
      } catch {}
      return null;
    },
    initialData: () => {
      if (!selectedWarRoom?.siteName) return null;
      try {
        const raw = sessionStorage.getItem(`site_cases_${selectedWarRoom.siteName}`);
        if (raw) return JSON.parse(raw);
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

  // Editing War Room Dates Modal State
  const [editingRoom, setEditingRoom] = useState<WarRoom | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const openEditDatesModal = (room: WarRoom) => {
    setEditingRoom(room);
    setEditStartDate(toLocalDatetimeString(new Date(room.startDate || room.startedAt)));
    setEditEndDate(toLocalDatetimeString(new Date(room.endDate)));
  };

  const closeEditDatesModal = () => {
    setEditingRoom(null);
  };

  // Update Dates Mutation with Instant Optimistic Update
  const updateDatesMutation = useMutation({
    mutationFn: async ({ id, startDate, endDate }: { id: string; startDate: string; endDate: string }) => {
      return updateActiveWarRoom(id, {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        startedAt: new Date(startDate).toISOString(),
      });
    },
    onMutate: async ({ id, startDate, endDate }) => {
      await queryClient.cancelQueries({ queryKey: ['active-war-rooms'] });
      const previous = queryClient.getQueryData<WarRoom[]>(['active-war-rooms']) || [];
      const updatedStartIso = new Date(startDate).toISOString();
      const updatedEndIso = new Date(endDate).toISOString();
      const updated = previous.map(r => {
        if (r.id === id) {
          return {
            ...r,
            startDate: updatedStartIso,
            endDate: updatedEndIso,
            startedAt: updatedStartIso,
          };
        }
        return r;
      });
      queryClient.setQueryData<WarRoom[]>(['active-war-rooms'], updated);
      if (selectedWarRoom?.id === id) {
        setSelectedWarRoom(prev => prev ? {
          ...prev,
          startDate: updatedStartIso,
          endDate: updatedEndIso,
          startedAt: updatedStartIso,
        } : null);
      }
      closeEditDatesModal();
      toast.success('War room dates updated successfully');
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['active-war-rooms'], context.previous);
      }
      toast.error('Failed to update war room dates');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['active-war-rooms'] });
    },
  });

  const handleSaveDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;
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
    updateDatesMutation.mutate({
      id: editingRoom.id,
      startDate: editStartDate,
      endDate: editEndDate,
    });
  };

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

  // Live Open Cases strictly for selected war room (from all open dates, including on-hold alerts with end time)
  const liveOpenCasesForSelected = useMemo(() => {
    return allCandidateCases
      .filter(c => isLiveOpenCase(c) || isOpenAlert(c))
      .sort((a, b) => getCaseCreatedMs(b) - getCaseCreatedMs(a));
  }, [allCandidateCases]);

  // Tickets filtered from War Room Start Date onwards (all tickets included from start date)
  const ticketsSinceStart = useMemo(() => {
    if (!selectedWarRoom) return [];
    const startIso = selectedWarRoom.startDate || selectedWarRoom.startedAt;
    const startMs = startIso ? new Date(startIso).getTime() : 0;

    return allCandidateCases
      .filter(c => {
        if (!startMs || isNaN(startMs)) return true;
        const createdMs = getCaseCreatedMs(c);
        if (createdMs === 0) return false;
        // From start date: include all tickets created on or after start date
        return createdMs >= startMs;
      })
      .sort((a, b) => getCaseCreatedMs(b) - getCaseCreatedMs(a));
  }, [allCandidateCases, selectedWarRoom]);

  // Tickets in the Last 24 Hours
  const ticketsLast24h = useMemo(() => {
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    return allCandidateCases
      .filter(c => {
        const createdMs = getCaseCreatedMs(c);
        if (createdMs === 0) return false;
        // Only tickets created within the last 24 hours
        return createdMs >= cutoffMs;
      })
      .sort((a, b) => getCaseCreatedMs(b) - getCaseCreatedMs(a));
  }, [allCandidateCases]);

  // Active tickets to display depending on tab
  const activeTicketList = useMemo(() => {
    if (activeTicketTab === 'open') return liveOpenCasesForSelected;
    if (activeTicketTab === 'war_room') return ticketsSinceStart;
    return ticketsLast24h;
  }, [activeTicketTab, liveOpenCasesForSelected, ticketsSinceStart, ticketsLast24h]);

  // Filtered tickets based on search
  const filteredTickets = useMemo(() => {
    if (!ticketSearch.trim()) return activeTicketList;
    const q = ticketSearch.trim().toLowerCase();
    return activeTicketList.filter(c => {
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
  }, [activeTicketList, ticketSearch]);

  // --------------------------------------------------------------------------
  // Overview Analytics (Site Performance & Severity Counts)
  // --------------------------------------------------------------------------
  const analyticsData = useMemo(() => {
    // We compute analytics based on the tickets in the active tab (or from the war room start)
    const baseTickets = ticketsSinceStart;

    let sev1 = 0;
    let sev2Urgent = 0;
    let sev2High = 0;

    for (const c of baseTickets) {
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
      totalTickets: baseTickets.length,
      siteHealth,
    };
  }, [ticketsSinceStart]);

  // --------------------------------------------------------------------------
  // Incident Flow Trend Analytics & Bucketed Graph Data
  // --------------------------------------------------------------------------
  const trendData = useMemo(() => {
    if (!selectedWarRoom || ticketsSinceStart.length === 0) {
      return {
        trend: 'STEADY' as 'UPTREND' | 'DOWNTREND' | 'STEADY',
        trendLabel: 'STABLE / NO INFLOW',
        trendColor: '#22c55e',
        firstHalfCount: 0,
        secondHalfCount: 0,
        chartBuckets: [] as { label: string; count: number; timestamp: number }[],
      };
    }

    const startMs = new Date(selectedWarRoom.startDate).getTime();
    const endMs = Math.max(new Date(selectedWarRoom.endDate).getTime(), Date.now());
    const spanMs = Math.max(3600000, endMs - startMs);

    // Split observation window into 8 time buckets for smooth visual telemetry
    const bucketCount = 8;
    const bucketSize = spanMs / bucketCount;

    const buckets: { label: string; count: number; timestamp: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const bStart = startMs + i * bucketSize;
      const bEnd = bStart + bucketSize;
      const bCenter = new Date(bStart + bucketSize / 2);

      const label = bCenter.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        hour12: true,
      });

      const count = ticketsSinceStart.filter(c => {
        const t = getCaseCreatedMs(c);
        if (t === 0) return false;
        return t >= bStart && t < bEnd;
      }).length;

      buckets.push({ label, count, timestamp: bCenter.getTime() });
    }

    // Determine velocity / trend: Compare first half vs second half
    const midMs = startMs + spanMs / 2;
    const firstHalfCount = ticketsSinceStart.filter(c => {
      const t = getCaseCreatedMs(c);
      if (t === 0) return false;
      return t >= startMs && t < midMs;
    }).length;

    const secondHalfCount = ticketsSinceStart.filter(c => {
      const t = getCaseCreatedMs(c);
      if (t === 0) return false;
      return t >= midMs && t <= endMs;
    }).length;

    let trend: 'UPTREND' | 'DOWNTREND' | 'STEADY' = 'STEADY';
    let trendLabel = 'STEADY FLOW';
    let trendColor = '#3b82f6';

    if (secondHalfCount > firstHalfCount) {
      trend = 'UPTREND';
      trendLabel = 'UPTREND (INCREASING)';
      trendColor = '#ef4444';
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
  }, [selectedWarRoom, ticketsSinceStart]);

  // Helper for severity badge styles
  const getSeverityBadge = (c: SFCase) => {
    const sev = detectSeverity(c);
    if (sev === 'sev1') {
      return (
        <span
          style={{
            background: '#dc2626',
            color: '#fff',
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
            background: '#d97706',
            color: '#fff',
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
            background: '#7e22ce',
            color: '#fff',
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
          background: 'rgba(255, 255, 255, 0.08)',
          color: 'var(--muted-foreground)',
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          maxWidth: 960,
          width: '95vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* ==================================================================== */}
        {/* DIALOG HEADER                                                        */}
        {/* ==================================================================== */}
        <DialogHeader
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {selectedWarRoom ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedWarRoom(null)}
                  style={{
                    height: 32,
                    fontSize: 11.5,
                    gap: 6,
                    padding: '0 10px',
                    borderRadius: 6,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <ArrowLeft style={{ width: 13, height: 13 }} />
                  <span>All War Rooms</span>
                </Button>
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'var(--secondary)',
                    border: '1px solid var(--border)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ZoomIcon size={20} />
                </div>
              )}

              <div>
                <DialogTitle
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    letterSpacing: '-0.01em',
                  }}
                >
                  <span>{selectedWarRoom ? selectedWarRoom.name : 'Active War Rooms'}</span>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      padding: '2px 7px',
                      borderRadius: 4,
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: '#ef4444',
                        boxShadow: '0 0 6px #ef4444',
                      }}
                    />
                    {selectedWarRoom ? selectedWarRoom.severity || 'LIVE BRIDGE' : `${warRooms.length} LIVE`}
                  </span>
                </DialogTitle>

                <DialogDescription
                  style={{
                    fontSize: 11,
                    color: 'var(--muted-foreground)',
                    marginTop: 3,
                  }}
                >
                  {selectedWarRoom
                    ? `Live incident triage bridge • ${formatDisplayDateTime(selectedWarRoom.startDate)} to ${formatDisplayDateTime(selectedWarRoom.endDate)}`
                    : 'Real-time incident response bridges, site overview panels, and incident flow telemetry.'}
                </DialogDescription>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!selectedWarRoom && (
                <Button
                  size="sm"
                  variant={isAdding ? 'secondary' : 'default'}
                  onClick={() => {
                    setIsAdding(!isAdding);
                    if (isAdding) resetForm();
                  }}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    height: 32,
                    gap: 6,
                    borderRadius: 6,
                  }}
                >
                  {isAdding ? (
                    <>
                      <X style={{ width: 13, height: 13 }} />
                      <span>Cancel</span>
                    </>
                  ) : (
                    <>
                      <Plus style={{ width: 13, height: 13 }} />
                      <span>Add War Room</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* ==================================================================== */}
        {/* SCROLLABLE BODY CONTENT                                              */}
        {/* ==================================================================== */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {/* ================================================================== */}
          {/* ADD WAR ROOM FORM                                                  */}
          {/* ================================================================== */}
          {isAdding && !selectedWarRoom && (
            <form
              onSubmit={handleSubmit}
              style={{
                marginBottom: 20,
                padding: '16px 18px',
                borderRadius: 8,
                background: 'var(--background)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Flame style={{ width: 14, height: 14, color: '#ef4444' }} />
                  Create Active War Room
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                  * Required fields (Start &amp; End dates required)
                </span>
              </div>

              {/* Row 1: Name and Severity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    War Room Name *
                  </label>
                  <Input
                    placeholder="e.g. Walmart Mexico Sortation Outage Bridge"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    style={{ height: 34, fontSize: 12, background: 'var(--card)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    Severity
                  </label>
                  <select
                    value={severity}
                    onChange={e => setSeverity(e.target.value)}
                    style={{
                      width: '100%',
                      height: 34,
                      fontSize: 12,
                      borderRadius: 6,
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      padding: '0 10px',
                      fontWeight: 500,
                      outline: 'none',
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
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Meeting / Bridge Link (URL) *
                </label>
                <Input
                  placeholder="https://greyorange.zoom.us/j/... or Google Meet URL"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  required
                  style={{ height: 34, fontSize: 12, background: 'var(--card)', fontFamily: 'var(--font-mono)' }}
                />
              </div>

              {/* Row 3: Start Date & End Date (REQUIRED AS REQUESTED) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
                    <Calendar style={{ width: 12, height: 12, color: '#3b82f6' }} />
                    Start Date &amp; Time * (Required)
                  </label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: 34,
                      fontSize: 12,
                      borderRadius: 6,
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      padding: '0 10px',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
                    <Calendar style={{ width: 12, height: 12, color: '#ef4444' }} />
                    End Date &amp; Time * (Required)
                  </label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: 34,
                      fontSize: 12,
                      borderRadius: 6,
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      padding: '0 10px',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Row 4: Associated Site & Incident Lead */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    Associated Site
                  </label>
                  <input
                    list="war-room-sites-list"
                    placeholder="Pick or type site name..."
                    value={siteName}
                    onChange={e => setSiteName(e.target.value)}
                    style={{
                      width: '100%',
                      height: 34,
                      fontSize: 12,
                      borderRadius: 6,
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      padding: '0 10px',
                      outline: 'none',
                    }}
                  />
                  <datalist id="war-room-sites-list">
                    {sites.map(s => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    Incident Lead / Host (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Duty Lead / CAC"
                    value={lead}
                    onChange={e => setLead(e.target.value)}
                    style={{ height: 34, fontSize: 12, background: 'var(--card)' }}
                  />
                </div>
              </div>

              {/* Row 5: Notes */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Agenda / Notes (Optional)
                </label>
                <Input
                  placeholder="Impacted subsystems or current operational bridge objectives..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ height: 34, fontSize: 12, background: 'var(--card)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false);
                    resetForm();
                  }}
                  style={{ fontSize: 11.5, height: 32 }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={addMutation.isPending}
                  style={{ fontSize: 11.5, fontWeight: 500, height: 32, gap: 6 }}
                >
                  <Plus style={{ width: 13, height: 13 }} />
                  {addMutation.isPending ? 'Publishing…' : 'Publish Active War Room'}
                </Button>
              </div>
            </form>
          )}

          {/* ================================================================== */}
          {/* VIEW A: OVERVIEW SITE PANELS VIEW (WHEN NO WAR ROOM SELECTED)      */}
          {/* ================================================================== */}
          {!selectedWarRoom ? (
            warRooms.length === 0 && warRoomsLoading ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                Loading active war rooms…
              </div>
            ) : warRooms.length === 0 ? (
              <div
                style={{
                  padding: '44px 20px',
                  textAlign: 'center',
                  background: 'var(--background)',
                  borderRadius: 10,
                  border: '1px dashed var(--border)',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: 'var(--secondary)',
                    display: 'grid',
                    placeItems: 'center',
                    margin: '0 auto 12px',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  <Video style={{ width: 22, height: 22 }} />
                </div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
                  No Active War Rooms
                </h4>
                <p style={{ fontSize: 11.5, color: 'var(--muted-foreground)', maxWidth: 360, margin: '0 auto 16px', lineHeight: 1.5 }}>
                  There are no incident triage bridges active right now. Start a new war room with start and end dates.
                </p>
                {!isAdding && (
                  <Button
                    size="sm"
                    onClick={() => setIsAdding(true)}
                    style={{ fontSize: 11.5, fontWeight: 500, height: 32, gap: 6 }}
                  >
                    <Plus style={{ width: 13, height: 13 }} />
                    <span>Add New War Room</span>
                  </Button>
                )}
              </div>
            ) : (
              /* SITE PANELS GRID - Matches overview site panels */
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 14,
                }}
              >
                {warRooms.map((room, i) => {
                  const windowDurationText = formatDurationBetween(room.startDate, room.endDate);

                  return (
                    <article
                      key={room.id}
                      onClick={() => setSelectedWarRoom(room)}
                      style={{
                        background: 'var(--background)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 10,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        position: 'relative',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* Top Row: Emblem, Badges & Remove */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              background: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#ef4444',
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Flame style={{ width: 16, height: 16 }} />
                          </span>

                          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <span
                              style={{
                                background: '#dc2626',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: 9.5,
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {room.severity || 'SEV 1'}
                            </span>
                            <span
                              style={{
                                background: 'var(--secondary)',
                                color: 'var(--foreground)',
                                border: '1px solid var(--border)',
                                fontWeight: 600,
                                fontSize: 9.5,
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              LIVE
                            </span>
                          </div>
                        </div>

                        {/* Remove Action */}
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
                          }}
                          title="Remove / Close War Room"
                        >
                          <Trash2 style={{ width: 12, height: 12 }} />
                        </Button>
                      </div>

                      {/* Card Title */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <h3
                            style={{
                              fontSize: 15,
                              fontWeight: 700,
                              color: 'var(--foreground)',
                              letterSpacing: '-0.015em',
                              margin: 0,
                              lineHeight: 1.3,
                            }}
                          >
                            {room.name}
                          </h3>
                          <ArrowUpRight style={{ width: 14, height: 14, color: 'var(--muted-foreground)', flexShrink: 0 }} />
                        </div>

                        {/* Associated Site Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              color: 'var(--foreground)',
                              background: 'var(--secondary)',
                              border: '1px solid var(--border)',
                              padding: '2px 7px',
                              borderRadius: 4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <MapPin style={{ width: 10, height: 10, color: 'var(--muted-foreground)' }} />
                            {room.siteName || 'All Sites / Org Bridge'}
                          </span>

                          <span
                            style={{
                              fontSize: 10,
                              color: 'var(--muted-foreground)',
                              fontFamily: 'var(--font-mono)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3.5,
                            }}
                          >
                            <Clock style={{ width: 10, height: 10 }} />
                            {windowDurationText}
                          </span>
                        </div>
                      </div>

                      {/* Card Subtitle: Dates and Notes */}
                      <div
                        style={{
                          fontSize: 10.5,
                          color: 'var(--muted-foreground)',
                          background: 'var(--card)',
                          borderRadius: 6,
                          padding: '6px 8px',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 500, color: 'var(--foreground)' }}>Start:</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>{formatDisplayDateTime(room.startDate)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 500, color: 'var(--foreground)' }}>End:</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>{formatDisplayDateTime(room.endDate)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid rgba(255, 255, 255, 0.05)', marginTop: 2 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDatesModal(room);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              fontSize: 10,
                              color: 'var(--primary)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 600,
                              fontFamily: 'var(--font-sans)',
                            }}
                            title="Edit Start & End Dates"
                          >
                            <Edit2 style={{ width: 10, height: 10 }} />
                            <span>Edit dates</span>
                          </button>
                        </div>
                      </div>

                      {/* Card Bottom: Click CTA */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderTop: '1px solid var(--border)',
                          paddingTop: 8,
                          fontSize: 11,
                          fontWeight: 500,
                          color: 'var(--foreground)',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#ef4444' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                          View Link, Analytics &amp; Tickets
                        </span>
                        <ArrowRight style={{ width: 13, height: 13, color: 'var(--muted-foreground)' }} />
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : (
            /* ================================================================== */
            /* VIEW B: WAR ROOM DETAIL VIEW (WHEN CLICKED)                        */
            /* ================================================================== */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 1. TOP BRIDGE MEETING LINK CARD */}
              <div
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#ef4444',
                        flexShrink: 0,
                      }}
                    >
                      <ZoomIcon size={22} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
                          {selectedWarRoom.name}
                        </h2>
                        <span
                          style={{
                            background: '#dc2626',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 9.5,
                            padding: '2px 7px',
                            borderRadius: 4,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {selectedWarRoom.severity || 'SEV 1'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        {selectedWarRoom.siteName && (
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--foreground)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 500,
                            }}
                          >
                            <MapPin style={{ width: 11, height: 11, color: 'var(--muted-foreground)' }} />
                            {selectedWarRoom.siteName}
                          </span>
                        )}
                        {selectedWarRoom.lead && (
                          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                            Lead: <strong style={{ color: 'var(--foreground)' }}>{selectedWarRoom.lead}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Copy Link & Join Meeting */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(selectedWarRoom.url, selectedWarRoom.id)}
                      style={{ height: 34, fontSize: 11.5, gap: 5, borderRadius: 6 }}
                    >
                      {copiedId === selectedWarRoom.id ? (
                        <>
                          <Check style={{ width: 12, height: 12, color: '#22c55e' }} />
                          <span style={{ color: '#22c55e' }}>Copied Link</span>
                        </>
                      ) : (
                        <>
                          <Copy style={{ width: 12, height: 12 }} />
                          <span>Copy Link</span>
                        </>
                      )}
                    </Button>

                    <Button
                      asChild
                      size="sm"
                      style={{
                        height: 34,
                        fontSize: 12,
                        fontWeight: 600,
                        gap: 6,
                        borderRadius: 6,
                        background: '#dc2626',
                        color: '#fff',
                      }}
                    >
                      <a href={selectedWarRoom.url} target="_blank" rel="noopener noreferrer">
                        <span>Join War Room</span>
                        <ExternalLink style={{ width: 12, height: 12 }} />
                      </a>
                    </Button>
                  </div>
                </div>

                {/* URL String Display & Date Window */}
                <div
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ color: 'var(--muted-foreground)', fontWeight: 500, flexShrink: 0 }}>
                      Bridge URL:
                    </span>
                    <a
                      href={selectedWarRoom.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#3b82f6',
                        fontFamily: 'var(--font-mono)',
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selectedWarRoom.url}
                    </a>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>
                      <Clock style={{ width: 12, height: 12 }} />
                      <span>
                        {formatDisplayDateTime(selectedWarRoom.startDate)} → {formatDisplayDateTime(selectedWarRoom.endDate)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditDatesModal(selectedWarRoom)}
                      style={{
                        background: 'var(--secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '2px 7px',
                        fontSize: 10,
                        color: 'var(--foreground)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3.5,
                        fontWeight: 600,
                        fontFamily: 'var(--font-sans)',
                        transition: 'all 0.15s ease',
                      }}
                      title="Edit Start & End Dates"
                    >
                      <Edit2 style={{ width: 10, height: 10, color: 'var(--primary)' }} />
                      <span>Edit dates</span>
                    </button>
                  </div>
                </div>

                {selectedWarRoom.notes && (
                  <div style={{ fontSize: 11.5, color: 'var(--foreground)', background: 'var(--card)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <strong style={{ color: 'var(--muted-foreground)' }}>Agenda: </strong>
                    {selectedWarRoom.notes}
                  </div>
                )}
              </div>

              {/* 2. OVERVIEW ANALYTICS (HOW THE SITE IS PERFORMING) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h4 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <Activity style={{ width: 14, height: 14, color: '#3b82f6' }} />
                    Site Performance Analytics
                  </h4>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      color: analyticsData.siteHealth === 'CRITICAL' ? '#ef4444' : analyticsData.siteHealth === 'DEGRADED' ? '#f59e0b' : '#22c55e',
                      background: analyticsData.siteHealth === 'CRITICAL' ? 'rgba(239, 68, 68, 0.12)' : analyticsData.siteHealth === 'DEGRADED' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    STATUS: {analyticsData.siteHealth}
                  </span>
                </div>

                {/* 4 Metric Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {/* Sev 1 Urgents */}
                  <div
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
                      SEV 1 URGENTS
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>
                      {analyticsData.sev1}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Critical outages</span>
                  </div>

                  {/* Sev 2 Urgents */}
                  <div
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                      SEV 2 URGENTS
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>
                      {analyticsData.sev2Urgent}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Urgent severity</span>
                  </div>

                  {/* Sev 2 Highs */}
                  <div
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
                      SEV 2 HIGHS
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>
                      {analyticsData.sev2High}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>High priority</span>
                  </div>

                  {/* Total Inflow */}
                  <div
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                      TOTAL TICKETS
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>
                      {analyticsData.totalTickets}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Since bridge start</span>
                  </div>
                </div>
              </div>

              {/* 3. INCIDENT FLOW TREND GRAPH (UPTREND / DOWNTREND) */}
              <div
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '14px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)' }}>
                      Incident Flow Velocity &amp; Direction
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        color: trendData.trendColor,
                        background: `${trendData.trendColor}18`,
                        border: `1px solid ${trendData.trendColor}40`,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {trendData.trend === 'UPTREND' ? (
                        <TrendingUp style={{ width: 12, height: 12 }} />
                      ) : trendData.trend === 'DOWNTREND' ? (
                        <TrendingDown style={{ width: 12, height: 12 }} />
                      ) : (
                        <Minus style={{ width: 12, height: 12 }} />
                      )}
                      {trendData.trendLabel}
                    </span>
                  </div>

                  <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                    1st half: {trendData.firstHalfCount} tickets • 2nd half: {trendData.secondHalfCount} tickets
                  </span>
                </div>

                {/* Interactive SVG Area Chart */}
                <div style={{ height: 130, width: '100%', position: 'relative' }}>
                  {trendData.chartBuckets.length > 0 ? (
                    (() => {
                      const maxVal = Math.max(1, ...trendData.chartBuckets.map(b => b.count));
                      const width = 860;
                      const height = 100;
                      const paddingX = 30;
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

                      return (
                        <svg
                          viewBox={`0 0 ${width} ${height + 25}`}
                          style={{ width: '100%', height: '100%', overflow: 'visible' }}
                        >
                          <defs>
                            <linearGradient id="incidentGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={trendData.trendColor} stopOpacity="0.45" />
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
                          <path d={areaD} fill="url(#incidentGradient)" />

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
                                r={p.count > 0 ? 3.5 : 2}
                                fill={trendData.trendColor}
                                stroke="var(--background)"
                                strokeWidth="1.5"
                              />
                              {p.count > 0 && (
                                <text
                                  x={p.x}
                                  y={p.y - 7}
                                  textAnchor="middle"
                                  fill="var(--foreground)"
                                  fontSize="9.5"
                                  fontWeight="700"
                                  fontFamily="var(--font-mono)"
                                >
                                  {p.count}
                                </text>
                              )}
                              <text
                                x={p.x}
                                y={height + 15}
                                textAnchor="middle"
                                fill="var(--muted-foreground)"
                                fontSize="8.5"
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
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted-foreground)', fontSize: 11 }}>
                      No time-series data available
                    </div>
                  )}
                </div>
              </div>

              {/* 4. TICKETS SECTION (DUAL TABS: SINCE START DATE & LAST 24 HOURS) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  {/* Three Main Tabs */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setActiveTicketTab('open')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: activeTicketTab === 'open' ? '#f97316' : 'var(--border)',
                        background: activeTicketTab === 'open' ? 'rgba(249, 115, 22, 0.12)' : 'var(--background)',
                        color: activeTicketTab === 'open' ? '#f97316' : 'var(--foreground)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Flame style={{ width: 12, height: 12 }} />
                      <span>Live Open Tickets</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: activeTicketTab === 'open' ? '#f97316' : 'var(--secondary)',
                          color: activeTicketTab === 'open' ? '#ffffff' : 'var(--muted-foreground)',
                        }}
                      >
                        {liveOpenCasesForSelected.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTicketTab('war_room')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: activeTicketTab === 'war_room' ? '#ef4444' : 'var(--border)',
                        background: activeTicketTab === 'war_room' ? 'rgba(239, 68, 68, 0.12)' : 'var(--background)',
                        color: activeTicketTab === 'war_room' ? '#ef4444' : 'var(--foreground)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Clock style={{ width: 12, height: 12 }} />
                      <span>Tickets from Start Date</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: activeTicketTab === 'war_room' ? '#ef4444' : 'var(--secondary)',
                          color: activeTicketTab === 'war_room' ? '#ffffff' : 'var(--muted-foreground)',
                        }}
                      >
                        {ticketsSinceStart.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTicketTab('last_24h')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: activeTicketTab === 'last_24h' ? '#3b82f6' : 'var(--border)',
                        background: activeTicketTab === 'last_24h' ? 'rgba(59, 130, 246, 0.12)' : 'var(--background)',
                        color: activeTicketTab === 'last_24h' ? '#3b82f6' : 'var(--foreground)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Activity style={{ width: 12, height: 12 }} />
                      <span>Last 24 Hours</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: activeTicketTab === 'last_24h' ? '#3b82f6' : 'var(--secondary)',
                          color: activeTicketTab === 'last_24h' ? '#ffffff' : 'var(--muted-foreground)',
                        }}
                      >
                        {ticketsLast24h.length}
                      </span>
                    </button>
                  </div>

                  {/* Search inside tickets */}
                  <div style={{ position: 'relative', width: 220 }}>
                    <Search style={{ width: 12, height: 12, position: 'absolute', left: 9, top: 10, color: 'var(--muted-foreground)' }} />
                    <Input
                      placeholder="Filter tickets…"
                      value={ticketSearch}
                      onChange={e => setTicketSearch(e.target.value)}
                      style={{ height: 30, fontSize: 11, paddingLeft: 28, background: 'var(--card)' }}
                    />
                  </div>
                </div>

                {/* Tickets Table matching overview table */}
                <div
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {/* Table Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.4fr 120px 90px 130px 110px 130px',
                      padding: '8px 12px',
                      background: 'var(--card)',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                    }}
                  >
                    <span>Case &amp; Subject</span>
                    <span>Severity</span>
                    <span>Product</span>
                    <span>Assigned To</span>
                    <span>Status</span>
                    <span>Created Date</span>
                  </div>

                  {/* Table Body */}
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {filteredTickets.length > 0 ? (
                      filteredTickets.map(c => {
                        const assignee = getAssigneeDisplayName(c);
                        const product = String(c.Product_Type__c || c.product_line || 'RMS');

                        return (
                          <div
                            key={c.Id || c.CaseNumber}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.4fr 120px 90px 130px 110px 130px',
                              padding: '10px 12px',
                              alignItems: 'center',
                              borderBottom: '1px solid var(--border)',
                              fontSize: 11,
                              transition: 'background 0.1s ease',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            {/* Case Number & Subject */}
                            <div style={{ minWidth: 0, paddingRight: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <a
                                  href={`https://greyorangeorg.my.salesforce.com/${c.Id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontWeight: 700,
                                    fontSize: 11,
                                    color: '#3b82f6',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                  title="Open in Salesforce"
                                >
                                  {c.CaseNumber}
                                  <ExternalLink style={{ width: 9, height: 9 }} />
                                </a>
                              </div>
                              <div
                                style={{
                                  fontSize: 11.5,
                                  color: 'var(--foreground)',
                                  fontWeight: 500,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  marginTop: 2,
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
                                  fontSize: 9.5,
                                  fontWeight: 600,
                                  background: 'var(--secondary)',
                                  color: 'var(--foreground)',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  border: '1px solid var(--border)',
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
                                gap: 4,
                                color: 'var(--muted-foreground)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={assignee}
                            >
                              <User style={{ width: 11, height: 11, flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {assignee}
                              </span>
                            </div>

                            {/* Status */}
                            <div>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: 'var(--foreground)',
                                  background: 'var(--secondary)',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  border: '1px solid var(--border)',
                                }}
                              >
                                {c.Status || 'Open'}
                              </span>
                            </div>

                            {/* Created Date */}
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted-foreground)' }}>
                              {formatDisplayDateTime(c.CreatedDate || (c as any).created_at)}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 11.5 }}>
                        No tickets found for this window.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {/* ==================================================================== */}
      {/* EDIT WAR ROOM DATES DIALOG                                           */}
      {/* ==================================================================== */}
      <Dialog open={Boolean(editingRoom)} onOpenChange={open => !open && closeEditDatesModal()}>
        <DialogContent
          style={{
            maxWidth: 440,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 22,
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.45)',
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', color: 'var(--foreground)' }}>
              <Calendar style={{ width: 16, height: 16, color: 'var(--primary)' }} />
              Edit War Room Dates
            </DialogTitle>
            <DialogDescription style={{ fontSize: 12, color: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)' }}>
              Update the scheduled start and end window for <strong style={{ color: 'var(--foreground)' }}>{editingRoom?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveDates} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeEditDatesModal}
                style={{ height: 36, fontSize: 12, fontFamily: 'var(--font-sans)' }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={updateDatesMutation.isPending}
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
                {updateDatesMutation.isPending ? 'Saving…' : 'Save Dates'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

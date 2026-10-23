import React, { useState, useEffect } from 'react';
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
  Clock,
  Flame,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchActiveWarRooms, createActiveWarRoom, removeActiveWarRoom, type WarRoom } from '@/lib/war-rooms';
import { sitesQueryOptions } from '@/lib/sites';

interface WarRoomsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WarRoomsDialog({ open, onOpenChange }: WarRoomsDialogProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [siteName, setSiteName] = useState('');
  const [severity, setSeverity] = useState('SEV 1');
  const [lead, setLead] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch sites for site dropdown
  const { data: sites } = useQuery(sitesQueryOptions());

  // Fetch active war rooms
  const { data: warRooms = [], isLoading } = useQuery({
    queryKey: ['active-war-rooms'],
    queryFn: fetchActiveWarRooms,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  // Listen to custom cross-tab / local events
  useEffect(() => {
    const handleChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ['active-war-rooms'] });
    };
    window.addEventListener('war-rooms-changed', handleChanged);
    return () => window.removeEventListener('war-rooms-changed', handleChanged);
  }, [queryClient]);

  // Create Mutation with Instant Optimistic Update (0ms)
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
        startedAt: new Date().toISOString(),
      };
      queryClient.setQueryData<WarRoom[]>(['active-war-rooms'], [optimisticRoom, ...previous]);
      resetForm();
      setIsAdding(false);
      toast.success(`War Room added: ${newRoomData.name}`);
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
      toast.error('Failed to add war room');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['active-war-rooms'] });
    },
  });

  // Remove Mutation with Instant Optimistic Update (0ms)
  const removeMutation = useMutation({
    mutationFn: removeActiveWarRoom,
    onMutate: async (idToDelete: string) => {
      await queryClient.cancelQueries({ queryKey: ['active-war-rooms'] });
      const previous = queryClient.getQueryData<WarRoom[]>(['active-war-rooms']) || [];
      const updated = previous.filter(r => r.id !== idToDelete);
      queryClient.setQueryData<WarRoom[]>(['active-war-rooms'], updated);
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

  const resetForm = () => {
    setName('');
    setUrl('');
    setSiteName('');
    setSeverity('SEV 1');
    setLead('');
    setNotes('');
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

    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    const matchedSite = sites?.find(
      s => s.name.toLowerCase() === siteName.trim().toLowerCase()
    );

    addMutation.mutate({
      name,
      url: finalUrl,
      siteName: siteName.trim() || null,
      siteId: matchedSite?.id || null,
      severity,
      lead: lead.trim() || null,
      notes: notes.trim() || null,
    });
  };

  const formatElapsed = (iso: string) => {
    try {
      const ms = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(ms / 60000);
      if (mins < 1) return 'Just started';
      if (mins < 60) return `Started ${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `Started ${hrs}h ${mins % 60}m ago`;
    } catch {
      return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          maxWidth: 620,
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Header - Clean, matches project theme, no glowing gradients */}
        <DialogHeader
          style={{
            padding: '18px 22px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: 'var(--orange-surface)',
                  color: 'var(--soft-orange)',
                  border: '1px solid var(--border)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Radio style={{ width: 18, height: 18 }} />
              </div>

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
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <span>Active War Rooms</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      background: warRooms.length > 0 ? 'var(--orange-surface)' : 'var(--secondary)',
                      color: warRooms.length > 0 ? 'var(--soft-orange)' : 'var(--muted-foreground)',
                      padding: '1px 6px',
                      borderRadius: 3,
                      border: '1px solid var(--border)',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {warRooms.length} {warRooms.length === 1 ? 'LIVE' : 'LIVE'}
                  </span>
                </DialogTitle>

                <DialogDescription
                  style={{
                    fontSize: 11,
                    color: 'var(--muted-foreground)',
                    marginTop: 3,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Live incident triage bridges and war room links across operational sites.
                </DialogDescription>
              </div>
            </div>

            <Button
              size="sm"
              variant={isAdding ? 'secondary' : 'default'}
              onClick={() => {
                setIsAdding(!isAdding);
                if (isAdding) resetForm();
              }}
              style={{
                fontSize: 11,
                fontWeight: 500,
                height: 32,
                gap: 5,
                borderRadius: 5,
                fontFamily: 'var(--font-sans)',
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
          </div>
        </DialogHeader>

        {/* Scrollable Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {/* Add War Room Collapsible Form */}
          {isAdding && (
            <form
              onSubmit={handleSubmit}
              style={{
                marginBottom: 16,
                padding: '15px 16px',
                borderRadius: 6,
                background: 'var(--background)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Flame style={{ width: 13, height: 13, color: 'var(--soft-orange)' }} />
                  Create Active War Room
                </span>
                <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>* Required</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    War Room Name *
                  </label>
                  <Input
                    placeholder="e.g. SEV-1 Outage: Sortation Line Bridge"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    style={{
                      height: 34,
                      fontSize: 11.5,
                      background: 'var(--card)',
                      borderColor: 'var(--border)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    Severity
                  </label>
                  <select
                    value={severity}
                    onChange={e => setSeverity(e.target.value)}
                    style={{
                      width: '100%',
                      height: 34,
                      fontSize: 11.5,
                      borderRadius: 5,
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      padding: '0 8px',
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

              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Meeting / Bridge Link (URL) *
                </label>
                <Input
                  placeholder="https://zoom.us/j/123456789 or Google Meet / Teams URL"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  required
                  style={{
                    height: 34,
                    fontSize: 11.5,
                    background: 'var(--card)',
                    borderColor: 'var(--border)',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    Associated Site (Optional)
                  </label>
                  <input
                    list="war-room-sites"
                    placeholder="Pick or type site name..."
                    value={siteName}
                    onChange={e => setSiteName(e.target.value)}
                    style={{
                      width: '100%',
                      height: 34,
                      fontSize: 11.5,
                      borderRadius: 5,
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      padding: '0 10px',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                    }}
                  />
                  <datalist id="war-room-sites">
                    {sites?.map(s => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    Incident Lead / Host (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Duty Lead"
                    value={lead}
                    onChange={e => setLead(e.target.value)}
                    style={{
                      height: 34,
                      fontSize: 11.5,
                      background: 'var(--card)',
                      borderColor: 'var(--border)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Agenda / Notes (Optional)
                </label>
                <Input
                  placeholder="Impacted subsystems or current status..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{
                    height: 34,
                    fontSize: 11.5,
                    background: 'var(--card)',
                    borderColor: 'var(--border)',
                    fontFamily: 'var(--font-sans)',
                  }}
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
                  style={{ fontSize: 11, height: 30, borderRadius: 5, fontFamily: 'var(--font-sans)' }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={addMutation.isPending}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    height: 30,
                    borderRadius: 5,
                    gap: 5,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <Plus style={{ width: 12, height: 12 }} />
                  {addMutation.isPending ? 'Publishing…' : 'Publish Active War Room'}
                </Button>
              </div>
            </form>
          )}

          {/* Active War Rooms List */}
          {isLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 11.5 }}>
              Loading active war rooms…
            </div>
          ) : warRooms.length === 0 ? (
            <div
              style={{
                padding: '36px 20px',
                textAlign: 'center',
                background: 'var(--background)',
                borderRadius: 6,
                border: '1px dashed var(--border)',
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 6,
                  background: 'var(--secondary)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 10px',
                  color: 'var(--muted-foreground)',
                }}
              >
                <Video style={{ width: 18, height: 18 }} />
              </div>
              <h4 style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)', marginBottom: 3, fontFamily: 'var(--font-sans)' }}>
                No Active War Rooms
              </h4>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', maxWidth: 340, margin: '0 auto 14px', lineHeight: 1.5, fontFamily: 'var(--font-sans)' }}>
                There are no active incident triage bridges right now. You can launch or link a war room at any time.
              </p>
              {!isAdding && (
                <Button
                  size="sm"
                  onClick={() => setIsAdding(true)}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    height: 30,
                    borderRadius: 5,
                    gap: 5,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <Plus style={{ width: 12, height: 12 }} />
                  <span>Start / Add War Room</span>
                </Button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {warRooms.map((room) => {
                const isSev1 = room.severity?.includes('1') || room.severity?.toLowerCase().includes('crit');
                const elapsed = formatElapsed(room.startedAt);

                return (
                  <div
                    key={room.id}
                    style={{
                      background: 'var(--background)',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    {/* Top Row: Badges, Title, Remove Button */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {/* Live indicator tag */}
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 9,
                              fontWeight: 600,
                              fontFamily: 'var(--font-mono)',
                              color: isSev1 ? 'var(--destructive)' : 'var(--yellow)',
                              background: isSev1 ? 'oklch(0.62 0.21 25 / 0.12)' : 'oklch(0.79 0.11 88 / 0.12)',
                              border: isSev1 ? '1px solid oklch(0.62 0.21 25 / 0.3)' : '1px solid oklch(0.79 0.11 88 / 0.3)',
                              padding: '1px 5px',
                              borderRadius: 3,
                              textTransform: 'uppercase',
                            }}
                          >
                            <span
                              style={{
                                width: 4.5,
                                height: 4.5,
                                borderRadius: '50%',
                                background: isSev1 ? 'var(--destructive)' : 'var(--yellow)',
                                display: 'inline-block',
                              }}
                            />
                            LIVE BRIDGE
                          </span>

                          {/* Severity */}
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              fontFamily: 'var(--font-mono)',
                              color: isSev1 ? '#ffffff' : '#ffffff',
                              background: isSev1 ? 'var(--destructive)' : 'var(--yellow)',
                              padding: '1px 5px',
                              borderRadius: 3,
                            }}
                          >
                            {room.severity || 'SEV 1'}
                          </span>

                          {/* Site Tag if available */}
                          {room.siteName && (
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 500,
                                color: 'var(--foreground)',
                                background: 'var(--secondary)',
                                border: '1px solid var(--border)',
                                padding: '1px 5px',
                                borderRadius: 3,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontFamily: 'var(--font-sans)',
                              }}
                            >
                              <MapPin style={{ width: 9.5, height: 9.5, color: 'var(--muted-foreground)' }} />
                              {room.siteName}
                            </span>
                          )}

                          {/* Elapsed time */}
                          {elapsed && (
                            <span
                              style={{
                                fontSize: 9.5,
                                color: 'var(--muted-foreground)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              <Clock style={{ width: 9.5, height: 9.5 }} />
                              {elapsed}
                            </span>
                          )}
                        </div>

                        {/* War Room Name */}
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)', marginTop: 2, fontFamily: 'var(--font-sans)' }}>
                          {room.name}
                        </div>
                      </div>

                      {/* Remove Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
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
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </Button>
                    </div>

                    {/* Middle Row: Notes / Lead */}
                    {(room.notes || room.lead) && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--muted-foreground)',
                          background: 'var(--card)',
                          borderRadius: 4,
                          padding: '5px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          border: '1px solid var(--border)',
                          fontFamily: 'var(--font-sans)',
                        }}
                      >
                        {room.lead && (
                          <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                            <strong style={{ color: 'var(--foreground)', fontWeight: 500 }}>Lead:</strong> {room.lead}
                          </div>
                        )}
                        {room.notes && <div style={{ color: 'var(--foreground)' }}>{room.notes}</div>}
                      </div>
                    )}

                    {/* Bottom Row: Link Preview & Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        paddingTop: 4,
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      {/* URL Preview */}
                      <a
                        href={room.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 10.5,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--muted-foreground)',
                          textDecoration: 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 320,
                        }}
                        title={room.url}
                      >
                        {room.url}
                      </a>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopy(room.url, room.id)}
                          style={{
                            height: 26,
                            fontSize: 10.5,
                            gap: 4,
                            padding: '0 7px',
                            borderRadius: 4,
                            borderColor: 'var(--border)',
                            fontFamily: 'var(--font-sans)',
                          }}
                          title="Copy meeting link"
                        >
                          {copiedId === room.id ? (
                            <>
                              <Check style={{ width: 10, height: 10, color: 'var(--success)' }} />
                              <span style={{ color: 'var(--success)' }}>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy style={{ width: 10, height: 10 }} />
                              <span>Copy</span>
                            </>
                          )}
                        </Button>

                        <Button
                          asChild
                          size="sm"
                          style={{
                            height: 26,
                            fontSize: 10.5,
                            fontWeight: 500,
                            gap: 4,
                            padding: '0 9px',
                            borderRadius: 4,
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          <a href={room.url} target="_blank" rel="noopener noreferrer">
                            <span>Join War Room</span>
                            <ExternalLink style={{ width: 10, height: 10 }} />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface WarRoom {
  id: string;
  name: string;
  url: string;
  siteName?: string | null;
  siteId?: string | null;
  severity?: string;
  lead?: string | null;
  notes?: string | null;
  startedAt: string;
}

const STORAGE_KEY = 'gods_eye_active_war_rooms_v1';

const DEFAULT_WAR_ROOMS: WarRoom[] = [
  {
    id: 'wr-default-1',
    name: 'SEV-1 Incident Bridge: System Sortation Stoppage',
    url: 'https://zoom.us/j/9876543210',
    siteName: 'Target T-0582',
    siteId: 'target-t-0582',
    severity: 'SEV 1',
    lead: 'On-Call Incident Lead',
    notes: 'P0 Incident triage: conveyor sortation communication failure.',
    startedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  },
];

function getStoredWarRooms(): WarRoom[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {}
  return DEFAULT_WAR_ROOMS;
}

function setStoredWarRooms(rooms: WarRoom[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
      window.dispatchEvent(new CustomEvent('war-rooms-changed', { detail: rooms }));
    }
  } catch {}
}

export async function fetchActiveWarRooms(): Promise<WarRoom[]> {
  try {
    const res = await fetch('/api/war-rooms');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.warRooms)) {
        setStoredWarRooms(data.warRooms);
        return data.warRooms;
      }
    }
  } catch {
    // Backend offline or unreachable, fall back gracefully to localStorage
  }
  return getStoredWarRooms();
}

export async function createActiveWarRoom(room: {
  name: string;
  url: string;
  siteName?: string | null;
  siteId?: string | null;
  severity?: string;
  lead?: string | null;
  notes?: string | null;
}): Promise<WarRoom> {
  const payload = {
    name: room.name.trim(),
    url: room.url.trim(),
    siteName: room.siteName?.trim() || null,
    siteId: room.siteId?.trim() || null,
    severity: room.severity?.trim() || 'SEV 1',
    lead: room.lead?.trim() || null,
    notes: room.notes?.trim() || null,
  };

  try {
    const res = await fetch('/api/war-rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.warRoom) {
        const current = getStoredWarRooms().filter(r => r.id !== data.warRoom.id);
        const updated = [data.warRoom, ...current];
        setStoredWarRooms(updated);
        return data.warRoom;
      }
    }
  } catch {}

  // Fallback to local storage
  const localRoom: WarRoom = {
    id: `wr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...payload,
    startedAt: new Date().toISOString(),
  };
  const updated = [localRoom, ...getStoredWarRooms()];
  setStoredWarRooms(updated);
  return localRoom;
}

export async function removeActiveWarRoom(id: string): Promise<boolean> {
  try {
    await fetch(`/api/war-rooms/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {}

  const current = getStoredWarRooms();
  const filtered = current.filter(r => r.id !== id);
  setStoredWarRooms(filtered);
  return true;
}

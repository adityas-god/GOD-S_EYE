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
  startDate: string;
  endDate: string;
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
    startDate: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function getStoredWarRooms(): WarRoom[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((r: any) => {
            const startDate = r.startDate || r.startedAt || new Date().toISOString();
            const endDate = r.endDate || new Date(new Date(startDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
            return {
              ...r,
              startedAt: r.startedAt || startDate,
              startDate,
              endDate,
            };
          });
        }
      }
    }
  } catch {}
  return DEFAULT_WAR_ROOMS;
}

export function setStoredWarRooms(rooms: WarRoom[], notify = true): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
      if (notify) {
        window.dispatchEvent(new CustomEvent('war-rooms-changed', { detail: rooms }));
      }
    }
  } catch {}
}

/**
 * Fetch active war rooms with 2.5s network timeout and instant local fallback
 */
export async function fetchActiveWarRooms(): Promise<WarRoom[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch('/api/war-rooms', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.warRooms)) {
        if (data.warRooms.length > 0) {
          // Cache locally for offline resilience without dispatching recursive invalidation event
          setStoredWarRooms(data.warRooms, false);
          return data.warRooms;
        } else {
          const stored = getStoredWarRooms();
          if (stored.length > 0) return stored;
          return [];
        }
      }
    }
  } catch {
    // Network offline or timeout - instant return from local storage
  }
  return getStoredWarRooms();
}

/**
 * Create active war room with instant local storage write and non-blocking backend sync
 */
export async function createActiveWarRoom(room: {
  name: string;
  url: string;
  siteName?: string | null;
  siteId?: string | null;
  severity?: string;
  lead?: string | null;
  notes?: string | null;
  startDate: string;
  endDate: string;
}): Promise<WarRoom> {
  const startDateStr = room.startDate ? new Date(room.startDate).toISOString() : new Date().toISOString();
  const endDateStr = room.endDate ? new Date(room.endDate).toISOString() : new Date(new Date(startDateStr).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const newRoom: WarRoom = {
    id: `wr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: room.name.trim(),
    url: room.url.trim(),
    siteName: room.siteName?.trim() || null,
    siteId: room.siteId?.trim() || null,
    severity: room.severity?.trim() || 'SEV 1',
    lead: room.lead?.trim() || null,
    notes: room.notes?.trim() || null,
    startedAt: startDateStr,
    startDate: startDateStr,
    endDate: endDateStr,
  };

  // Instant local storage update (0ms latency)
  const current = getStoredWarRooms().filter(r => r.id !== newRoom.id);
  const updated = [newRoom, ...current];
  setStoredWarRooms(updated);

  // Sync to backend in parallel with fast 3s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('/api/war-rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRoom),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data?.warRoom?.id) {
        const synced = [data.warRoom, ...getStoredWarRooms().filter(r => r.id !== newRoom.id && r.id !== data.warRoom.id)];
        setStoredWarRooms(synced);
        return data.warRoom;
      }
    }
  } catch {
    // Backend offline; local persistent copy remains active
  }

  return newRoom;
}

/**
 * Remove active war room with instant local storage purge and non-blocking backend sync
 */
export async function removeActiveWarRoom(id: string): Promise<boolean> {
  // Instant local purge (0ms latency)
  const current = getStoredWarRooms();
  const filtered = current.filter(r => r.id !== id);
  setStoredWarRooms(filtered);

  // Sync delete to backend in parallel
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    await fetch(`/api/war-rooms/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // Silently continue
  }

  return true;
}

/**
 * Update active war room (dates, notes, etc.) with instant local storage write and non-blocking backend sync
 */
export async function updateActiveWarRoom(
  id: string,
  updates: Partial<WarRoom>
): Promise<WarRoom | null> {
  const current = getStoredWarRooms();
  const idx = current.findIndex(r => r.id === id);
  let updatedRoom: WarRoom | null = null;

  const normalizedUpdates: Partial<WarRoom> = { ...updates };
  if (normalizedUpdates.startDate) {
    normalizedUpdates.startDate = new Date(normalizedUpdates.startDate).toISOString();
    normalizedUpdates.startedAt = normalizedUpdates.startDate;
  }
  if (normalizedUpdates.endDate) {
    normalizedUpdates.endDate = new Date(normalizedUpdates.endDate).toISOString();
  }

  if (idx !== -1 && current[idx]) {
    current[idx] = { ...current[idx]!, ...normalizedUpdates };
    updatedRoom = current[idx]!;
    setStoredWarRooms([...current]);
  }

  // Sync to backend in parallel
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`/api/war-rooms/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedUpdates),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data?.warRoom) {
        return data.warRoom;
      }
    }
  } catch {}

  return updatedRoom;
}

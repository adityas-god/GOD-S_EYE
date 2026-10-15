import sitesData from '@/data/sites.json';

export type SiteRow = {
  id: string;
  name: string;
  product_line: string | null;
  opsgenie_tag: string | null;
  salesforce_account_id: string | null;
  position: number;
  created_at: string;
  open_cases_count?: number;
  is_down?: boolean;
};

// Give each entry a stable deterministic ID based on position
function makeId(position: number): string {
  return `local-site-${String(position).padStart(4, '0')}`;
}

/**
 * Fetch sites: Starts with authoritative 77 sites from sitesData and merges live backend data.
 */
export const getSites = async (): Promise<SiteRow[]> => {
  const unique = new Map<string, SiteRow>();
  const rawList = sitesData as Omit<SiteRow, 'id' | 'created_at'>[];

  // 1. Pre-populate with all 77 authoritative sites
  for (const s of rawList) {
    if (!s?.name) continue;
    const key = s.name.trim().toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, {
        ...s,
        name: s.name.trim(),
        id: makeId(s.position),
        created_at: new Date().toISOString(),
      });
    }
  }

  // 2. Fetch live data from backend and overlay fields
  try {
    const res = await fetch('/api/sites', {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json() as { success: boolean; sites: Array<{ id: string; name: string; product_line?: string; opsgenie_tag?: string; salesforce_account_id?: string; position?: number; open_cases_count?: number; is_down?: boolean; createdAt?: string }> };
      if (data.success && Array.isArray(data.sites)) {
        for (let idx = 0; idx < data.sites.length; idx++) {
          const s = data.sites[idx];
          if (!s?.name) continue;
          const key = s.name.trim().toLowerCase();
          const existing = unique.get(key);
          if (existing) {
            unique.set(key, {
              ...existing,
              id: s.id || existing.id,
              salesforce_account_id: s.salesforce_account_id || existing.salesforce_account_id,
              product_line: s.product_line || existing.product_line,
              opsgenie_tag: s.opsgenie_tag || existing.opsgenie_tag,
              position: s.position ?? existing.position,
              open_cases_count: s.open_cases_count ?? existing.open_cases_count,
              is_down: s.is_down ?? existing.is_down,
            });
          } else {
            unique.set(key, {
              id: s.id || makeId(s.position ?? unique.size + 1),
              name: s.name.trim(),
              product_line: s.product_line ?? null,
              opsgenie_tag: s.opsgenie_tag ?? null,
              salesforce_account_id: s.salesforce_account_id ?? null,
              position: s.position ?? unique.size + 1,
              open_cases_count: s.open_cases_count ?? 0,
              is_down: s.is_down ?? false,
              created_at: s.createdAt ?? new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Sites] Backend fetch warning, preserved authoritative snapshot:', (err as Error).message);
  }

  return Array.from(unique.values()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
};
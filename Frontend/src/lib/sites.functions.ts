import sitesData from '@/data/sites.json';

export type SiteRow = {
  id: string;
  name: string;
  product_line: string | null;
  product_lines?: string[];
  opsgenie_tag: string | null;
  salesforce_account_id: string | null;
  position: number;
  created_at: string;
  open_cases_count?: number;
  is_down?: boolean;
};

// Give each entry a stable deterministic ID based on position and name to guarantee uniqueness
function makeId(position: number, name?: string): string {
  const base = `local-site-${String(position).padStart(4, '0')}`;
  if (!name) return base;
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug ? `${base}-${slug}` : base;
}

/**
 * Fetch sites: Starts with authoritative 77 sites from sitesData and merges live backend data.
 */
export const getSites = async (): Promise<SiteRow[]> => {
  const unique = new Map<string, SiteRow>();
  const rawList = sitesData as Omit<SiteRow, 'id' | 'created_at'>[];

  // 1. Pre-populate with all authoritative sites
  for (const s of rawList) {
    if (!s?.name) continue;
    const key = s.name.trim().toLowerCase();
    if (!unique.has(key)) {
      const pLines = Array.isArray(s.product_lines) && s.product_lines.length > 0
        ? s.product_lines
        : (s.product_line ? s.product_line.split(',').map(x => x.trim()).filter(Boolean) : []);
      unique.set(key, {
        ...s,
        name: s.name.trim(),
        product_line: s.product_line || (pLines.length > 0 ? pLines.join(', ') : null),
        product_lines: pLines,
        id: makeId(s.position, s.name),
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
      const data = await res.json() as {
        success: boolean;
        sites: Array<{
          id: string;
          name: string;
          product_line?: string;
          product_lines?: string[];
          opsgenie_tag?: string;
          salesforce_account_id?: string;
          position?: number;
          open_cases_count?: number;
          is_down?: boolean;
          createdAt?: string;
        }>;
      };
      if (data.success && Array.isArray(data.sites)) {
        for (let idx = 0; idx < data.sites.length; idx++) {
          const s = data.sites[idx];
          if (!s?.name) continue;
          const key = s.name.trim().toLowerCase();
          const existing = unique.get(key);
          const pLines = Array.isArray(s.product_lines) && s.product_lines.length > 0
            ? s.product_lines
            : (s.product_line ? s.product_line.split(',').map(x => x.trim()).filter(Boolean) : existing?.product_lines || []);
          if (existing) {
            unique.set(key, {
              ...existing,
              id: s.id || existing.id,
              salesforce_account_id: s.salesforce_account_id || existing.salesforce_account_id,
              product_line: s.product_line || (pLines.length > 0 ? pLines.join(', ') : existing.product_line),
              product_lines: pLines,
              opsgenie_tag: s.opsgenie_tag || existing.opsgenie_tag,
              position: s.position ?? existing.position,
              open_cases_count: s.open_cases_count ?? existing.open_cases_count,
              is_down: s.is_down ?? existing.is_down,
            });
          } else {
            unique.set(key, {
              id: s.id || makeId(s.position ?? unique.size + 1, s.name),
              name: s.name.trim(),
              product_line: s.product_line ?? (pLines.length > 0 ? pLines.join(', ') : null),
              product_lines: pLines,
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

/**
 * Update product lines for a site via the backend API.
 */
export const updateSiteProductLines = async (siteId: string, productLines: string[]): Promise<boolean> => {
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/product-lines`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ product_lines: productLines }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Sites] Failed to update product lines on backend:', (err as Error).message);
    return false;
  }
};
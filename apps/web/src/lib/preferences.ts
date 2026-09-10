import type { PaginationMode } from "@ecl/shared";

/**
 * Per-viewer conveniences that never need to reach the server: sidebar
 * collapse state, the default pagination mode for records tables, and the
 * default page size. `localStorage` rather than `sessionStorage` - collapsing
 * the sidebar and then opening a second tab should show it collapsed too, not
 * reset, and `sessionStorage` is scoped per tab. A server-synced preference
 * would need its own table and a fetch before first paint (a visible flash of
 * the wrong layout); that is over-engineering for a handful of UI toggles.
 */

const SIDEBAR_KEY = "ecl.sidebar-open";
const PAGE_SIZE_KEY = "ecl.page-size";
const PAGINATION_MODE_KEY = "ecl.pagination-mode";

/**
 * Exported so the Preferences page's "reset to defaults" resets to what a
 * fresh browser actually gets. Duplicating these as literals over there is how
 * a reset silently starts writing a *non*-default value.
 */
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_PAGINATION_MODE: PaginationMode = "offset";

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function writeBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private browsing or blocked storage - the preference just won't stick */
  }
}

export const sidebarPreference = {
  get: (): boolean => readBoolean(SIDEBAR_KEY, true),
  set: (open: boolean): void => writeBoolean(SIDEBAR_KEY, open),
};

export const pageSizePreference = {
  get: (): number => {
    try {
      const raw = Number(localStorage.getItem(PAGE_SIZE_KEY));
      return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  },
  set: (size: number): void => {
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(size));
    } catch {
      /* ignore */
    }
  },
};

export const paginationModePreference = {
  get: (): PaginationMode => {
    try {
      const raw = localStorage.getItem(PAGINATION_MODE_KEY);
      return raw === "cursor" ? "cursor" : DEFAULT_PAGINATION_MODE;
    } catch {
      return DEFAULT_PAGINATION_MODE;
    }
  },
  set: (mode: PaginationMode): void => {
    try {
      localStorage.setItem(PAGINATION_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  },
};

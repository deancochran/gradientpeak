const HANDOFF_KEY = "gradientpeak:organization-invitation:v1";
const HANDOFF_PATH = "/organization-invitation";
const MAX_TOKEN_LENGTH = 256;
const MIN_TOKEN_LENGTH = 43;
const HANDOFF_TTL_MS = 10 * 60_000;
const tokenPattern = new RegExp(`^[A-Za-z0-9_-]{${MIN_TOKEN_LENGTH},${MAX_TOKEN_LENGTH}}$`);

type StoredInvitation = { expiresAt: number; token: string };

export function buildOrganizationInvitationLink(origin: string, token: string) {
  const link = new URL(HANDOFF_PATH, origin);
  link.hash = new URLSearchParams({ invitation: token }).toString();
  return link.toString();
}

export function captureOrganizationInvitationHandoff(window: Window, now = Date.now()) {
  if (window.location.pathname !== HANDOFF_PATH || !window.location.hash) return "absent" as const;

  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const values = fragment.getAll("invitation");
  const token = values.length === 1 ? values[0] : null;
  scrubFragment(window);
  const storage = getSessionStorage(window);
  if (!storage) return "storage_blocked" as const;
  try {
    storage.removeItem(HANDOFF_KEY);
  } catch {
    return "storage_blocked" as const;
  }
  if (!token || !tokenPattern.test(token)) return "invalid" as const;

  try {
    storage.setItem(
      HANDOFF_KEY,
      JSON.stringify({ expiresAt: now + HANDOFF_TTL_MS, token } satisfies StoredInvitation),
    );
    return "stored" as const;
  } catch {
    return "storage_blocked" as const;
  }
}

export function takeOrganizationInvitationHandoffFromWindow(window: Window, now = Date.now()) {
  const storage = getSessionStorage(window);
  return storage ? takeOrganizationInvitationHandoff(storage, now) : null;
}

export function takeOrganizationInvitationHandoff(storage: Storage, now = Date.now()) {
  let item: string | null = null;
  try {
    item = storage.getItem(HANDOFF_KEY);
    storage.removeItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!item) return null;
  try {
    const value: unknown = JSON.parse(item);
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as StoredInvitation).expiresAt !== "number" ||
      typeof (value as StoredInvitation).token !== "string" ||
      (value as StoredInvitation).expiresAt <= now ||
      !tokenPattern.test((value as StoredInvitation).token)
    )
      return null;
    return (value as StoredInvitation).token;
  } catch {
    return null;
  }
}

function scrubFragment(window: Window) {
  window.history.replaceState(window.history.state, "", `${HANDOFF_PATH}${window.location.search}`);
}

function getSessionStorage(window: Window) {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function initializeBrowserInstrumentation(capture: () => void, initialize: () => void) {
  capture();
  initialize();
}

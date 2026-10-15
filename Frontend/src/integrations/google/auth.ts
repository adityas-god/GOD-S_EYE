// Google Identity Services auth helper.
// Replace VITE_GOOGLE_CLIENT_ID in your .env with your actual OAuth 2.0 Client ID.

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

export interface GoogleUser {
  sub: string;       // unique user ID
  email: string;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
}

const STORAGE_KEY = 'google_id_token';

/** Decode the JWT payload from Google's credential (id_token). No signature verification needed client-side. */
function decodeJwt(token: string): GoogleUser | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as GoogleUser;
  } catch {
    return null;
  }
}

/** Persist the raw id_token so sessions survive refresh. */
export function saveToken(credential: string) {
  sessionStorage.setItem(STORAGE_KEY, credential);
}

export function clearToken() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getStoredUser(): GoogleUser | null {
  const token = sessionStorage.getItem(STORAGE_KEY);
  if (!token) return null;
  const user = decodeJwt(token);
  // Check expiry
  if (user && (user as unknown as { exp: number }).exp * 1000 < Date.now()) {
    clearToken();
    return null;
  }
  return user;
}

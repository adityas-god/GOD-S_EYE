import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getStoredUser, clearToken, type GoogleUser } from '@/integrations/google/auth';

interface AuthState {
  user: GoogleUser | null;
  admin: boolean;
  ready: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, admin: false, ready: false, signOut: () => {} });
export const useAuth = () => useContext(AuthContext);

// Admins: add email addresses here, or wire up to your own API later.
const ADMIN_EMAILS: string[] = [];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Restore session from sessionStorage on mount
    const stored = getStoredUser();
    setUser(stored);
    setReady(true);

    // Listen for sign-in events dispatched by the SignInDialog
    function onSignIn(e: Event) {
      const custom = e as CustomEvent<GoogleUser>;
      setUser(custom.detail);
    }
    window.addEventListener('google:signin', onSignIn);
    return () => window.removeEventListener('google:signin', onSignIn);
  }, []);

  function signOut() {
    clearToken();
    setUser(null);
    // Revoke token from Google if available
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }

  const admin = Boolean(user && (ADMIN_EMAILS.length === 0 || ADMIN_EMAILS.includes(user.email)));

  return <AuthContext.Provider value={{ user, admin, ready, signOut }}>{children}</AuthContext.Provider>;
}
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn, Plus, Trash2, ShieldCheck, AlertTriangle, PlugZap, Cloud, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GOOGLE_CLIENT_ID, saveToken, type GoogleUser } from '@/integrations/google/auth';
import { useAuth } from './auth-context';
import type { Site } from '@/lib/sites';

// Ensure Google GSI types are available
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
          renderButton: (element: HTMLElement, options: object) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

export function SignInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  function handleGoogleSignIn() {
    if (!window.google?.accounts?.id) {
      setError('Google Sign-In is not loaded yet. Please refresh and try again.');
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      setError('VITE_GOOGLE_CLIENT_ID is not set. Add it to your .env file.');
      return;
    }
    setPending(true);
    setError('');
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential: string }) => {
        saveToken(response.credential);
        // Decode the JWT to get user info
        try {
          const payload = JSON.parse(atob(response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as GoogleUser;
          window.dispatchEvent(new CustomEvent('google:signin', { detail: payload }));
          onOpenChange(false);
        } catch {
          setError('Failed to read sign-in response.');
        }
        setPending(false);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: render the button flow
        setPending(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="dialog-symbol"><ShieldCheck /></div>
          <DialogTitle>Welcome to Sitepulse</DialogTitle>
          <DialogDescription>Sign in with your Google account to access the workspace.</DialogDescription>
        </DialogHeader>
        <div className="dialog-form">
          <Button
            variant="outline"
            disabled={pending}
            onClick={handleGoogleSignIn}
            className="google-signin-btn"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            {pending ? 'Opening Google…' : 'Continue with Google'}
          </Button>
          {error && <p className="form-message" role="alert">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SiteEditor({ open, onOpenChange, site }: { open: boolean; onOpenChange: (v: boolean) => void; site?: Site }) {
  const { admin } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(site?.name ?? '');
  const [product, setProduct] = useState(site?.product_line ?? '');
  const [tag, setTag] = useState(site?.opsgenie_tag ?? '');
  const [account, setAccount] = useState(site?.salesforce_account_id ?? '');
  const mutation = useMutation({ mutationFn: async () => {
    if (!admin) throw new Error('Administrator access is required.');
    if (account && !/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(account)) throw new Error('Enter a valid 15- or 18-character Salesforce account ID.');
    // TODO: replace with your own API call
    console.log('Save site:', { name, product_line: product, opsgenie_tag: tag, salesforce_account_id: account });
  }, onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['sites'] }); onOpenChange(false); } });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{site ? 'Edit site' : 'Add a site'}</DialogTitle><DialogDescription>{admin ? 'Site details and source matching.' : 'Administrator access is required to add or edit sites.'}</DialogDescription></DialogHeader>{admin && <form className="dialog-form" onSubmit={e => { e.preventDefault(); mutation.mutate(); }}><label>Site name<Input required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Site name" /></label><label>Product line<select className="form-select" value={product} onChange={e => setProduct(e.target.value)}><option value="">Unassigned</option>{['RMS', 'RIL', 'RA', 'Case Pick'].map(p => <option key={p}>{p}</option>)}</select></label><label>Opsgenie site tag<Input value={tag} onChange={e => setTag(e.target.value)} placeholder="Exact tag used in Opsgenie" /></label><label>Salesforce account ID<Input value={account} onChange={e => setAccount(e.target.value)} placeholder="15- or 18-character account ID" /></label>{mutation.error && <p className="form-message" role="alert">{mutation.error.message}</p>}<Button disabled={mutation.isPending} type="submit"><Plus />{mutation.isPending ? 'Saving…' : site ? 'Save changes' : 'Add site'}</Button></form>}</DialogContent></Dialog>;
}

export function DeleteSiteDialog({ site, onClose }: { site: Site | null; onClose: () => void }) {
  const { admin } = useAuth(); const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: async () => {
    if (!site || !admin) throw new Error('Administrator access is required.');
    // TODO: replace with your own API call
    console.log('Delete site:', site.id);
  }, onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['sites'] }); onClose(); } });
  return <Dialog open={Boolean(site)} onOpenChange={v => { if (!v) onClose(); }}><DialogContent><DialogHeader><div className="dialog-symbol danger"><AlertTriangle /></div><DialogTitle>Delete {site?.name}?</DialogTitle><DialogDescription>This removes the site from the directory. Records in Opsgenie and Salesforce are not deleted.</DialogDescription></DialogHeader>{mutation.error && <p role="alert">{mutation.error.message}</p>}<div className="dialog-actions"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="destructive" disabled={!admin || mutation.isPending} onClick={() => mutation.mutate()}><Trash2 />{mutation.isPending ? 'Deleting…' : 'Delete site'}</Button></div></DialogContent></Dialog>;
}

export function ConnectionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><div className="dialog-symbol"><PlugZap /></div><DialogTitle>Data connections</DialogTitle><DialogDescription>Connection setup is pending. No live alerts or cases have been loaded.</DialogDescription></DialogHeader><div className="connection-row"><Radio /><div><strong>Opsgenie</strong><p>API key and instance region required</p></div><span className="pill">Not connected</span></div><div className="connection-row"><Cloud /><div><strong>Salesforce</strong><p>Account connection was skipped</p></div><span className="pill">Not connected</span></div></DialogContent></Dialog>;
}
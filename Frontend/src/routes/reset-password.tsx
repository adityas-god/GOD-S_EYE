import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';

export const Route = createFileRoute('/reset-password')({
  head: () => ({
    meta: [
      { title: 'Authentication — Sitepulse' },
      { name: 'description', content: 'Sitepulse workspace authentication managed via Google SSO.' },
      { property: 'og:title', content: 'Authentication — Sitepulse' },
      { property: 'og:description', content: 'Secure access to your operations workspace.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Google SSO Authentication</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sitepulse uses Google Identity Services for single sign-on. Local password management is disabled.
        </p>
        <div className="mt-6 flex justify-center">
          <Button asChild>
            <Link to="/">Back to Workspace</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
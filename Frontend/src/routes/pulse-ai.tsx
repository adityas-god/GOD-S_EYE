import { useState, useEffect, useRef, type ReactNode } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowUp,
  RotateCcw,
  User,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  Activity,
  ShieldAlert,
  Flame,
  Building2,
  LogOut,
  HelpCircle,
  BarChart2,
  Zap,
  Maximize2,
  Minimize2,
  Code,
  Eye,
  ExternalLink,
  X,
  Layers,
  LayoutDashboard,
  SlidersHorizontal,
  LayoutGrid,
} from 'lucide-react';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/pulse-ai')({
  head: () => ({
    meta: [
      {
        title: 'Pulse AI | Autonomous Operations Intelligence — Sitepulse',
      },
    ],
  }),
  component: PulseAIPage,
});

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolsUsed?: Array<{ tool: string; args: Record<string, unknown> }>;
}

// Official Sitepulse Brand Logo Component
function SitepulseLogo({
  size = 'md',
  withLabel = false,
  labelSuffix = 'Pulse AI'
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  withLabel?: boolean;
  labelSuffix?: string;
}) {
  const scale = size === 'xs' ? 0.65 : size === 'sm' ? 0.82 : size === 'lg' ? 1.3 : 1;
  const barWidth = Math.round(3.5 * scale);
  const gap = Math.round(2.5 * scale);
  const h1 = Math.round(14 * scale);
  const h2 = Math.round(24 * scale);
  const h3 = Math.round(18 * scale);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, verticalAlign: 'middle' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap,
          height: h2 + 2,
          flexShrink: 0
        }}
        aria-label="Sitepulse Logo"
      >
        <span style={{ width: barWidth, height: h1, background: 'var(--primary)', borderRadius: 2, transform: 'skewY(-15deg)' }} />
        <span style={{ width: barWidth, height: h2, background: 'var(--primary)', borderRadius: 2, transform: 'skewY(-15deg)' }} />
        <span style={{ width: barWidth, height: h3, background: 'var(--primary)', borderRadius: 2, transform: 'skewY(-15deg)' }} />
      </span>

      {withLabel && (
        <span style={{
          fontSize: size === 'lg' ? 19 : 13.5,
          fontWeight: 700,
          letterSpacing: '-0.4px',
          color: 'var(--foreground)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6
        }}>
          sitepulse<span style={{ color: 'var(--primary)' }}>.</span>
          {labelSuffix && (
            <span style={{
              background: 'var(--secondary)',
              color: 'var(--muted-foreground)',
              border: '1px solid var(--border)',
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 4,
              letterSpacing: 0.3
            }}>
              {labelSuffix}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

const SAMPLE_PROMPTS = [
  {
    icon: Flame,
    title: 'Cross-Site Incident Benchmark',
    desc: 'Compare Sev 1 & Sev 2 incident trends between Sams Club ATL and Walmart Mexico.',
    prompt: 'Compare Sev 1 and Sev 2 incident counts and downtime between Sams Club ATL and Walmart Mexico for the last 30 days. Highlight key operational deltas.',
  },
  {
    icon: ShieldAlert,
    title: 'RED Zone Reliability Audit',
    desc: 'List all sites currently qualifying for RED Zone and their breach criteria.',
    prompt: 'Which customer sites are currently in or qualifying for RED Zone reliability audit? Show their breach reasons and qualifying incidents.',
  },
  {
    icon: Activity,
    title: 'Site Alert Deep Dive',
    desc: 'Top recurring alert signatures and MTTR for GXO-H&M Prod.',
    prompt: 'Analyze alert telemetry for GXO-H&M Prod over the past 7 days. What are the top recurring failure signatures and MTTR?',
  },
  {
    icon: BarChart2,
    title: 'Fleet-Wide Operations Brief',
    desc: 'Live summary of open cases, severity distribution, and down sites.',
    prompt: 'Give me a comprehensive fleet-wide operations summary right now: total open cases, urgent incidents, down sites, and top sites needing attention.',
  },
];

export function PulseAIPage() {
  // Session Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authOrgId, setAuthOrgId] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Mode: 'agent' | 'query' (inspired by CodaAI segmented pill [Agent | Ask])
  const [aiMode, setAiMode] = useState<'agent' | 'query'>('agent');

  // Chat & Agent State (Ephemeral In-Memory Only)
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [fullscreenArtifact, setFullscreenArtifact] = useState<{ html: string; title: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatThreadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize or resume session (ephemeral check - refresh automatically resets chat memory)
  useEffect(() => {
    const savedOrg = sessionStorage.getItem('sitepulse_ai_org');
    const savedSess = sessionStorage.getItem('sitepulse_ai_session');

    if (savedOrg && savedSess) {
      // Tell server to delete any prior in-memory chat session data
      fetch('/api/pulse-ai/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: savedSess }),
      }).catch(() => {});

      // Allocate a fresh isolated session ID for this session
      const freshSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem('sitepulse_ai_session', freshSessionId);

      setAuthOrgId(savedOrg);
      setSessionId(freshSessionId);
      setIsAuthenticated(true);
      setMessages([]); // Fresh start on refresh
    }
  }, []);

  // Purge server session on tab close or page refresh
  useEffect(() => {
    const handleUnload = () => {
      const activeSess = sessionStorage.getItem('sitepulse_ai_session');
      if (activeSess) {
        navigator.sendBeacon?.(
          '/api/pulse-ai/clear',
          new Blob([JSON.stringify({ sessionId: activeSess })], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // Auto-scroll ONLY the chat messages container - never the whole page or window
  useEffect(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTo({
        top: chatThreadRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isLoading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authOrgId.trim() || !authPassword.trim()) {
      setAuthError('Please enter both Organization ID and Password.');
      return;
    }

    setAuthError('');
    setIsAuthenticating(true);

    try {
      const res = await fetch('/api/pulse-ai/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: authOrgId.trim(),
          password: authPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setAuthError(data.error || 'Authentication failed. Please verify credentials.');
        return;
      }

      // Store in ephemeral sessionStorage only
      sessionStorage.setItem('sitepulse_ai_org', data.orgId);
      sessionStorage.setItem('sitepulse_ai_session', data.sessionId);

      setAuthOrgId(data.orgId);
      setSessionId(data.sessionId);
      setIsAuthenticated(true);
      setMessages([]); // Fresh in-memory start
    } catch (err: unknown) {
      setAuthError((err as Error).message || 'Server connection error during authentication.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('sitepulse_ai_org');
    sessionStorage.removeItem('sitepulse_ai_session');
    setIsAuthenticated(false);
    setMessages([]);
    setSessionId('');
    setAuthPassword('');
  };

  const handleNewChat = async () => {
    if (sessionId) {
      // Clear in-memory state on backend
      fetch('/api/pulse-ai/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }

    // Allocate fresh ephemeral session
    const freshSession = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('sitepulse_ai_session', freshSession);
    setSessionId(freshSession);
    setMessages([]);
    setInputMessage('');
    textareaRef.current?.focus();
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: textToSend.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/pulse-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          orgId: authOrgId,
          message: textToSend.trim(),
        }),
      });

      if (!res.ok) {
        let errMessage = `Server returned HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData?.error) errMessage = errData.error;
        } catch {
          errMessage = `Server error (${res.status} ${res.statusText || 'Bad Gateway'}). Backend service may be restarting.`;
        }
        throw new Error(errMessage);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to receive response from Pulse AI.');
      }

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant',
        content: data.reply,
        timestamp: Date.now(),
        toolsUsed: data.toolsUsed,
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: `⚠️ **Pulse AI Notice**: ${(err as Error).message || 'Unable to complete operational query. Please try again.'}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleToolDetails = (id: string) => {
    setExpandedTools(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Injects baseline executive Sitepulse dark theme into HTML artifacts if missing
  const processArtifactHtml = (rawHtml: string): string => {
    if (!rawHtml.includes('<html') && !rawHtml.includes('<!DOCTYPE')) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sitepulse Executive Operations Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1217;
      --card: #161a23;
      --border: #262e3d;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #f97316;
      --red: #ef4444;
      --green: #10b981;
      --blue: #38bdf8;
      --amber: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 24px;
      font-size: 13px;
      line-height: 1.5;
    }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    th { background: #1f2533; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); }
    td { padding: 10px 14px; border-bottom: 1px solid var(--border); }
    tr:hover { background: rgba(255, 255, 255, 0.03); }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 11px; }
    .badge-sev1 { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge-sev2 { background: rgba(249, 115, 22, 0.15); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.4); }
    .badge-solved { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-progress { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); }
  </style>
</head>
<body>
  ${rawHtml}
</body>
</html>`;
    }
    return rawHtml;
  };

  // Executive Inline Parser: strips all raw loose asterisks, converts Case numbers, Severities, Statuses into pill badges
  const renderExecutiveInline = (rawText: string): ReactNode => {
    if (!rawText) return null;

    // Split on inline code blocks first `...`
    const codeParts = rawText.split(/(`[^`]+`)/g);

    return codeParts.map((part, pIdx) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        const code = part.slice(1, -1);
        return (
          <code key={pIdx} style={{
            background: 'var(--muted)',
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--primary)',
            border: '1px solid var(--border)',
          }}>
            {code}
          </code>
        );
      }

      // Split bold segments (**...**), italic segments (*...*), or regular text
      const mdParts = part.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);

      return mdParts.map((sub, sIdx) => {
        let isBold = false;
        let text = sub;

        if (sub.startsWith('**') && sub.endsWith('**')) {
          isBold = true;
          text = sub.slice(2, -2);
        } else if (sub.startsWith('*') && sub.endsWith('*')) {
          text = sub.slice(1, -1);
        }

        // Clean any remaining raw asterisks completely
        text = text.replace(/\*/g, '');

        // Tokenize Case Numbers, Severities, and Statuses
        const entityParts = text.split(/(\b00\d{6}\b|\[?SEV[- ]*1(?:\s*URGENT)?\]?|\[?SEV[- ]*2\s*URGENT\]?|\[?SEV[- ]*2\s*HIGH\]?|\[?SEV[- ]*3(?:\s*INCIDENT)?\]?|\[?SEV[- ]*4(?:\s*SERVICE\s*REQUEST)?\]?|\bOperational\b|\bSolved\b|\bResolved\b|\bIn-Progress\b|\bAssigned\b|\bNew \(Active\)\b|\bPending Info\b|\bPending Confirmation\b)/gi);

        return entityParts.map((chunk, cIdx) => {
          const key = `${pIdx}_${sIdx}_${cIdx}`;

          // 1. Salesforce Case Number: e.g. 00297257
          if (/^00\d{6}$/.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: 'rgba(249, 115, 22, 0.1)',
                  color: '#f97316',
                  padding: '2px 7px',
                  borderRadius: 4,
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  fontWeight: 650,
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  margin: '0 2px',
                }}
                title="Salesforce Case Number"
              >
                #{chunk}
              </span>
            );
          }

          // 2. Sev 1 Urgent Badge (100% Impact)
          if (/^\[?SEV[- ]*1(?:\s*URGENT)?\]?$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: 0.3,
                  margin: '0 3px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
                SEV 1 URGENT
              </span>
            );
          }

          // 3. Sev 2 Urgent Badge (99% - 50% Impact)
          if (/^\[?SEV[- ]*2\s*URGENT\]?$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(249, 115, 22, 0.16)',
                  color: '#fb923c',
                  border: '1px solid rgba(249, 115, 22, 0.45)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: 0.3,
                  margin: '0 3px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', boxShadow: '0 0 6px #f97316' }} />
                SEV 2 URGENT
              </span>
            );
          }

          // 4. Sev 2 High Badge (49% - 1% Impact)
          if (/^\[?SEV[- ]*2(?:\s*HIGH)?\]?$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#fcd34d',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: 0.3,
                  margin: '0 3px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 6px #f59e0b' }} />
                SEV 2 HIGH
              </span>
            );
          }

          // 5. Sev 3 Incident Badge (<1% or 0% Impact)
          if (/^\[?SEV[- ]*3(?:\s*INCIDENT)?\]?$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(56, 189, 248, 0.12)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: 0.3,
                  margin: '0 3px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                SEV 3 INCIDENT
              </span>
            );
          }

          // 6. Sev 4 Service Request Badge
          if (/^\[?SEV[- ]*4(?:\s*SERVICE\s*REQUEST)?\]?$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(168, 85, 247, 0.12)',
                  color: '#c084fc',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: 0.3,
                  margin: '0 3px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />
                SEV 4 SERVICE REQUEST
              </span>
            );
          }

          // 4. Status: Operational
          if (/^Operational$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 600,
                  fontSize: 11,
                  margin: '0 2px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                Operational
              </span>
            );
          }

          // 5. Status: Solved / Resolved
          if (/^(Solved|Resolved)$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 600,
                  fontSize: 11,
                  margin: '0 2px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                {chunk}
              </span>
            );
          }

          // 6. Status: In-Progress
          if (/^In-Progress$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(56, 189, 248, 0.12)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 600,
                  fontSize: 11,
                  margin: '0 2px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                In-Progress
              </span>
            );
          }

          // 7. Status: Assigned / New (Active)
          if (/^(Assigned|New \(Active\))$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(129, 140, 248, 0.12)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(129, 140, 248, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 600,
                  fontSize: 11,
                  margin: '0 2px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8' }} />
                {chunk}
              </span>
            );
          }

          // 8. Status: Pending Info / Pending Confirmation
          if (/^(Pending Info|Pending Confirmation)$/i.test(chunk)) {
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(234, 179, 8, 0.12)',
                  color: '#facc15',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 600,
                  fontSize: 11,
                  margin: '0 2px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#eab308' }} />
                {chunk}
              </span>
            );
          }

          // Standard text or bold emphasis
          if (isBold) {
            return (
              <strong key={key} style={{ color: 'var(--foreground)', fontWeight: 650 }}>
                {chunk}
              </strong>
            );
          }

          return <span key={key}>{chunk}</span>;
        });
      });
    });
  };

  // Interactive Claude-like Artifact Viewer Component
  const renderArtifactCard = (htmlCode: string, blockKey: string) => {
    let title = 'Executive Operational Dashboard';
    const titleMatch = htmlCode.match(/<title>([^<]+)<\/title>/i) || htmlCode.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/[*#]/g, '').trim();
    }

    const safeHtml = processArtifactHtml(htmlCode);

    return (
      <div key={`artifact_${blockKey}`} style={{
        margin: '18px 0',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.28)',
      }}>
        {/* Top Header Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--muted)',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          {/* Left Title & Artifact Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
            }}>
              <LayoutDashboard style={{ width: 14, height: 14 }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {title}
                <span style={{
                  background: 'rgba(249, 115, 22, 0.15)',
                  color: '#f97316',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}>
                  INTERACTIVE ARTIFACT
                </span>
              </div>
            </div>
          </div>

          {/* Right Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Copy Button */}
            <button
              onClick={() => copyToClipboard(htmlCode, `art_${blockKey}`)}
              title="Copy HTML"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 9px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--muted-foreground)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {copiedId === `art_${blockKey}` ? <Check style={{ width: 12, height: 12, color: '#22c55e' }} /> : <Copy style={{ width: 12, height: 12 }} />}
              {copiedId === `art_${blockKey}` ? 'Copied' : 'Copy HTML'}
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={() => setFullscreenArtifact({ html: safeHtml, title })}
              title="Expand to Fullscreen View"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 9px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--muted-foreground)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              <Maximize2 style={{ width: 12, height: 12 }} />
              Fullscreen
            </button>

            {/* Open in New Tab */}
            <button
              onClick={() => {
                const blob = new Blob([safeHtml], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              }}
              title="Open in new browser tab"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '5px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--muted-foreground)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              <ExternalLink style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>

        {/* Live Interactive Iframe */}
        <iframe
          srcDoc={safeHtml}
          style={{
            width: '100%',
            height: 520,
            border: 'none',
            background: '#0e1117',
            display: 'block',
          }}
          sandbox="allow-scripts allow-same-origin allow-modals"
          title={title}
        />
      </div>
    );
  };

  // Render Formatted Message Markdown and Interactive Artifacts
  const renderFormattedContent = (content: string) => {
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const elements: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    const renderMarkdownBlock = (markdownText: string, blockKey: string) => {
      const lines = markdownText.split('\n');
      const subElements: ReactNode[] = [];
      let inTable = false;
      let tableRows: string[][] = [];
      let tableHeaders: string[] = [];

      const flushTable = (k: number) => {
        if (tableHeaders.length > 0) {
          subElements.push(
            <div key={`tbl_${blockKey}_${k}`} style={{ overflowX: 'auto', margin: '14px 0' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)'
              }}>
                <thead>
                  <tr style={{ background: 'var(--muted)', textAlign: 'left' }}>
                    {tableHeaders.map((th, i) => (
                      <th key={i} style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border)',
                        fontWeight: 700,
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: 'var(--muted-foreground)'
                      }}>
                        {renderExecutiveInline(th.trim())}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)'; }}
                    >
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                          {renderExecutiveInline(cell.trim())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        inTable = false;
        tableRows = [];
        tableHeaders = [];
      };

      lines.forEach((line, idx) => {
        const trimmed = line.trim();

        // Markdown pipe table: | a | b |
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          const cells = trimmed.slice(1, -1).split('|');
          if (cells.every(c => /^[\s-:]+$/.test(c))) {
            return;
          }
          if (!inTable) {
            inTable = true;
            tableHeaders = cells;
          } else {
            tableRows.push(cells);
          }
          return;
        }

        // Tab-separated table: col1\tcol2
        if (line.includes('\t') && line.split('\t').length >= 2) {
          const cells = line.split('\t').map(c => c.trim()).filter(Boolean);
          if (cells.length >= 2) {
            if (!inTable) {
              inTable = true;
              tableHeaders = cells;
            } else {
              tableRows.push(cells);
            }
            return;
          }
        }

        if (inTable) {
          flushTable(idx);
        }

        // Horizontal dividers: --- or ***
        if (/^(\-{3,}|\*{3,})$/.test(trimmed)) {
          subElements.push(
            <div key={`${blockKey}_hr_${idx}`} style={{
              height: 1,
              background: 'var(--border)',
              margin: '20px 0',
            }} />
          );
          return;
        }

        // Headers (strip loose asterisks cleanly)
        if (trimmed.startsWith('#### ')) {
          const title = trimmed.replace('#### ', '').replace(/\*/g, '');
          subElements.push(
            <h4 key={`${blockKey}_h4_${idx}`} style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              margin: '16px 0 6px',
              color: 'var(--muted-foreground)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span style={{ width: 4, height: 12, background: 'var(--primary)', borderRadius: 2 }} />
              {title}
            </h4>
          );
        } else if (trimmed.startsWith('### ')) {
          const title = trimmed.replace('### ', '').replace(/\*/g, '');
          subElements.push(
            <h3 key={`${blockKey}_h3_${idx}`} style={{
              fontSize: 16,
              fontWeight: 700,
              margin: '16px 0 8px',
              color: 'var(--foreground)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span style={{ width: 4, height: 16, background: 'var(--primary)', borderRadius: 2 }} />
              {title}
            </h3>
          );
        } else if (trimmed.startsWith('## ')) {
          const title = trimmed.replace('## ', '').replace(/\*/g, '');
          subElements.push(
            <h2 key={`${blockKey}_h2_${idx}`} style={{
              fontSize: 18,
              fontWeight: 700,
              margin: '20px 0 10px',
              color: 'var(--foreground)',
              borderBottom: '1px solid var(--border)',
              paddingBottom: 6
            }}>
              {title}
            </h2>
          );
        } else if (trimmed.startsWith('# ')) {
          const title = trimmed.replace('# ', '').replace(/\*/g, '');
          subElements.push(
            <h1 key={`${blockKey}_h1_${idx}`} style={{
              fontSize: 22,
              fontWeight: 800,
              margin: '24px 0 12px',
              color: 'var(--foreground)',
              letterSpacing: '-0.3px'
            }}>
              {title}
            </h1>
          );
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          // Bullet points
          const bulletText = trimmed.slice(2);
          subElements.push(
            <div key={`${blockKey}_li_${idx}`} style={{
              display: 'flex',
              gap: 10,
              margin: '6px 0',
              alignItems: 'flex-start',
              lineHeight: 1.6
            }}>
              <span style={{
                color: 'var(--primary)',
                marginTop: 2,
                fontWeight: 800,
                fontSize: 14,
                flexShrink: 0
              }}>•</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {renderExecutiveInline(bulletText)}
              </div>
            </div>
          );
        } else if (trimmed) {
          subElements.push(
            <p key={`${blockKey}_p_${idx}`} style={{
              margin: '8px 0',
              lineHeight: 1.65,
              color: 'var(--foreground)',
              fontSize: 13.5
            }}>
              {renderExecutiveInline(line)}
            </p>
          );
        } else {
          subElements.push(<div key={`${blockKey}_sp_${idx}`} style={{ height: 6 }} />);
        }
      });

      if (inTable) {
        flushTable(lines.length);
      }

      return subElements;
    };

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore.trim()) {
        elements.push(...renderMarkdownBlock(textBefore, `blk_${lastIndex}`));
      }

      const lang = (match[1] || '').trim().toLowerCase();
      const code = match[2] || '';

      // Check if this is an HTML dashboard artifact
      const isHtmlArtifact = lang === 'html' || code.includes('<!DOCTYPE html') || code.includes('<html') || code.includes('<div class="');

      if (isHtmlArtifact) {
        elements.push(renderArtifactCard(code, `art_${match.index}`));
      } else {
        // General Code Block (SOQL, JSON, SQL, etc.)
        elements.push(
          <div key={`code_${match.index}`} style={{
            margin: '14px 0',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 12px',
              background: 'var(--muted)',
              borderBottom: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)'
            }}>
              <span>{lang ? lang.toUpperCase() : 'CODE'}</span>
              <button
                onClick={() => copyToClipboard(code, `code_${match?.index}`)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted-foreground)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11
                }}
              >
                {copiedId === `code_${match.index}` ? <Check style={{ width: 12, height: 12, color: '#22c55e' }} /> : <Copy style={{ width: 12, height: 12 }} />}
                {copiedId === `code_${match.index}` ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre style={{
              margin: 0,
              padding: 12,
              overflowX: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              background: 'var(--background)',
              color: 'var(--foreground)'
            }}>
              {code}
            </pre>
          </div>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    const remainingText = content.substring(lastIndex);
    if (remainingText.trim()) {
      elements.push(...renderMarkdownBlock(remainingText, `blk_${lastIndex}`));
    }

    return elements;
  };

  return (
    <DashboardShell>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        flex: 1,
        position: 'relative',
        background: 'var(--background)',
        overflow: 'hidden'
      }}>
        {/* Top Header Bar - Simplified & Line Removed */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 24px',
          borderBottom: 'none',
          background: 'transparent',
          zIndex: 10,
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SitepulseLogo size="sm" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '-0.3px',
                color: 'var(--foreground)'
              }}>
                pulse AI
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#22c55e',
                  display: 'inline-block',
                  boxShadow: '0 0 6px rgba(34, 197, 94, 0.5)'
                }}
                title="Live Operations Intelligence"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isAuthenticated && (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'var(--card)',
                  border: '1px solid var(--border)'
                }}>
                  <Building2 style={{ width: 13, height: 13, color: 'var(--primary)' }} />
                  <span>Org: <strong style={{ color: 'var(--foreground)' }}>{authOrgId}</strong></span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewChat}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, height: 30, borderRadius: 6 }}
                >
                  <RotateCcw style={{ width: 12, height: 12 }} />
                  New Session
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  title="Lock & End Session"
                  style={{ color: 'var(--muted-foreground)', width: 30, height: 30, padding: 0, borderRadius: 6 }}
                >
                  <LogOut style={{ width: 14, height: 14 }} />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* AUTHENTICATION GATE (Minimal Enterprise Auth) */}
        {!isAuthenticated ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'var(--background)'
          }}>
            <div style={{
              width: '100%',
              maxWidth: 420,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '36px 32px',
              boxShadow: 'var(--shadow)',
              textAlign: 'center'
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20
              }}>
                <SitepulseLogo size="lg" withLabel labelSuffix="AI" />
              </div>

              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: 'var(--foreground)', letterSpacing: '-0.3px' }}>
                Pulse AI Authentication
              </h2>
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 24px', lineHeight: 1.5 }}>
                Enter your Organization ID and access password to initiate an ephemeral operations intelligence session.
              </p>

              {authError && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontSize: 12,
                  marginBottom: 16,
                  textAlign: 'left'
                }}>
                  {authError}
                </div>
              )}

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6, display: 'block' }}>
                    Organization ID
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. greyorange, gxo, or your org"
                    value={authOrgId}
                    onChange={(e) => setAuthOrgId(e.target.value)}
                    autoFocus
                    required
                    style={{ background: 'var(--background)' }}
                  />
                </div>

                <div style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6, display: 'block' }}>
                    Access Password
                  </label>
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    style={{ background: 'var(--background)' }}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isAuthenticating}
                  style={{
                    marginTop: 8,
                    background: 'var(--primary)',
                    color: '#fff',
                    fontWeight: 600,
                    height: 40,
                    fontSize: 14,
                  }}
                >
                  {isAuthenticating ? 'Authenticating…' : 'Authenticate & Enter'}
                </Button>
              </form>

              <div style={{ marginTop: 22, fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                🔒 <em>Ephemeral Security: Chat telemetry is held strictly in RAM and purged on browser refresh.</em>
              </div>
            </div>
          </div>
        ) : (
          /* CHAT INTERFACE */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            background: 'var(--background)'
          }}>
            {/* Scrollable Message Thread */}
            <div
              ref={chatThreadRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: messages.length === 0 ? '20px' : '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: messages.length === 0 ? 'center' : 'flex-start',
                gap: 20
              }}
            >
              {/* Empty / Welcome State - Centered Single Chat Box */}
              {messages.length === 0 && (
                <div
                  className="pulse-ai-message-fade"
                  style={{
                    maxWidth: 720,
                    width: '100%',
                    margin: 'auto',
                    textAlign: 'center',
                    padding: '16px 0'
                  }}
                >
                  {/* Headline & Subtitle */}
                  <div style={{ marginBottom: 28 }}>
                    <h1 style={{
                      fontSize: 28,
                      fontWeight: 700,
                      letterSpacing: '-0.5px',
                      color: 'var(--foreground)',
                      margin: '0 0 10px'
                    }}>
                      Welcome to pulse AI
                    </h1>
                    <p style={{
                      fontSize: 14,
                      color: 'var(--muted-foreground)',
                      maxWidth: 520,
                      margin: '0 auto',
                      lineHeight: 1.5
                    }}>
                      Autonomous operations intelligence, incident telemetry, and live fleet analytics.
                    </p>
                  </div>

                  {/* Centered Omni-Card (Inspired by Image 2 CodaAI) */}
                  <div style={{
                    width: '100%',
                    maxWidth: 680,
                    margin: '0 auto',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.22)',
                    padding: '12px 14px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    textAlign: 'left'
                  }}>
                    {/* Omni-Card Top Bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: 8,
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SitepulseLogo size="xs" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.2px' }}>
                          pulse AI
                        </span>
                      </div>

                      {/* Segmented [Agent | Ask] switcher */}
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: 'var(--muted)',
                        borderRadius: 7,
                        padding: 2,
                        border: '1px solid var(--border)'
                      }}>
                        <button
                          type="button"
                          onClick={() => setAiMode('agent')}
                          style={{
                            padding: '3px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 5,
                            border: 'none',
                            cursor: 'pointer',
                            background: aiMode === 'agent' ? 'var(--card)' : 'transparent',
                            color: aiMode === 'agent' ? 'var(--foreground)' : 'var(--muted-foreground)',
                            boxShadow: aiMode === 'agent' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          Agent
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiMode('query')}
                          style={{
                            padding: '3px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 5,
                            border: 'none',
                            cursor: 'pointer',
                            background: aiMode === 'query' ? 'var(--card)' : 'transparent',
                            color: aiMode === 'query' ? 'var(--foreground)' : 'var(--muted-foreground)',
                            boxShadow: aiMode === 'query' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          Ask
                        </button>
                      </div>
                    </div>

                    {/* Omni-Card Textarea */}
                    <textarea
                      ref={textareaRef}
                      rows={3}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        aiMode === 'agent'
                          ? "Ask Pulse AI to benchmark incidents, audit sites, or analyze telemetry..."
                          : "Ask any operations question or execute Salesforce SOQL..."
                      }
                      disabled={isLoading}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--foreground)',
                        fontSize: 14,
                        resize: 'none',
                        outline: 'none',
                        lineHeight: 1.5,
                        padding: '6px 4px'
                      }}
                    />

                    {/* Omni-Card Bottom Bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: 4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted-foreground)' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 8px',
                          borderRadius: 5,
                          background: 'var(--muted)',
                          border: '1px solid var(--border)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11
                        }}>
                          <Zap style={{ width: 11, height: 11, color: 'var(--primary)' }} />
                          pulse x_7
                        </span>
                        <span style={{ fontSize: 11, opacity: 0.7 }}>
                          {aiMode === 'agent' ? 'Multi-tool operations reasoning' : 'Direct answering'}
                        </span>
                      </div>

                      <Button
                        onClick={() => handleSendMessage()}
                        disabled={!inputMessage.trim() || isLoading}
                        size="sm"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          padding: 0,
                          background: inputMessage.trim() ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                          border: inputMessage.trim() ? '1px solid var(--primary)' : '1px solid var(--border)',
                          color: inputMessage.trim() ? '#fff' : 'var(--muted-foreground)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.18s ease',
                          cursor: inputMessage.trim() ? 'pointer' : 'default'
                        }}
                        aria-label="Send query"
                      >
                        <ArrowUp style={{ width: 16, height: 16, strokeWidth: 2.2 }} />
                      </Button>
                    </div>
                  </div>

                  {/* 4 Sleek Horizontal Suggestion Chips */}
                  <div style={{
                    maxWidth: 680,
                    margin: '22px auto 0',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                    width: '100%'
                  }}>
                    {SAMPLE_PROMPTS.map((sp, idx) => {
                      const Icon = sp.icon;
                      return (
                        <div
                          key={idx}
                          onClick={() => handleSendMessage(sp.prompt)}
                          style={{
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            padding: '12px 14px',
                            cursor: 'pointer',
                            transition: 'all 0.18s ease',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            textAlign: 'left'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--primary)';
                            e.currentTarget.style.background = 'var(--muted)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.background = 'var(--card)';
                          }}
                        >
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: 'rgba(249, 115, 22, 0.08)',
                            border: '1px solid rgba(249, 115, 22, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: 1
                          }}>
                            <Icon style={{ width: 14, height: 14, color: 'var(--primary)' }} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)', marginBottom: 2 }}>
                              {sp.title}
                            </div>
                            <div style={{
                              fontSize: 11,
                              color: 'var(--muted-foreground)',
                              lineHeight: 1.35,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>
                              {sp.desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Message List */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="pulse-ai-message-fade"
                  style={{
                    display: 'flex',
                    gap: 12,
                    maxWidth: 820,
                    width: '100%',
                    margin: '0 auto',
                    alignSelf: 'center'
                  }}
                >
                  {/* Role Avatar */}
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: msg.role === 'user' ? 'var(--muted)' : 'var(--card)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                    fontSize: 12,
                    fontWeight: 700
                  }}>
                    {msg.role === 'user' ? (
                      authOrgId ? authOrgId.charAt(0).toUpperCase() : <User style={{ width: 14, height: 14 }} />
                    ) : (
                      <SitepulseLogo size="xs" />
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 4,
                      fontSize: 12,
                      color: 'var(--muted-foreground)'
                    }}>
                      <strong style={{ color: 'var(--foreground)', fontSize: 13 }}>
                        {msg.role === 'user' ? 'You' : 'pulse AI'}
                      </strong>
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                      {msg.role === 'assistant' && (
                        <button
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--muted-foreground)',
                            marginLeft: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11
                          }}
                          title="Copy response"
                        >
                          {copiedId === msg.id ? <Check style={{ width: 12, height: 12, color: '#22c55e' }} /> : <Copy style={{ width: 12, height: 12 }} />}
                          {copiedId === msg.id ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>

                    {/* Agent Tools Execution Indicator */}
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div style={{ margin: '8px 0' }}>
                        <div
                          onClick={() => toggleToolDetails(msg.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 9px',
                            borderRadius: 5,
                            background: 'rgba(249, 115, 22, 0.08)',
                            border: '1px solid rgba(249, 115, 22, 0.22)',
                            fontSize: 11,
                            color: 'var(--primary)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontFamily: 'var(--font-mono)'
                          }}
                        >
                          <Zap style={{ width: 11, height: 11 }} />
                          Executed {msg.toolsUsed.length} operations telemetry {msg.toolsUsed.length === 1 ? 'tool' : 'tools'}
                          {expandedTools[msg.id] ? <ChevronUp style={{ width: 11, height: 11 }} /> : <ChevronDown style={{ width: 11, height: 11 }} />}
                        </div>

                        {expandedTools[msg.id] && (
                          <div style={{
                            margin: '6px 0',
                            padding: '10px 12px',
                            borderRadius: 6,
                            background: 'var(--muted)',
                            border: '1px solid var(--border)',
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)'
                          }}>
                            {msg.toolsUsed.map((t, idx) => (
                              <div key={idx} style={{ margin: '3px 0' }}>
                                <span style={{ color: 'var(--primary)' }}>⚡ {t.tool}</span>
                                {Object.keys(t.args).length > 0 && (
                                  <span style={{ color: 'var(--muted-foreground)', marginLeft: 6 }}>
                                    ({JSON.stringify(t.args)})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div style={{
                      display: msg.role === 'user' ? 'inline-block' : 'block',
                      maxWidth: msg.role === 'user' ? '82%' : '100%',
                      background: msg.role === 'user' ? 'var(--card)' : 'transparent',
                      border: msg.role === 'user' ? '1px solid var(--border)' : 'none',
                      borderRadius: 10,
                      padding: msg.role === 'user' ? '8px 14px' : '2px 0',
                      color: 'var(--foreground)',
                      fontSize: 14,
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                      boxShadow: msg.role === 'user' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}>
                      {renderFormattedContent(msg.content)}
                    </div>
                  </div>
                </div>
              ))}

              {/* Thinking / Tool Calling Animation */}
              {isLoading && (
                <div style={{
                  display: 'flex',
                  gap: 12,
                  maxWidth: 820,
                  width: '100%',
                  margin: '0 auto',
                  alignSelf: 'center'
                }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <SitepulseLogo size="xs" />
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--muted-foreground)',
                    fontSize: 12.5,
                    padding: '4px 0'
                  }}>
                    <span style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      animation: 'pulse 1.4s ease-in-out infinite'
                    }} />
                    <span>Analyzing operations telemetry…</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Input Area - Docked ONLY when active conversation exists */}
            {messages.length > 0 && (
              <div
                className="pulse-ai-docked-input"
                style={{
                  padding: '8px 20px 14px',
                  borderTop: 'none',
                  background: 'transparent',
                  flexShrink: 0
                }}
              >
              <div style={{
                maxWidth: 820,
                margin: '0 auto',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 14px 8px',
                boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                {/* Top row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 6,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SitepulseLogo size="xs" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>pulse AI</span>
                  </div>

                  {/* Segmented [Agent | Ask] switcher */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'var(--muted)',
                    borderRadius: 6,
                    padding: 2,
                    border: '1px solid var(--border)'
                  }}>
                    <button
                      type="button"
                      onClick={() => setAiMode('agent')}
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: 'none',
                        cursor: 'pointer',
                        background: aiMode === 'agent' ? 'var(--card)' : 'transparent',
                        color: aiMode === 'agent' ? 'var(--foreground)' : 'var(--muted-foreground)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Agent
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiMode('query')}
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: 'none',
                        cursor: 'pointer',
                        background: aiMode === 'query' ? 'var(--card)' : 'transparent',
                        color: aiMode === 'query' ? 'var(--foreground)' : 'var(--muted-foreground)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Ask
                    </button>
                  </div>
                </div>

                {/* Middle Textarea */}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask pulse AI about sites, incidents, alerts, comparisons, or SOQL queries…"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--foreground)',
                    fontSize: 13.5,
                    resize: 'none',
                    outline: 'none',
                    maxHeight: 160,
                    lineHeight: 1.5,
                    padding: '4px 2px'
                  }}
                />

                {/* Bottom row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 2
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'var(--muted)',
                      border: '1px solid var(--border)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5
                    }}>
                      <Zap style={{ width: 10, height: 10, color: 'var(--primary)' }} />
                      pulse x_7
                    </span>
                    <span style={{ fontSize: 10.5, opacity: 0.7 }}>
                      Shift + Enter for newline
                    </span>
                  </div>

                  <Button
                    onClick={() => handleSendMessage()}
                    disabled={!inputMessage.trim() || isLoading}
                    size="sm"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      padding: 0,
                      background: inputMessage.trim() ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                      border: inputMessage.trim() ? '1px solid var(--primary)' : '1px solid var(--border)',
                      color: inputMessage.trim() ? '#fff' : 'var(--muted-foreground)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: inputMessage.trim() ? 'pointer' : 'default',
                      transition: 'all 0.18s ease'
                    }}
                    aria-label="Send query"
                  >
                    <ArrowUp style={{ width: 15, height: 15, strokeWidth: 2.2 }} />
                  </Button>
                </div>
              </div>

              <div style={{
                textAlign: 'center',
                fontSize: 10.5,
                color: 'var(--muted-foreground)',
                marginTop: 6
              }}>
                Ephemeral Memory: Chat context is kept in active memory only and cleared on page refresh.
              </div>
            </div>
            )}
          </div>
        )}
        {/* FULLSCREEN ARTIFACT MODAL (CEO / Upper Management Full View) */}
        {fullscreenArtifact && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 24px',
              background: 'var(--card)',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                }}>
                  <LayoutDashboard style={{ width: 16, height: 16 }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {fullscreenArtifact.title}
                    <span style={{
                      background: 'rgba(249, 115, 22, 0.15)',
                      color: '#f97316',
                      border: '1px solid rgba(249, 115, 22, 0.3)',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.5
                    }}>
                      EXECUTIVE FULLSCREEN ARTIFACT
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                    Executive Operations & SRE Telemetry View
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = new Blob([fullscreenArtifact.html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <ExternalLink style={{ width: 14, height: 14 }} />
                  Open in New Tab
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFullscreenArtifact(null)}
                  style={{ color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <X style={{ width: 18, height: 18 }} />
                  Close
                </Button>
              </div>
            </div>

            {/* Modal Iframe */}
            <iframe
              srcDoc={fullscreenArtifact.html}
              style={{
                flex: 1,
                width: '100%',
                border: 'none',
                background: '#0e1117',
              }}
              sandbox="allow-scripts allow-same-origin allow-modals"
              title={fullscreenArtifact.title}
            />
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

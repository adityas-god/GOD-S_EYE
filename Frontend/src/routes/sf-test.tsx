import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  sfAuth,
  sfDescribeCase,
  sfGetAllLiveOrgSiteNames,
  sfDebugQuery,
  sfFetchLiveCasesOverview,
  type SFCase,
} from '@/integrations/salesforce/client';

type Stage = 'idle' | 'auth' | 'describe' | 'sites' | 'done' | 'error';
interface Log { time: string; level: 'info' | 'ok' | 'warn' | 'error'; msg: string }

function SFTestPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const loaderData = Route.useLoaderData();
  const [fields, setFields] = useState<{ name: string; label: string; type: string }[]>(loaderData?.fields ?? []);
  const [siteData, setSiteData] = useState(loaderData?.siteData ?? null);

  function log(level: Log['level'], msg: string) {
    setLogs(l => [...l, { time: new Date().toLocaleTimeString(), level, msg }]);
  }

  useEffect(() => { void run(); }, []);

  async function run() {
    // Step 1: Auth
    setStage('auth');
    log('info', 'Step 1 — Authenticating with Salesforce (server-side)…');
    try {
      const result = await sfAuth();
      log('ok', `✓ Auth success. Instance: ${result.instance_url}`);
    } catch (e) {
      log('error', `✗ Auth failed: ${(e as Error).message}`);
      setStage('error'); return;
    }

    // Step 2: Describe Case fields
    setStage('describe');
    log('info', 'Step 2 — Inspecting Case object fields…');
    try {
      const siteFields = await sfDescribeCase();
      setFields(siteFields);
      log('ok', `✓ Site-related fields: ${siteFields.map(f => f.name).join(', ') || 'none matched'}`);
    } catch (e) {
      log('warn', `Describe skipped: ${(e as Error).message}`);
    }

    // Step 3: Fetch all live sites configured in GreyOrange Salesforce org
    setStage('sites');
    log('info', 'Step 3 — Querying ALL live sites configured in GreyOrange Salesforce org…');
    try {
      const result = await sfGetAllLiveOrgSiteNames();
      setSiteData(result);
      log(
        'ok',
        `✓ Retrieved ${result.totalLiveSites} TOTAL LIVE SITES in Salesforce org (${result.sourcesBreakdown.fromAccounts} from Accounts, ${result.sourcesBreakdown.fromCases} from Cases).`
      );
    } catch (e) {
      log('error', `✗ Failed to retrieve sites from Salesforce: ${(e as Error).message}`);
    }

    // Step 4: Debug Case Query & Overview Stats
    log('info', 'Step 4 — Testing Case query & Overview Stats…');
    try {
      const qResult = await sfDebugQuery({
        data: "SELECT Id, CaseNumber, Status, Subject, Snow_Sitename__c, Account_Name__c, Customer_Location__c, Type, Product_Type__c, Alert_Priority__c FROM Case WHERE Status != 'Closed' ORDER BY LastModifiedDate DESC LIMIT 15",
      });
      log('ok', `Case query success: ${qResult.success}, count: ${qResult.count}, sample: ${JSON.stringify(qResult.sample)}`);

      const overviewResult = await sfFetchLiveCasesOverview();
      const nonZero = Object.entries(overviewResult.siteStats).filter(([_, s]) => s.count > 0);
      log('ok', `Overview totalLiveCases: ${overviewResult.totalLiveCases}, sites with >0 cases: ${nonZero.length} (${nonZero.map(([k, s]) => `${k}:${s.count}`).join(', ')})`);
      setStage('done');
    } catch (e) {
      log('error', `✗ Step 4 error: ${(e as Error).message}`);
      setStage('error');
    }
  }

  const statusColor: Record<Stage, string> = {
    idle: '#6b7280', auth: '#f59e0b', describe: '#f59e0b',
    sites: '#f59e0b', done: '#22c55e', error: '#ef4444',
  };

  return (
    <div style={{ fontFamily: 'monospace', padding: 32, maxWidth: 1100, margin: '0 auto', color: '#e5e7eb' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
        Salesforce Org — Live Configured Sites Discovery
      </h1>
      <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
        All requests run <strong style={{ color: '#a3e635' }}>server-side</strong> directly against the GreyOrange Salesforce org database.
      </p>

      <div style={{ background: '#090d16', border: '1px solid #38bdf8', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h3 style={{ color: '#38bdf8', margin: '0 0 6px 0', fontSize: 13 }}>DIAGNOSTICS LOADER RESULT:</h3>
        <pre style={{ margin: 0, fontSize: 11, color: '#4ade80', whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(loaderData?.diag, null, 2)}
        </pre>
      </div>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 24 }}>
        Instance: {import.meta.env['VITE_SF_INSTANCE_URL'] || 'https://greyorangeorg.my.salesforce.com'}
      </p>

      {/* Status badge */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '4px 14px', borderRadius: 20, background: '#1f2937', border: `1px solid ${statusColor[stage]}` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[stage], display: 'inline-block',
          boxShadow: stage !== 'done' && stage !== 'error' && stage !== 'idle' ? `0 0 6px ${statusColor[stage]}` : 'none' }} />
        <span style={{ fontSize: 11, color: statusColor[stage], textTransform: 'uppercase', letterSpacing: 1 }}>{stage}</span>
      </div>

      {/* Log output */}
      <pre style={{ background: '#0d1117', borderRadius: 8, padding: 16, marginBottom: 28, maxHeight: 400, overflowY: 'auto', border: '1px solid #374151', color: '#4ade80', fontSize: 12 }}>
        {logs.map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.msg}`).join('\n')}
      </pre>

      {/* Discovered Case Fields */}
      <pre style={{ background: '#0d1117', padding: 12, borderRadius: 6, fontSize: 10, color: '#f59e0b' }}>
        {JSON.stringify(fields, null, 2)}
      </pre>

      {siteData && (
        <div style={{ background: '#0d1117', borderRadius: 8, padding: 16, marginBottom: 28, border: '1px solid #374151' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 12 }}>
            TOTAL LIVE SITES CONFIGURED IN SALESFORCE: {siteData.totalLiveSites}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 12, color: '#9ca3af' }}>
            <div>
              <strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>{siteData.sourcesBreakdown.fromAccounts}</strong>
              From Accounts
            </div>
            <div>
              <strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>{siteData.sourcesBreakdown.fromCases}</strong>
              From Case Records
            </div>
            <div>
              <strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>{siteData.totalLiveSites}</strong>
              Unique Deduped Sites
            </div>
          </div>
        </div>
      )}

      {/* All Site Names Table */}
      {siteData && siteData.siteNames.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#e5e7eb' }}>
            All {siteData.totalLiveSites} Salesforce Site Names
          </h2>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #30363d', marginBottom: 24 }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', background: '#0d1117' }}>
              <thead>
                <tr style={{ background: '#161b22' }}>
                  <th style={{ padding: '10px 14px', width: 60, textAlign: 'left', color: '#9ca3af', borderBottom: '1px solid #30363d' }}>#</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: '#9ca3af', borderBottom: '1px solid #30363d' }}>Site Name</th>
                  <th style={{ padding: '10px 14px', width: 220, textAlign: 'left', color: '#9ca3af', borderBottom: '1px solid #30363d' }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {siteData.siteDetails.map((s, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #21262d', background: idx % 2 === 0 ? '#0d1117' : '#161b22' }}>
                    <td style={{ padding: '7px 14px', color: '#6b7280', fontFamily: 'monospace' }}>{idx + 1}</td>
                    <td style={{ padding: '7px 14px', color: '#f3f4f6', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '7px 14px', color: '#38bdf8', fontSize: 11 }}>{s.sources.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details open style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#a3e635', fontWeight: 600, marginBottom: 8 }}>
              Account Sites Configured in Salesforce ({siteData.accountSites.length})
            </summary>
            <pre style={{ background: '#0d1117', padding: 16, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 300, color: '#86efac', border: '1px solid #21262d' }}>
              {JSON.stringify(siteData.accountSites, null, 2)}
            </pre>
          </details>

          <details style={{ marginTop: 20 }} open>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#38bdf8', fontWeight: 600, marginBottom: 8 }}>
              Overview & Live Cases Diagnostics
            </summary>
            <pre style={{ background: '#0d1117', padding: 16, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 400, color: '#a7f3d0', border: '1px solid #21262d' }}>
              {JSON.stringify(loaderData?.diag, null, 2)}
            </pre>
          </details>

          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#38bdf8', fontWeight: 600, marginBottom: 8 }}>
              Case Sites Configured in Salesforce ({siteData.caseSiteNames.length})
            </summary>
            <pre style={{ background: '#0d1117', padding: 16, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 300, color: '#93c5fd', border: '1px solid #21262d' }}>
              {JSON.stringify(siteData.caseSiteNames, null, 2)}
            </pre>
          </details>

          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280', marginBottom: 8 }}>All Deduped Site Names ({siteData.siteNames.length})</summary>
            <pre style={{ background: '#0d1117', padding: 16, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 300, color: '#94a3b8', border: '1px solid #21262d' }}>
              {JSON.stringify(siteData.siteNames, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute('/sf-test')({
  loader: async () => {
    try {
      const [siteData, fields, overview, debugCases] = await Promise.all([
        sfGetAllLiveOrgSiteNames(),
        sfDescribeCase(),
        sfFetchLiveCasesOverview().catch(e => ({ error: (e as Error).message })),
        sfDebugQuery({
          data: "SELECT Id, CaseNumber, Status, Subject, Snow_Sitename__c, Account_Name__c, Customer_Location__c, Type, Product_Type__c, Alert_Priority__c FROM Case WHERE Status != 'Closed' ORDER BY LastModifiedDate DESC LIMIT 10",
        }).catch(e => ({ error: (e as Error).message })),
      ]);
      return {
        siteData,
        fields,
        diag: {
          overview,
          debugCases,
        },
      };
    } catch (e) {
      console.error('Loader error:', e);
      return null;
    }
  },
  component: SFTestPage,
});


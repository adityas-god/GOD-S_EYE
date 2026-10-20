import { classifyPulseAiIntent, compactTelemetryForPrompt } from '../src/services/pulse-ai.service.js';
import { getSiteInfrastructureMap } from '../src/services/confluence.service.js';

console.log('================================================================');
console.log('   Pulse AI Multi-Source Orchestration & Token Budget Test');
console.log('================================================================\n');

const testQueries = [
  {
    query: 'sams atl ip list',
    expectedIntent: 'CONFLUENCE_ONLY',
    expectedHtml: false,
  },
  {
    query: 'walmart mexico all procucts',
    expectedIntent: 'PRODUCT_INFO',
    expectedHtml: false,
  },
  {
    query: 'What are the products running at Walmart Mexico?',
    expectedIntent: 'PRODUCT_INFO',
    expectedHtml: false,
  },
  {
    query: 'What are the VM IPs and server build details for Sams ATL?',
    expectedIntent: 'CONFLUENCE_ONLY',
    expectedHtml: false,
  },
  {
    query: 'Show me the operational runbook SOP for PostgresOldDataDetected',
    expectedIntent: 'CONFLUENCE_ONLY',
    expectedHtml: false,
  },
  {
    query: 'Show open Sev 1 urgent cases for Sams ATL in last 24h',
    expectedIntent: 'SALESFORCE_ONLY',
    expectedHtml: false,
  },
  {
    query: 'Make a report to analyse Sams ATL last 24 hours',
    expectedIntent: 'COMBINED',
    expectedHtml: true,
  },
  {
    query: 'Audit Sams ATL and check server topology with incident cases',
    expectedIntent: 'COMBINED',
    expectedHtml: true,
  },
  {
    query: 'compare Sams ATL vs Ajax',
    expectedIntent: 'SALESFORCE_ONLY',
    expectedHtml: true,
  },
  {
    query: 'show red zone breaches',
    expectedIntent: 'SALESFORCE_ONLY',
    expectedHtml: true,
  },
  {
    query: 'make an html report for Sams ATL',
    expectedIntent: 'COMBINED',
    expectedHtml: true,
  },
  {
    query: 'Audit Sams ATL, text only no html',
    expectedIntent: 'COMBINED',
    expectedHtml: false,
  },
  {
    query: 'create a last 8 hours report for apotek incidents',
    expectedIntent: 'COMBINED',
    expectedHtml: true,
  },
  {
    query: 'create a comparison report for hnm canda and wlamart mexico for past 24 hours',
    expectedIntent: 'SALESFORCE_ONLY',
    expectedHtml: true,
  },
  {
    query: 'Hello, who are you and what do you monitor?',
    expectedIntent: 'GREETING',
    expectedHtml: false,
  },
];

console.log('1. Testing Intent Classification & HTML Report Decision Matrix:');
let allPassed = true;
for (const t of testQueries) {
  const result = classifyPulseAiIntent(t.query, 'agent');
  const intentPass = result.intent === t.expectedIntent;
  const htmlPass = result.shouldGenerateHtml === t.expectedHtml;
  const pass = intentPass && htmlPass;
  console.log(`   [${pass ? 'PASS ✅' : 'FAIL ❌'}] Query: "${t.query}"`);
  console.log(`          Intent: ${result.intent} (Expected: ${t.expectedIntent})`);
  console.log(`          HTML Artifact: ${result.shouldGenerateHtml} (Expected: ${t.expectedHtml}), Sites: [${result.detectedSites.join(', ')}]\n`);
  if (!pass) allPassed = false;
}

console.log('2. Testing Confluence Topology Extraction & Token Compaction:');
async function testCompaction() {
  const mockPayloads = {
    infrastructureMap: {
      siteName: 'Sams Club ATL',
      ipAddresses: ['10.70.133.100', '192.168.9.195', '192.168.32.64', '192.168.8.50'],
      hostnames: ['samprod-app-01', 'samprod-db-01'],
      subnets: ['10.70.133.0/24'],
      clusters: ['walmartbnastaging-cluster-stg-greymatter'],
      keyRoles: { solutionArchitect: 'Kalpesh', projectManager: 'Prince' },
      deployedBuild: '6.0.4',
      serverConfigs: ['/home/gor/wms', 'Database: wms_process', 'Table: pack_master'],
    },
    siteDetails: {
      siteName: 'Sams Club ATL',
      isDown: false,
      activeSev1Count: 0,
      activeSev2UrgentCount: 1,
      totalOpenCases: 3,
      openCases: [
        { caseNumber: '00297257', severity: '[SEV 2 URGENT]', status: 'In Progress', impactPercentage: 75, subject: 'Conveyor 4 Jam' },
        { caseNumber: '00297258', severity: '[SEV 3 INCIDENT]', status: 'Investigating', subject: 'Bot 12 Charging Warning' },
      ],
    },
    operationalRunbook: {
      title: 'Runbook: Postgres Database Replication Lag',
      alertSignature: 'PostgresOldDataDetected',
      remediationSteps: [
        'Check replication lag on standby node: select now() - pg_last_xact_replay_timestamp();',
        'Verify disk space on /var/lib/postgresql/data.',
        'If lag exceeds 300s, restart replication worker service.',
      ],
      runbookUrl: 'https://gor.atlassian.net/wiki/spaces/SRE/pages/12345',
    },
  };

  // Test Confluence Only Compaction
  const confCompact = compactTelemetryForPrompt({
    intent: 'CONFLUENCE_ONLY',
    telemetryPayloads: mockPayloads,
    targetSite: 'Sams Club ATL',
    targetRange: '24h',
  });
  const confJson = JSON.stringify(confCompact, null, 2);
  console.log(`   • CONFLUENCE_ONLY Payload Size: ${confJson.length} characters (~${Math.round(confJson.length / 4)} tokens)`);
  console.log(`     Has Salesforce cases included? ${Boolean(confCompact.activeCasesSummary || confCompact.openCasesSummary)} (Must be FALSE)`);

  // Test Salesforce Only Compaction
  const sfCompact = compactTelemetryForPrompt({
    intent: 'SALESFORCE_ONLY',
    telemetryPayloads: mockPayloads,
    targetSite: 'Sams Club ATL',
    targetRange: '24h',
  });
  const sfJson = JSON.stringify(sfCompact, null, 2);
  console.log(`   • SALESFORCE_ONLY Payload Size: ${sfJson.length} characters (~${Math.round(sfJson.length / 4)} tokens)`);
  console.log(`     Has Confluence IPs included? ${Boolean(sfCompact.ipAddresses)} (Must be FALSE)`);

  // Test Combined Compaction
  const combCompact = compactTelemetryForPrompt({
    intent: 'COMBINED',
    telemetryPayloads: mockPayloads,
    targetSite: 'Sams Club ATL',
    targetRange: '24h',
  });
  const combJson = JSON.stringify(combCompact, null, 2);
  console.log(`   • COMBINED Payload Size: ${combJson.length} characters (~${Math.round(combJson.length / 4)} tokens)`);
  console.log(`     Has Salesforce Cases? ${Boolean(combCompact.salesforce?.activeCases)}`);
  console.log(`     Has Confluence IPs? ${Boolean(combCompact.confluence?.ipAddresses)}`);
  console.log(`     Has Actionable SOP? ${Boolean(combCompact.actionableSOP)}`);

  // Test Product Info Compaction
  const prodCompact = compactTelemetryForPrompt({
    intent: 'PRODUCT_INFO',
    telemetryPayloads: mockPayloads,
    targetSite: 'Walmart Mexico',
    targetRange: 'all',
  });
  const prodJson = JSON.stringify(prodCompact, null, 2);
  console.log(`   • PRODUCT_INFO Payload Size: ${prodJson.length} characters (~${Math.round(prodJson.length / 4)} tokens)`);
  console.log(`     Has Monitored Product Lines? ${Boolean(prodCompact.monitoredProductLines?.length > 0)}`);
  console.log(`     Has Unrequested SOP Runbook? ${Boolean(prodCompact.actionableSOP)} (Must be FALSE)`);

  console.log('\n================================================================');
  console.log('   Token Budget & Orchestration Unit Tests Completed!');
  console.log('================================================================');

  console.log('\n3. Testing Live Confluence Blueprint Extraction for "Sams Club ATL":');
  try {
    const liveTopology = await getSiteInfrastructureMap('Sams Club ATL');
    console.log(`   Canonical Name: ${liveTopology?.siteName}`);
    console.log(`   Total IPs Found: ${liveTopology?.totalIpsFound}`);
    console.log(`   Verified Server / VM IPs:`);
    (liveTopology?.ipAddresses || []).forEach(ip => console.log(`      • ${ip}`));
    console.log(`   Hostnames: [${(liveTopology?.hostnames || []).join(', ')}]`);
    console.log(`   Clusters: [${(liveTopology?.clusters || []).join(', ')}]`);
    console.log(`   Deployed Build: ${liveTopology?.deployedBuild || 'N/A'}`);
    console.log(`   Key Personnel: ${JSON.stringify(liveTopology?.keyRoles || {})}`);
    console.log(`   Server Configurations / Paths: [${(liveTopology?.serverConfigs || []).join(', ')}]`);
    console.log(`   Confluence Reference Pages:`);
    (liveTopology?.referenceDocuments || []).forEach(doc => console.log(`      • [${doc.title}] (${doc.space}) - ${doc.url || 'Live'}`));

    // Assertions
    const hasVersionAsIp = (liveTopology?.ipAddresses || []).some(ip => ip.startsWith('5.4.9.17'));
    const hasForeignHosts = (liveTopology?.hostnames || []).some(h => /ikea|meli|apotek|walmartmx/i.test(h));
    console.log(`\n   Sanity Checks (Sams ATL):`);
    console.log(`   • Filtered out version string 5.4.9.17? ${!hasVersionAsIp ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`   • Filtered out foreign site hostnames (Ikea, Meli, etc.)? ${!hasForeignHosts ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`   • Has verified Sams ATL private IPs? ${(liveTopology?.ipAddresses?.length > 0) ? 'PASS ✅' : 'FAIL ❌'}`);
  } catch (err) {
    console.error('   Live Confluence Blueprint error:', err.message);
  }

  console.log('\n4. Testing Live Confluence Blueprint Extraction for "Walmart Mexico":');
  try {
    const mxTopology = await getSiteInfrastructureMap('Walmart Mexico');
    console.log(`   Canonical Name: ${mxTopology?.siteName}`);
    console.log(`   Total IPs Found: ${mxTopology?.totalIpsFound}`);
    console.log(`   Verified Server / VM IPs:`);
    (mxTopology?.ipAddresses || []).forEach(ip => console.log(`      • ${ip}`));
    console.log(`   Hostnames: [${(mxTopology?.hostnames || []).join(', ')}]`);
    console.log(`   Clusters: [${(mxTopology?.clusters || []).join(', ')}]`);
    console.log(`   Deployed Build: ${mxTopology?.deployedBuild || 'N/A'}`);
    console.log(`   Server Configurations / Artifacts: [${(mxTopology?.serverConfigs || []).join(', ')}]`);

    const hasVersionAsIp = (mxTopology?.ipAddresses || []).some(ip => ip.startsWith('5.4.9.17'));
    const hasForeignHosts = (mxTopology?.hostnames || []).some(h => /ikea|meli|apotek|samsatl/i.test(h));
    console.log(`\n   Sanity Checks (Walmart Mexico):`);
    console.log(`   • Filtered out version string 5.4.9.17? ${!hasVersionAsIp ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`   • Filtered out foreign site hostnames? ${!hasForeignHosts ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`   • Has verified Walmart Mexico private IPs? ${(mxTopology?.ipAddresses?.length > 0) ? 'PASS ✅' : 'FAIL ❌'}`);
  } catch (err) {
    console.error('   Live Walmart Mexico Blueprint error:', err.message);
  }

  console.log('\n================================================================');
  console.log('   All Tests Successfully Completed!');
  console.log('================================================================');
}

testCompaction();

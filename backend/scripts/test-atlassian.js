/**
 * GreyOrange Atlassian (Jira / Confluence) API Tester & VM IP Resolver.
 * Supports:
 * - Scoped Cloud ID API Gateway: https://api.atlassian.com/ex/jira/917cbbff-c0f2-4cf8-ae9d-279bd24a0a5a
 * - Classic Site URLs: https://<site>.atlassian.net
 * - Both Basic Auth (email:token) and Bearer Auth
 * - Searches both Jira and Confluence for Sams ATL VM IP maps.
 */

const CLOUD_ID = '917cbbff-c0f2-4cf8-ae9d-279bd24a0a5a';
const API_TOKEN = process.argv[4] || process.env.ATLASSIAN_API_KEY || '';

const inputEmail = process.argv[2] || process.env.ATLASSIAN_EMAIL || 'aditya.s.ctr@greyorange.com';
const emailCandidates = [
  inputEmail,
  'aditya.s.ctr@greyorange.com',
  'aditya@greyorange.com',
  'aditya.s@greyorange.com',
].filter((e, idx, arr) => e && arr.indexOf(e) === idx);

const customDomain = process.argv[3] && !process.argv[3].startsWith('ATATT') ? process.argv[3] : '';

async function run() {
  console.log('================================================================');
  console.log('   GreyOrange Atlassian Cloud API Test & VM IP Extractor       ');
  console.log('================================================================');
  console.log(`• Cloud ID: ${CLOUD_ID}`);
  console.log(`• Token: ${API_TOKEN.slice(0, 12)}...${API_TOKEN.slice(-8)}`);

  // Target endpoints to probe
  const jiraGateways = [
    `https://api.atlassian.com/ex/jira/${CLOUD_ID}`,
    customDomain,
    'https://gor.atlassian.net',
    'https://greyorange.atlassian.net',
    'https://grey-orange.atlassian.net',
  ].filter(Boolean);

  const confGateways = [
    `https://api.atlassian.com/ex/confluence/${CLOUD_ID}`,
    customDomain ? `${customDomain}/wiki` : '',
    'https://gor.atlassian.net/wiki',
    'https://greyorange.atlassian.net/wiki',
    'https://grey-orange.atlassian.net/wiki',
  ].filter(Boolean);

  let activeJiraBase = '';
  let activeConfBase = '';
  let activeAuthHeader = '';
  let activeEmail = '';

  console.log('\n[1/3] Probing Authentication against Jira Gateway & Endpoints...');

  for (const jBase of jiraGateways) {
    for (const em of emailCandidates) {
      const basicAuth = `Basic ${Buffer.from(`${em}:${API_TOKEN}`).toString('base64')}`;
      const authVariants = [
        { type: 'Basic', header: basicAuth, email: em },
        { type: 'Bearer', header: `Bearer ${API_TOKEN}`, email: 'token' },
      ];

      for (const auth of authVariants) {
        try {
          const res = await fetch(`${jBase}/rest/api/3/myself`, {
            headers: {
              'Authorization': auth.header,
              'Accept': 'application/json',
            },
          });

          if (res.status === 200) {
            const user = await res.json();
            console.log(`\n🎉 ✅ AUTHENTICATION SUCCESSFUL!`);
            console.log(`   Endpoint: ${jBase}`);
            console.log(`   Auth Type: ${auth.type} (${auth.email})`);
            console.log(`   User: ${user.displayName || user.emailAddress || 'User'} (${user.accountId || ''})`);
            activeJiraBase = jBase;
            activeAuthHeader = auth.header;
            activeEmail = auth.email;
            break;
          } else if (res.status !== 404) {
            const err = await res.text().catch(() => '');
            console.log(`   [${jBase}] with ${auth.email} (${auth.type}) -> HTTP ${res.status}: ${err.slice(0, 80)}`);
          }
        } catch {}
      }

      if (activeJiraBase) break;
    }
    if (activeJiraBase) break;
  }

  // Also test Confluence endpoint directly if Jira did not respond
  if (!activeAuthHeader) {
    console.log('\nProbing Confluence endpoint directly...');
    for (const cBase of confGateways) {
      for (const em of emailCandidates) {
        const basicAuth = `Basic ${Buffer.from(`${em}:${API_TOKEN}`).toString('base64')}`;
        for (const auth of [{ type: 'Basic', header: basicAuth, email: em }, { type: 'Bearer', header: `Bearer ${API_TOKEN}`, email: 'token' }]) {
          try {
            const res = await fetch(`${cBase}/rest/api/user/current`, {
              headers: {
                'Authorization': auth.header,
                'Accept': 'application/json',
              },
            });
            if (res.status === 200) {
              const u = await res.json();
              console.log(`\n🎉 ✅ CONFLUENCE AUTHENTICATION SUCCESSFUL!`);
              console.log(`   Endpoint: ${cBase}`);
              console.log(`   User: ${u.displayName || 'User'}`);
              activeConfBase = cBase;
              activeAuthHeader = auth.header;
              activeEmail = auth.email;
              break;
            }
          } catch {}
        }
        if (activeConfBase) break;
      }
      if (activeConfBase) break;
    }
  }

  if (!activeAuthHeader) {
    console.log('\n❌ Authentication was not accepted on tested gateways.');
    console.log('Please verify:');
    console.log('1. Was the token created at https://id.atlassian.com/manage-profile/security/api-tokens?');
    console.log('2. Does GreyOrange require a specific Jira site URL? (e.g. check your browser address bar when opening Jira).');
    console.log('3. If you have your exact Jira URL from your browser, pass it:');
    console.log('   node backend/scripts/test-atlassian.js aditya.s.ctr@greyorange.com <exact_url>');
    return;
  }

  if (!activeConfBase) {
    activeConfBase = `https://api.atlassian.com/ex/confluence/${CLOUD_ID}`;
  }

  // 2. Search Confluence for Sams ATL VM / IP Documentation
  console.log('\n[2/3] Searching Confluence Knowledge Base for "Sams ATL" VM & IP details...');
  const cqlQueries = [
    'title ~ "Sams" AND (title ~ "ATL" OR title ~ "Atlanta")',
    'text ~ "Sams" AND (text ~ "ATL" OR text ~ "Atlanta") AND (text ~ "IP" OR text ~ "VM" OR text ~ "subnet")',
    'text ~ "4993" AND (text ~ "IP" OR text ~ "VM")',
  ];

  let foundDocs = [];
  for (const cql of cqlQueries) {
    try {
      const url = `${activeConfBase}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=10&expand=body.storage,version`;
      const res = await fetch(url, {
        headers: {
          'Authorization': activeAuthHeader,
          'Accept': 'application/json',
        },
      });

      if (res.status === 200) {
        const data = await res.json();
        const results = data.results || [];
        if (results.length > 0) {
          foundDocs.push(...results);
          break;
        }
      }
    } catch {}
  }

  if (foundDocs.length > 0) {
    console.log(`✅ Found ${foundDocs.length} matching Confluence document(s):`);
    for (const doc of foundDocs) {
      console.log(`\n📄 [${doc.type?.toUpperCase()}] ${doc.title}`);
      console.log(`   URL: ${doc._links?.base || activeConfBase}${doc._links?.webui || ''}`);
      const body = doc.body?.storage?.value || '';

      // Extract IPv4 addresses
      const ips = body.match(/\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g);
      if (ips && ips.length > 0) {
        const cleanIps = Array.from(new Set(ips)).filter(ip => !ip.startsWith('127.') && !ip.startsWith('0.') && !ip.startsWith('255.'));
        console.log(`   🎯 Detected IP Addresses:`);
        cleanIps.slice(0, 15).forEach(ip => console.log(`      • ${ip}`));
      }

      if (doc.title.includes('Server info') || doc.title.includes('Resource Details')) {
        const preview = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
        console.log(`   📖 Inside Content Preview: "${preview}..."`);
      }
    }
  } else {
    console.log('ℹ️ No direct Confluence pages matched the specific search. Trying broader query...');
  }

  // 3. Search Jira Issues for Sams ATL VM / Infrastructure
  console.log('\n[3/3] Searching Jira Issues for "Sams ATL" VM / Network tickets...');
  const jql = 'text ~ "Sams ATL" AND (text ~ "IP" OR text ~ "VM" OR text ~ "network") ORDER BY updated DESC';
  try {
    const url = `${activeJiraBase}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=10&fields=key,summary,status,assignee`;
    const res = await fetch(url, {
      headers: {
        'Authorization': activeAuthHeader,
        'Accept': 'application/json',
      },
    });

    if (res.status === 200) {
      const data = await res.json();
      const issues = data.issues || [];
      console.log(`✅ Found ${issues.length} matching Jira issue(s):`);
      for (const i of issues) {
        console.log(`\n🎫 [${i.key}] ${i.fields?.summary} (Status: ${i.fields?.status?.name || 'Open'})`);
      }
    } else {
      console.log(`ℹ️ Jira search response HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('Jira search error:', err.message);
  }

  // 4. Demonstrating Inside-Content Extraction for AI Synthesis
  console.log('\n[4/4] Pulse AI Context Feed: Full Inside Content Extracted from Confluence:');
  const targetPages = foundDocs.filter(d => 
    d.title.includes('Resource Details') || d.title.includes('Build and Server info') || d.title.includes('Transformation Details')
  );

  for (const doc of targetPages) {
    const rawBody = doc.body?.storage?.value || '';
    const cleanText = rawBody
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<\/th>\s*<th[^>]*>/gi, ' | ')
      .replace(/<\/td>\s*<td[^>]*>/gi, ' | ')
      .replace(/<\/tr>\s*<tr[^>]*>/gi, '\n')
      .replace(/<tr[^>]*>/gi, '| ')
      .replace(/<\/tr>/gi, ' |')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ')
      .replace(/(\r?\n\s*){3,}/g, '\n\n')
      .trim();

    console.log(`\n================================================================`);
    console.log(`📄 Page: "${doc.title}"`);
    console.log(`🔗 URL: ${doc._links?.base || activeConfBase}${doc._links?.webui || ''}`);
    console.log(`----------------------------------------------------------------`);
    console.log(cleanText.slice(0, 1000));
    console.log(`================================================================`);
  }

  console.log('\n================================================================\n');
}

run();

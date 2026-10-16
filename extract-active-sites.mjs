import fs from 'fs';
import path from 'path';

const INSTANCE_URL = process.env.SF_INSTANCE_URL || 'https://greyorangeorg.my.salesforce.com';
const CLIENT_ID = process.env.SF_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SF_CLIENT_SECRET || '';
const API_VERSION = 'v59.0';

async function getSalesforceToken() {
  console.log(`[1/3] Authenticating with GreyOrange Salesforce (${INSTANCE_URL})...`);
  const tokenUrl = `${INSTANCE_URL}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Authentication failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  console.log(`[✔] Authentication successful!`);
  return data.access_token;
}

async function executeSOQL(token, soql) {
  let records = [];
  let nextUrl = `${INSTANCE_URL}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`SOQL Query Failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    records = records.concat(data.records || []);
    if (data.nextRecordsUrl) {
      nextUrl = `${INSTANCE_URL}${data.nextRecordsUrl}`;
    } else {
      nextUrl = null;
    }
  }

  return records;
}

async function main() {
  console.log('='.repeat(80));
  console.log(' GreyOrange Salesforce - Operational Sites Actively Receiving Tickets');
  console.log('='.repeat(80));

  try {
    const token = await getSalesforceToken();

    console.log(`[2/3] Querying all operational cases across GreyOrange org...`);

    // Query 1: Open cases currently being worked on
    const openCasesSoql = `SELECT Id, CaseNumber, Status, AccountId, Account_Name__c, Account.Name, Snow_Sitename__c, Customer_Location__c, CreatedDate FROM Case WHERE Status != 'Closed' ORDER BY CreatedDate DESC`;
    const openCases = await executeSOQL(token, openCasesSoql);
    console.log(`[✔] Retrieved ${openCases.length} currently OPEN tickets.`);

    // Query 2: Cases created recently (to capture sites that receive tickets even if all current ones are closed today/yesterday)
    const recentCasesSoql = `SELECT Id, CaseNumber, Status, AccountId, Account_Name__c, Account.Name, Snow_Sitename__c, Customer_Location__c, CreatedDate FROM Case WHERE CreatedDate = LAST_N_DAYS:90 ORDER BY CreatedDate DESC LIMIT 2000`;
    const recentCases = await executeSOQL(token, recentCasesSoql);
    console.log(`[✔] Retrieved ${recentCases.length} recent tickets from the last 90 days.`);

    console.log(`[3/3] Aggregating ticket history by exact site and account...`);

    // Combine all cases
    const allCases = [...openCases, ...recentCases];
    const siteMap = new Map();

    const ignoredNames = new Set(['greyorange', 'greyorange queue', 'null', 'undefined', '']);

    for (const c of allCases) {
      const accId = c.AccountId || null;
      let rawName = (c.Account_Name__c || c.Account?.Name || c.Snow_Sitename__c || c.Customer_Location__c || '').trim();

      if (!rawName || ignoredNames.has(rawName.toLowerCase())) {
        if (accId) {
          rawName = `Account_${accId}`;
        } else {
          continue;
        }
      }

      // Group by canonical identifier (prefer AccountId if present, else site name)
      const groupKey = accId ? String(accId) : rawName.toLowerCase();

      if (!siteMap.has(groupKey)) {
        siteMap.set(groupKey, {
          name: rawName,
          accountId: accId || 'N/A',
          openTicketCount: 0,
          recentTicketCount: 0,
          sampleCaseNumber: c.CaseNumber,
          lastTicketDate: c.CreatedDate,
        });
      }

      const item = siteMap.get(groupKey);

      // Keep most descriptive name
      if (rawName.length > item.name.length && !rawName.startsWith('Account_')) {
        item.name = rawName;
      }
      if (accId && item.accountId === 'N/A') {
        item.accountId = accId;
      }

      const isClosed = String(c.Status || '').toLowerCase().includes('closed');
      if (!isClosed) {
        item.openTicketCount++;
      }
      item.recentTicketCount++;

      if (c.CreatedDate && (!item.lastTicketDate || new Date(c.CreatedDate) > new Date(item.lastTicketDate))) {
        item.lastTicketDate = c.CreatedDate;
      }
    }

    const activeOperationalSites = Array.from(siteMap.values());

    // Sort: sites with OPEN tickets first, then by recent ticket activity, then alphabetically
    activeOperationalSites.sort((a, b) => {
      if (b.openTicketCount !== a.openTicketCount) {
        return b.openTicketCount - a.openTicketCount;
      }
      if (b.recentTicketCount !== a.recentTicketCount) {
        return b.recentTicketCount - a.recentTicketCount;
      }
      return a.name.localeCompare(b.name);
    });

    console.log('\n' + '='.repeat(95));
    console.log(` SITES CURRENTLY ACTIVE & RECEIVING TICKETS IN GREYORANGE (COUNT: ${activeOperationalSites.length})`);
    console.log('='.repeat(95));

    console.log(
      String('NO.').padEnd(5) +
      String('EXACT SITE / ACCOUNT NAME').padEnd(42) +
      String('ACCOUNT ID').padEnd(22) +
      String('OPEN').padEnd(8) +
      String('RECENT').padEnd(8) +
      String('LAST TICKET')
    );
    console.log('-'.repeat(95));

    activeOperationalSites.forEach((s, idx) => {
      const dateStr = s.lastTicketDate ? s.lastTicketDate.slice(0, 10) : 'N/A';
      console.log(
        String(idx + 1).padEnd(5) +
        String(s.name).padEnd(42).slice(0, 41) + ' ' +
        String(s.accountId).padEnd(22) +
        String(s.openTicketCount).padEnd(8) +
        String(s.recentTicketCount).padEnd(8) +
        dateStr
      );
    });

    console.log('='.repeat(95));

    // Save JSON output
    const jsonPath = path.resolve(process.cwd(), 'active_sites_receiving_tickets.json');
    fs.writeFileSync(jsonPath, JSON.stringify(activeOperationalSites, null, 2), 'utf8');

    // Save plain text output (just names)
    const txtPath = path.resolve(process.cwd(), 'active_sites_receiving_tickets.txt');
    fs.writeFileSync(txtPath, activeOperationalSites.map(s => s.name).join('\n'), 'utf8');

    console.log(`\n[✔] Extracted ${activeOperationalSites.length} operational sites.`);
    console.log(`[✔] Saved files:`);
    console.log(`    - JSON: ${jsonPath}`);
    console.log(`    - TXT:  ${txtPath}\n`);
  } catch (err) {
    console.error(`\n[ERROR] ${err.message}\n`);
    if (err.stack) console.error(err.stack);
  }
}

main();

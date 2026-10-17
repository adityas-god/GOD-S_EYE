import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../Frontend/.env') });

import {
  executeSOQL,
  getTicketEndTime,
  hasTicketEndTime,
  isLiveOpenCase,
  isAlertCase,
  isDirTicket
} from '../src/services/salesforce.service.js';

// Status patterns that were considered closed in the legacy logic
const EXCLUDED_STATUS_PATTERNS = [
  'closed', 'solved', 'resolved', 'cancel', 'complete', 'duplicate',
  'on hold', 'hold', 'pending confirmation', 'pending-confirmation',
  'pending customer confirmation', 'pending information',
  'waiting on customer', 'waiting for customer'
];

// Legacy live case detector (BEFORE end time check was added)
function isLiveOpenCase_BEFORE(c) {
  if (!c) return false;
  const status = String(c.Status || c.status || '').trim().toLowerCase();
  if (!status) return false;
  for (const pattern of EXCLUDED_STATUS_PATTERNS) {
    if (status.includes(pattern)) return false;
  }
  if (isAlertCase(c)) return false;
  if (isDirTicket(c)) return false;
  return true;
}

// Current live case detector (AFTER end time check was added)
function isLiveOpenCase_AFTER(c) {
  return isLiveOpenCase(c);
}

async function runComparison() {
  console.log('\n' + '='.repeat(80));
  console.log('  🔍 GOD\'S EYE: LIVE CASES BEFORE VS AFTER "END TIME" FILTER COMPARISON');
  console.log('='.repeat(80) + '\n');

  // 1. SOQL Query Comparison
  console.log('📡 [1/3] Executing Salesforce SOQL queries...\n');

  const soqlWithoutEndTime = `
    SELECT Id, CaseNumber, Subject, Status, Highest_Severity__c, End_Time__c, ClosedDate, 
           Snow_Sitename__c, Account_Name__c, Type, DIR_Approval__c, LastModifiedDate
    FROM Case 
    WHERE Status != 'Closed'
    ORDER BY LastModifiedDate DESC 
    LIMIT 200
  `.replace(/\s+/g, ' ').trim();

  const soqlWithEndTime = `
    SELECT Id, CaseNumber, Subject, Status, Highest_Severity__c, End_Time__c, ClosedDate, 
           Snow_Sitename__c, Account_Name__c, Type, DIR_Approval__c, LastModifiedDate
    FROM Case 
    WHERE Status != 'Closed' AND End_Time__c = null
    ORDER BY LastModifiedDate DESC 
    LIMIT 200
  `.replace(/\s+/g, ' ').trim();

  let rawCases = [];
  let soqlCountWithoutEndTime = 0;
  let soqlCountWithEndTime = 0;

  try {
    const resWithout = await executeSOQL(soqlWithoutEndTime);
    rawCases = resWithout.records || [];
    soqlCountWithoutEndTime = rawCases.length;
    console.log(`  ✓ SOQL Query WITHOUT End Time constraint returned: ${soqlCountWithoutEndTime} records`);
  } catch (err) {
    console.error('  ✗ Error executing SOQL without End Time:', err.message);
  }

  try {
    const resWith = await executeSOQL(soqlWithEndTime);
    soqlCountWithEndTime = (resWith.records || []).length;
    console.log(`  ✓ SOQL Query WITH End Time constraint (End_Time__c = null) returned: ${soqlCountWithEndTime} records`);
  } catch (err) {
    console.warn('  ! Note: SOQL with End_Time__c = null check:', err.message);
  }

  // 2. Application Logic Comparison on retrieved pool
  console.log('\n⚙️  [2/3] Evaluating application-level filter logic on fetched tickets...\n');

  const liveCasesBefore = [];
  const liveCasesAfter = [];
  const removedByEndTime = [];

  for (const c of rawCases) {
    const passesBefore = isLiveOpenCase_BEFORE(c);
    const passesAfter = isLiveOpenCase_AFTER(c);
    const endTime = getTicketEndTime(c);

    if (passesBefore) {
      liveCasesBefore.push(c);
    }

    if (passesAfter) {
      liveCasesAfter.push(c);
    }

    // A ticket that was open BEFORE, but now removed because it has an End Time:
    if (passesBefore && !passesAfter && endTime) {
      removedByEndTime.push({
        caseNumber: c.CaseNumber,
        status: c.Status,
        endTime: endTime,
        site: c.Snow_Sitename__c || c.Account_Name__c || 'N/A',
        subject: c.Subject || 'No Subject',
        severity: c.Highest_Severity__c || 'N/A',
      });
    }
  }

  // 3. Summary Results
  console.log('-'.repeat(80));
  console.log('📊 COMPARISON SUMMARY:');
  console.log('-'.repeat(80));
  console.log(`  Total Cases Fetched from Salesforce : ${rawCases.length}`);
  console.log(`  Live Open Cases BEFORE (No End Time): ${liveCasesBefore.length}  [Legacy: Status-only filter]`);
  console.log(`  Live Open Cases AFTER  (With End Time): ${liveCasesAfter.length}  [New: Removes tickets with End Time]`);
  console.log(`  Tickets Excluded / Closed by End Time : ${removedByEndTime.length}  🎯 (Filtered out from Live Cases)\n`);

  // 4. Detailed Ticket-by-Ticket Delta
  console.log('-'.repeat(80));
  console.log('📋 SAMPLE TICKETS FILTERED OUT BY END TIME (BEFORE = OPEN, AFTER = REMOVED):');
  console.log('-'.repeat(80));

  if (removedByEndTime.length === 0) {
    console.log('  No tickets in the current sample have non-closed Status with End Time populated.');
    console.log('  (All fetched open cases are genuinely active with no End Time).');
  } else {
    console.log(
      String('Case #').padEnd(12) +
      String('SF Status').padEnd(18) +
      String('End Time / Closed').padEnd(26) +
      String('Site').padEnd(20) +
      'Subject'
    );
    console.log('-'.repeat(110));

    for (const t of removedByEndTime) {
      const caseNum = String(t.caseNumber || '').padEnd(12);
      const sfStatus = String(t.status || '').padEnd(18);
      const endTimeStr = String(t.endTime || '').padEnd(26);
      const siteStr = String(t.site || '').slice(0, 18).padEnd(20);
      const subjectStr = String(t.subject || '').slice(0, 35);
      console.log(`${caseNum}${sfStatus}${endTimeStr}${siteStr}${subjectStr}`);
    }

    console.log('\n🔍 WHAT THIS PROVES:');
    console.log('  • BEFORE: These tickets were shown on the live open board because Salesforce Status');
    console.log('            was not set to "Closed" (e.g. Work in Progress / Assigned / Pending).');
    console.log('  • AFTER : Because End Time is populated, the system recognizes they are resolved,');
    console.log('            marks their status as "Closed", and excludes them from live cases & Sev counts.');
  }

  console.log('\n' + '='.repeat(80) + '\n');
  process.exit(0);
}

runComparison().catch(err => {
  console.error('\n❌ Fatal error in comparison script:', err);
  process.exit(1);
});

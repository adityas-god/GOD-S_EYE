import { salesforceService, SalesforceTicketRecord } from '../microservices/salesforce/salesforceService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

function makeTicket(severity: 'SEV1' | 'SEV2' | 'SEV3'): SalesforceTicketRecord {
  return {
    id: `t_${Math.random()}`,
    ticketKey: `INC-${Math.floor(Math.random() * 10000)}`,
    siteId: 'test_site',
    siteName: 'Test Site',
    summary: 'Test incident',
    description: 'Test description',
    severity,
    status: 'OPEN',
    assigneeName: 'Test Engineer',
    assigneeRole: 'Engineer',
    serviceComponent: 'Butler',
    incidentDate: '2026-09-01',
    incidentTime: '08:00 AM',
    createdTimestamp: new Date().toISOString()
  };
}

console.log('--- RUNNING SALESFORCE SEVERITY ENGINE UNIT TESTS ---');

// Test 1: Empty Day (0 tickets) -> GREEN
const test1 = salesforceService.calculateDaySeverity([]);
assert(test1.severity === 'GREEN', 'Empty day returns GREEN');
assert(test1.hexColor === '#10B981', 'GREEN hex code is #10B981');

// Test 2: 1 SEV1 ticket -> RED
const test2 = salesforceService.calculateDaySeverity([makeTicket('SEV1')]);
assert(test2.severity === 'RED', '1 SEV1 ticket returns RED');
assert(test2.hexColor === '#EF4444', 'RED hex code is #EF4444');

// Test 3: 1 SEV1 + multiple SEV2/SEV3 -> RED takes precedence
const test3 = salesforceService.calculateDaySeverity([
  makeTicket('SEV1'),
  makeTicket('SEV2'),
  makeTicket('SEV2'),
  makeTicket('SEV3')
]);
assert(test3.severity === 'RED', 'SEV1 takes precedence over multiple SEV2 and SEV3');

// Test 4: >= 2 SEV2 tickets (0 SEV1) -> YELLOW
const test4 = salesforceService.calculateDaySeverity([
  makeTicket('SEV2'),
  makeTicket('SEV2')
]);
assert(test4.severity === 'YELLOW', '2 SEV2 tickets return YELLOW');
assert(test4.hexColor === '#F59E0B', 'YELLOW hex code is #F59E0B');

// Test 5: 3 SEV2 + 5 SEV3 -> YELLOW
const test5 = salesforceService.calculateDaySeverity([
  makeTicket('SEV2'), makeTicket('SEV2'), makeTicket('SEV2'),
  makeTicket('SEV3'), makeTicket('SEV3')
]);
assert(test5.severity === 'YELLOW', '3 SEV2 + 5 SEV3 return YELLOW');

// Test 6: Only SEV3 tickets -> BLUE
const test6 = salesforceService.calculateDaySeverity([
  makeTicket('SEV3'), makeTicket('SEV3'), makeTicket('SEV3')
]);
assert(test6.severity === 'BLUE', 'Only SEV3 tickets return BLUE');
assert(test6.hexColor === '#3B82F6', 'BLUE hex code is #3B82F6');

// Test 7: 1 SEV2 ticket + SEV3 tickets (less than 2 SEV2, 0 SEV1) -> BLUE
const test7 = salesforceService.calculateDaySeverity([
  makeTicket('SEV2'),
  makeTicket('SEV3')
]);
assert(test7.severity === 'BLUE', 'Single SEV2 with SEV3 returns BLUE');

console.log('--- ALL SEVERITY ENGINE UNIT TESTS PASSED SUCCESSFULLY ---');

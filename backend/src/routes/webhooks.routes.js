import { Router } from 'express';
import { CaseRepository } from '../models/Case.js';
import { SiteRepository } from '../models/Site.js';
import { addSSEClient, broadcastSSE } from '../services/sse.service.js';

const router = Router();

/**
 * GET /api/webhooks/events
 * Real-time SSE endpoint for frontend clients to receive real-time sync events
 */
router.get('/events', (req, res) => {
  addSSEClient(req, res);
});

/**
 * POST /api/webhooks/salesforce
 * Receives real-time webhook updates from Salesforce
 * Supports both JSON payloads (Apex / Flow HTTP Callout) and XML (Outbound Messaging)
 */
router.post('/salesforce', async (req, res) => {
  try {
    const rawBody = req.body;
    console.log('[Salesforce Webhook] Incoming event received.');

    // 1. Check if payload is XML / SOAP (Salesforce Outbound Message)
    if (typeof rawBody === 'string' && (rawBody.includes('<soapenv:Envelope') || rawBody.includes('<Notification>'))) {
      const caseIdMatch = rawBody.match(/<sObject.*?<sf:Id>(.*?)<\/sf:Id>/s) || rawBody.match(/<Id>(.*?)<\/Id>/);
      const statusMatch = rawBody.match(/<sf:Status>(.*?)<\/sf:Status>/) || rawBody.match(/<Status>(.*?)<\/Status>/);
      const caseNumMatch = rawBody.match(/<sf:CaseNumber>(.*?)<\/sf:CaseNumber>/) || rawBody.match(/<CaseNumber>(.*?)<\/CaseNumber>/);
      const siteMatch = rawBody.match(/<sf:Snow_Sitename__c>(.*?)<\/sf:Snow_Sitename__c>/) || rawBody.match(/<sf:Account_Name__c>(.*?)<\/sf:Account_Name__c>/);

      const caseId = caseIdMatch ? caseIdMatch[1] : null;
      const status = statusMatch ? statusMatch[1] : 'Updated';
      const caseNumber = caseNumMatch ? caseNumMatch[1] : 'Unknown';
      const siteName = siteMatch ? siteMatch[1] : null;

      if (caseId) {
        await CaseRepository.upsert({
          case_id: caseId,
          case_number: caseNumber,
          status,
          site_name: siteName,
          last_modified_date: new Date(),
        });

        broadcastSSE('case_update', {
          source: 'salesforce_outbound_message',
          caseId,
          caseNumber,
          status,
          siteName,
          timestamp: new Date().toISOString(),
        });
      }

      // Salesforce Outbound Messaging expects a standard SOAP Ack envelope
      const ackSoap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <notificationsResponse xmlns="http://soap.sforce.com/2005/09/outbound">
      <Ack>true</Ack>
    </notificationsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

      res.set('Content-Type', 'text/xml');
      return res.status(200).send(ackSoap);
    }

    // 2. JSON Payload (Apex Callout / Flow / External webhook trigger)
    const payload = typeof rawBody === 'object' ? rawBody : JSON.parse(rawBody || '{}');
    const caseData = payload.case || payload.record || payload;

    const caseId = caseData.Id || caseData.case_id || caseData.id;
    const caseNumber = caseData.CaseNumber || caseData.case_number;
    const rawStatus = caseData.Status || caseData.status || 'Updated';
    const subject = caseData.Subject || caseData.subject;
    const siteName = caseData.Snow_Sitename__c || caseData.Site_Name_Customer_Input__c || caseData.Account_Name__c || caseData.site_name;
    const accountId = caseData.AccountId || caseData.account_id;
    const isDown = Boolean(caseData.Is_Site_100_Down__c);

    const endTime =
      caseData.End_Time__c ||
      caseData.end_time ||
      caseData.EndTime ||
      caseData.EndTime__c ||
      caseData.ClosedDate ||
      caseData.closed_date ||
      null;

    const isClosed = Boolean(endTime) || ['closed', 'solved', 'resolved', 'complete'].some(p => String(rawStatus).toLowerCase().includes(p));
    const finalStatus = isClosed ? 'Closed' : rawStatus;

    if (caseId) {
      const updatedCase = await CaseRepository.upsert({
        case_id: caseId,
        case_number: caseNumber || 'Pending',
        subject: subject || null,
        status: finalStatus,
        site_name: siteName,
        account_id: accountId,
        is_site_down: isDown,
        closed_date: endTime ? new Date(endTime) : null,
        end_time: endTime ? new Date(endTime) : null,
        last_modified_date: new Date(),
        raw_data: caseData,
      });

      // If site identified, update site's count
      if (siteName || accountId) {
        const openCases = await CaseRepository.findOpenCasesForSite({
          siteName,
          accountId,
        });
        await SiteRepository.updateOpenCasesCount(siteName || accountId, openCases.length, openCases.some(c => c.is_site_down));
      }

      broadcastSSE('case_update', {
        source: 'salesforce_webhook',
        case: updatedCase,
        siteName,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        success: true,
        message: 'Case synchronized successfully in real time',
        case: updatedCase,
      });
    }

    res.json({ success: true, message: 'Webhook received (no case ID found)' });
  } catch (error) {
    console.error('[Webhook Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

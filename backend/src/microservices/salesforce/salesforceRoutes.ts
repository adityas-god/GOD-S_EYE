import { Router, Request, Response } from 'express';
import { salesforceService } from './salesforceService';
import { SalesforceTicket } from '../../models/SalesforceTicket';

const router = Router();

// GET /api/salesforce/calendar/:siteId?month=YYYY-MM
router.get('/calendar/:siteId', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = (req.query.month as string) || currentYearMonth;

    // 1. Query MongoDB for this site and month
    let dbTickets: any[] = [];
    try {
      dbTickets = await SalesforceTicket.find({
        siteId,
        receivedDate: { $regex: `^${month}` }
      }).lean();
    } catch (e) {
      // Fallback if Mongo unreachable
    }

    if (dbTickets && dbTickets.length > 0) {
      const totalDays = 31;
      const days = [];

      for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${month}-${String(day).padStart(2, '0')}`;
        const dayTickets = dbTickets.filter(t => t.receivedDate === dateStr);

        const sev1Count = dayTickets.filter(t => t.severity === 'SEV1').length;
        const sev2Count = dayTickets.filter(t => t.severity === 'SEV2').length;
        const sev3Count = dayTickets.filter(t => t.severity === 'SEV3').length;

        let severityColor: 'RED' | 'YELLOW' | 'BLUE' | 'GREEN' = 'GREEN';
        let hexColor = '#10B981';

        if (sev1Count >= 1) {
          severityColor = 'RED';
          hexColor = '#EF4444';
        } else if (sev2Count >= 2) {
          severityColor = 'YELLOW';
          hexColor = '#F59E0B';
        } else if (sev2Count === 1 || sev3Count >= 1) {
          severityColor = 'BLUE';
          hexColor = '#3B82F6';
        }

        days.push({
          date: dateStr,
          dayOfMonth: day,
          dayOfWeek: new Date(2025, 4, day).getDay(),
          severityColor,
          hexColor,
          totalTickets: dayTickets.length,
          sev1Count,
          sev2Count,
          sev3Count,
          tickets: dayTickets.map(t => ({
            id: t._id?.toString() || t.ticketId,
            ticketKey: t.ticketId,
            siteId: t.siteId,
            siteName: t.siteName,
            summary: t.subject,
            description: t.description,
            severity: t.severity,
            status: t.status,
            assigneeName: t.assignee?.name || 'Assigned Tech',
            assigneeRole: t.assignee?.role || 'Engineer',
            serviceComponent: t.serviceComponent,
            incidentDate: t.receivedDate,
            incidentTime: t.receivedTime || '09:00 AM EDT',
            createdTimestamp: t.createdAt || new Date().toISOString()
          }))
        });
      }

      return res.json({
        success: true,
        source: 'mongodb_atlas',
        siteId,
        month,
        days
      });
    }

    // Fallback to in-memory generator
    const calendarDays = salesforceService.getCalendarMonth(siteId, month);
    return res.json({
      success: true,
      source: 'fallback',
      siteId,
      month,
      days: calendarDays
    });
  } catch (err: any) {
    console.error('Error fetching calendar:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/salesforce/tickets/:siteId?date=YYYY-MM-DD&service=Platform
router.get('/tickets/:siteId', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const date = req.query.date as string | undefined;
    const service = req.query.service as string | undefined;

    const query: any = { siteId };
    if (date) query.receivedDate = date;
    if (service) query.serviceComponent = service;

    let dbTickets: any[] = [];
    try {
      dbTickets = await SalesforceTicket.find(query).sort({ receivedDate: -1 }).lean();
    } catch (e) {}

    if (dbTickets && dbTickets.length > 0) {
      const mapped = dbTickets.map(t => ({
        id: t._id?.toString() || t.ticketId,
        ticketKey: t.ticketId,
        siteId: t.siteId,
        siteName: t.siteName,
        summary: t.subject,
        description: t.description,
        severity: t.severity,
        status: t.status,
        assigneeName: t.assignee?.name || 'Field Specialist',
        assigneeRole: t.assignee?.role || 'Lead Engineer',
        serviceComponent: t.serviceComponent,
        incidentDate: t.receivedDate,
        incidentTime: t.receivedTime || '09:00 AM EDT',
        createdTimestamp: t.createdAt || new Date().toISOString()
      }));

      return res.json({
        success: true,
        source: 'mongodb_atlas',
        siteId,
        count: mapped.length,
        data: mapped
      });
    }

    const tickets = salesforceService.getTickets(siteId, date, service);
    res.json({
      success: true,
      source: 'fallback',
      siteId,
      count: tickets.length,
      data: tickets
    });
  } catch (err: any) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/salesforce/trends/:siteId
router.get('/trends/:siteId', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const trends = salesforceService.getIncidentTrends(siteId);
    res.json({
      success: true,
      siteId,
      trends
    });
  } catch (err: any) {
    console.error('Error fetching trends:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

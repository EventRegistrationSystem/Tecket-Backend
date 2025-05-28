import { prisma } from '../config/prisma';
import { PrismaClient, Ticket } from '@prisma/client';
import { Report, TicketAggregate, ParticipantSection } from '../types/reportTypes';

export class ReportService{
 static async generateReport(eventId: number): Promise<Report> {
    const [event, tickets] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId } }),
      prisma.ticket.findMany({ where: { eventId } })
    ]);

    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }

    const soldByTickets: TicketAggregate[] = [];
    const revenueByTickets: TicketAggregate[] = [];
    const remainingByTicket: TicketAggregate[] = [];

    let totalTickets = 0;
    let revenue = 0;
    let remainingTickets = 0;

    tickets.forEach((t: Ticket) => {
      const sold   = t.quantitySold;
      const unsold = t.quantityTotal - t.quantitySold;
      const rev    = Number(t.price) * sold; 

      soldByTickets.push({ name: t.name, total: sold });
      revenueByTickets.push({ name: t.name, total: rev });
      remainingByTicket.push({ name: t.name, total: unsold });

      totalTickets     += sold;
      revenue          += rev;
      remainingTickets += unsold;
    });

    const registrations = await prisma.registration.findMany({
      where: { eventId },
      include: {
        attendees: {
          include: {
            participant: true,
            responses: {
              include: {
                eventQuestion: {
                  include: { question: true }
                }
              }
            }
          }
        },
        purchase: {                                 
          include: {
            items: { include: { ticket: true } }
          }
        }
      }
    });

    const participants: ParticipantSection[] = [];

    for (const reg of registrations) {
      const itemsPerAttendee = reg.purchase?.items ?? []; 
      reg.attendees.forEach((att, idx) => {
        participants.push({
          name:  `${att.participant.firstName} ${att.participant.lastName}`,
          email: att.participant.email,
          ticket:
            itemsPerAttendee[idx]?.ticket?.name ?? 'Unknown',
          questionnairreResponses: att.responses.map(r => ({
            question:  r.eventQuestion.question.questionText,
            response:  r.responseText
          }))
        });
      });
    }

    const report: Report = {
      eventName: event.name,
      eventDescription: event.description ?? '',
      start: event.startDateTime,
      end: event.endDateTime,
      sales: {
        totalTickets,
        revenue,
        soldByTickets,
        revenueByTickets
      },
      remaining: {
        remainingTickets,
        remainingByTicket
      },
      participants
    };

    return report;
  }
}
import { prisma } from '../config/prisma';
import { PrismaClient, Ticket, QuestionType } from '@prisma/client'; 
import { Report, TicketAggregate, ParticipantSection, QuestionAggregate } from '../types/reportTypes'; 
import { NotFoundError } from '../utils/errors'; 

/**
 * Service class for handling report generation logic.
 */
export class ReportService {
  /**
   * Generates a comprehensive report for a given event.
   * The report includes event details, sales figures, remaining ticket information,
   * participant details, and aggregated responses to event questionnaires.
   * @param eventId - The ID of the event for which to generate the report.
   * @returns A Promise that resolves to the generated Report object.
   * @throws NotFoundError if the event with the specified ID is not found.
   */
  static async generateReport(eventId: number): Promise<Report> {
    
    // Fetch event details and all associated tickets 
    const [event, tickets] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId } }),
      prisma.ticket.findMany({ where: { eventId } }),
    ]);

    // If event is not found, throw a NotFoundError
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Initialize aggregates for sales and remaining tickets
    const soldByTickets: TicketAggregate[] = [];
    const revenueByTickets: TicketAggregate[] = [];
    const remainingByTicket: TicketAggregate[] = [];

    let totalTicketsSold = 0;
    let totalRevenue = 0;
    let totalRemainingTickets = 0;

    // Process each ticket to calculate sales and remaining quantities
    tickets.forEach((t: Ticket) => {
      const sold = t.quantitySold;
      const unsold = t.quantityTotal - t.quantitySold;
      const revenueFromTicket = Number(t.price) * sold;

      soldByTickets.push({ name: t.name, total: sold });
      revenueByTickets.push({ name: t.name, total: revenueFromTicket });
      remainingByTicket.push({ name: t.name, total: unsold });

      totalTicketsSold += sold;
      totalRevenue += revenueFromTicket;
      totalRemainingTickets += unsold;
    });

    // Fetch all registrations for the event, including related attendee, participant, response, and question data
    const registrations = await prisma.registration.findMany({
      where: { eventId },
      include: {
        attendees: { // Include attendees of the registration
          include: {
            participant: true, // Include participant details for each attendee
            responses: { // Include responses to event questions by the attendee
              include: {
                eventQuestion: { // Include the event question details
                  include: {
                    question: { include: { options: true } }, // Include the actual question text and its options
                  },
                },
              },
            },
          },
        },
        purchase: { // Include purchase details associated with the registration
          include: {
            items: { include: { ticket: true } }, // Include purchased items and their ticket details
          },
        },
      },
    });

    const participants: ParticipantSection[] = [];
    const questionsAggregate: Record<string, QuestionAggregate> = {}; // Stores aggregated answers for each question

    // Process each registration to extract participant information and aggregate question responses
    for (const reg of registrations) {
      const itemsPerAttendee = reg.purchase?.items ?? []; // Get purchased items, default to empty array if none
      reg.attendees.forEach((att, idx) => {
        // Construct participant section for the report
        participants.push({
          name: `${att.participant.firstName} ${att.participant.lastName}`,
          email: att.participant.email,
          ticket: itemsPerAttendee[idx]?.ticket?.name ?? 'Unknown', // Get ticket name, default to 'Unknown'
          questionnairreResponses: att.responses.map((r) => ({
            question: r.eventQuestion.question.questionText,
            response: r.responseText,
          })),
        });

        // Aggregate responses for each question
        att.responses.forEach((r) => {
          const q = r.eventQuestion.question;
          const questionText = q.questionText;
          const options = q.options; // Options for multiple-choice questions

          // Only aggregate if the question has predefined options (e.g., multiple choice, checkbox)
          if (options && Array.isArray(options) && options.length > 0) {
            let selectedOptions: string[] = [];
            // For CHECKBOX type, responseText might be a JSON array string of selected options
            if (q.questionType === QuestionType.CHECKBOX) {
              try {
                const parsedResponse = JSON.parse(r.responseText);
                selectedOptions = Array.isArray(parsedResponse) ? parsedResponse : [r.responseText];
              } catch {
                // If parsing fails, treat responseText as a single selected option
                selectedOptions = [r.responseText];
              }
            } else {
              // For other types (RADIO, DROPDOWN), responseText is the single selected option
              selectedOptions = [r.responseText];
            }

            // Increment count for each selected option for the current question
            selectedOptions.forEach((option) => {
              if (!questionsAggregate[questionText]) {
                questionsAggregate[questionText] = {};
              }
              if (!questionsAggregate[questionText][option]) {
                questionsAggregate[questionText][option] = 0;
              }
              questionsAggregate[questionText][option] += 1;
            });
          }
        });
      });
    }

    // Construct the final report object
    const report: Report = {
      eventName: event.name,
      eventDescription: event.description ?? '', // Use empty string if description is null
      start: event.startDateTime,
      end: event.endDateTime,
      sales: {
        totalTickets: totalTicketsSold,
        revenue: totalRevenue,
        soldByTickets,
        revenueByTickets,
      },
      remaining: {
        remainingTickets: totalRemainingTickets,
        remainingByTicket,
      },
      participants,
      questions: questionsAggregate,
    };

    return report;
  }
}

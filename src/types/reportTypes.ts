
export interface TicketAggregate {
  name: string;   // ticket name (e.g. “VIP”, “General”)
  total: number;  // count or $, depending on context
}

export interface QuestionnaireResponse {
  question: string;
  response: string;
}

export interface SalesSection {
  totalTickets: number;
  revenue: number;                  // overall $ value
  soldByTickets: TicketAggregate[]; // units sold per ticket type
  revenueByTickets: TicketAggregate[]; // $ per ticket type
}

export interface RemainingSection {
  remainingTickets: number;
  remainingByTicket: TicketAggregate[]; // unsold per ticket type
}

export interface ParticipantSection {
  name: string;
  email: string;
  ticket: string;                        // ticket name/id held
  questionnaireResponses: QuestionnaireResponse[];
}

export interface Report {
    sales: SalesSection,
    remaining: RemainingSection,
    participants: ParticipantSection[]
}

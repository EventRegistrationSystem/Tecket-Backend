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
  questionnairreResponses: QuestionnaireResponse[];
}

export interface QuestionAggregate {
  [option: string]: number; // option text mapped to count
}

export interface Report {
    eventName : string
    eventDescription : string,
    start : Date, 
    end : Date,
    sales: SalesSection,
    remaining: RemainingSection,
    participants: ParticipantSection[],
    questions: Record<string, QuestionAggregate> // added aggregation for multiple-choice questions
}

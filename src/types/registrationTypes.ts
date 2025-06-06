import { PaymentStatus, RegistrationStatus } from "@prisma/client";

// Includes participant details and their specific answers
export interface ParticipantInput {
    ticketId: number; // ID of the ticket assigned to this participant
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    dateOfBirth?: Date | string; // Allow string for input, convert in service layer
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    responses: Array<{
        eventQuestionId: number; // ID linking to the EventQuestions table
        responseText: string;
    }>;
}

// Main DTO for creating a registration with multiple participants/attendees
export interface CreateRegistrationDto {
    eventId: number;
    tickets: Array<{
        ticketId: number; // ID of the ticket type being purchased
        quantity: number; // How many of this ticket type
    }>;
    // Array containing details for ALL participants (main registrant + others)
    // The number of objects in this array should match the total quantity of tickets purchased.
    participants: ParticipantInput[];
}

// DTO for the response after creating a registration (before payment)
export interface CreateRegistrationResponse {
    message: string;
    registrationId: number; // The ID of the created Registration record
    paymentToken?: string; // Optional token for guest payments
    // Optionally include other details like total price calculated, etc.
}

// DTO for retrieving registration details (example, might need refinement)
// This would likely involve fetching the Registration and its related Attendees, Participants, Purchases etc.
export interface RegistrationDetailsDto {
    id: number;
    eventId: number;
    eventName: string; // Example derived field
    status: string; // RegistrationStatus enum value
    createdAt: Date;
    primaryParticipant: { // Details of the main registrant
        id: number;
        firstName: string;
        lastName: string;
        email: string;
    };
    attendees: Array<{ // Details of all attendees including primary
        attendeeId: number;
        participantId: number;
        firstName: string;
        lastName: string;
        email: string;
        responses: Array<{
            questionText: string; // Example derived field
            responseText: string;
        }>;
    }>;
    purchase?: { // Details if it was a paid event
        totalPrice: number; // Prisma Decimal might need conversion
        currency?: string;
        paymentStatus?: PaymentStatus;
    };
    // Add other relevant fields as needed
}

// DTO for a single registration summary in a list
export interface RegistrationSummaryDto {
    registrationId: number;
    registrationDate: Date;
    primaryParticipantName: string; // e.g., "John Doe"
    primaryParticipantEmail: string;
    numberOfAttendees: number;
    status: string; // RegistrationStatus enum value
    totalAmountPaid?: number; // Optional, for paid events
    eventName?: string; // Optional, for admin views listing registrations across events
}

// DTO for the paginated list of registration summaries
export interface PaginatedRegistrationSummaryResponse {
    registrations: RegistrationSummaryDto[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        pages: number;
    };
}

// Query Types previously in RegistrationService

export interface GetRegistrationsQuery {
    eventId?: number;
    userId?: number;
    page: number; // Usually required, might have default in controller
    limit: number; // Usually required, might have default in controller
}

export interface GetRegistrationsForEventQuery {
    page?: number; // Default 1 in service/controller
    limit?: number; // Default 10 in service/controller
    search?: string;
    status?: RegistrationStatus;
    ticketId?: number;
}

export interface GetAdminAllRegistrationsQuery {
    page?: number; // Default 1
    limit?: number; // Default 10
    search?: string;
    status?: RegistrationStatus;
    ticketId?: number;
    eventId?: number;
    userId?: number;
    participantId?: number;
}

export interface UpdateRegistrationStatusDto {
    status: RegistrationStatus;
}

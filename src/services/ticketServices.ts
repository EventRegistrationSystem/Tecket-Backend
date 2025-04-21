import { prisma } from '../config/prisma';
import { Ticket } from '@prisma/client';
import { ValidationError, AuthorizationError } from '../utils/errors'; // Import AuthorizationError
import { CreateTicketDTO, UpdateTicketDTO } from '../types/ticketTypes';

export class TicketService {
    /**
     * Create a new ticket for an event
     * @param userId The ID of the user attempting to create the ticket (should be the organizer)
     * @param eventId The ID of the event to add the ticket to
     * @param ticketData Data for the new ticket
     */
    static async createTicket(userId: number, eventId: number, ticketData: CreateTicketDTO): Promise<Ticket> {
        // Verify the event exists and get organiserId for auth check
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, organiserId: true, endDateTime: true } // Select needed fields
        });

        if (!event) {
            throw new ValidationError('Event not found');
        }

        // Authorization Check: Ensure the user owns the event
        if (event.organiserId !== userId) {
            throw new AuthorizationError('You are not authorized to add tickets to this event.');
        }

        // Validate ticket data
        if (new Date(ticketData.salesEnd) <= new Date(ticketData.salesStart)) {
            throw new ValidationError('Sales end date must be after sales start date');
        }
        if (new Date(ticketData.salesEnd) > new Date(event.endDateTime)) {
            throw new ValidationError('Ticket sales cannot end after the event ends');
        }
        if (ticketData.price < 0) {
            throw new ValidationError('Ticket price cannot be negative');
        }
        if (ticketData.quantityTotal <= 0) {
            throw new ValidationError('Ticket quantity must be positive');
        }

        // Create the ticket
        return prisma.ticket.create({
            data: {
                eventId, // Use the validated eventId
                name: ticketData.name,
                description: ticketData.description,
                price: ticketData.price,
                quantityTotal: ticketData.quantityTotal,
                salesStart: new Date(ticketData.salesStart),
                salesEnd: new Date(ticketData.salesEnd),
                status: 'ACTIVE',
                quantitySold: 0
            }
        });
    }

    /**
     * Update an existing ticket
     * @param userId The ID of the user attempting the update
     * @param ticketId The ID of the ticket to update
     * @param ticketData The new ticket data
     */
    static async updateTicket(userId: number, ticketId: number, ticketData: UpdateTicketDTO): Promise<Ticket> {
        // Verify the ticket exists and include event for ownership check
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { event: { select: { organiserId: true, endDateTime: true } } } // Include event organiserId and endDateTime
        });

        if (!ticket) {
            throw new ValidationError('Ticket not found');
        }

        // Authorization Check: Ensure the user owns the event
        if (ticket.event.organiserId !== userId) {
            throw new AuthorizationError('Permission denied to update this ticket.');
        }

        // Validate date changes if provided
        const currentSalesStart = ticket.salesStart ?? undefined; // Handle null
        const currentSalesEnd = ticket.salesEnd ?? undefined; // Handle null
        const newSalesStart = ticketData.salesStart ? new Date(ticketData.salesStart) : currentSalesStart;
        const newSalesEnd = ticketData.salesEnd ? new Date(ticketData.salesEnd) : currentSalesEnd;

        if (newSalesStart && newSalesEnd && newSalesEnd <= newSalesStart) {
             throw new ValidationError('Sales end date must be after sales start date');
        }

        // Validate event end date
        if (newSalesEnd && new Date(newSalesEnd) > new Date(ticket.event.endDateTime)) {
            throw new ValidationError('Ticket sales cannot end after the event ends');
        }

        // Validate quantity changes
        if (ticketData.quantityTotal !== undefined) {
            if (ticketData.quantityTotal < 0) {
                throw new ValidationError('Ticket quantity cannot be negative');
            }
            if (ticketData.quantityTotal < ticket.quantitySold) {
                throw new ValidationError('Cannot reduce quantity below the number of tickets already sold');
            }
        }

        // Update the ticket
        return prisma.ticket.update({
            where: { id: ticketId },
            data: {
                name: ticketData.name,
                description: ticketData.description,
                price: ticketData.price,
                quantityTotal: ticketData.quantityTotal,
                salesStart: ticketData.salesStart ? new Date(ticketData.salesStart) : undefined,
                salesEnd: ticketData.salesEnd ? new Date(ticketData.salesEnd) : undefined,
                status: ticketData.status
            }
        });
    }

    /**
     * Delete a ticket
     * @param userId The ID of the user attempting the deletion
     * @param ticketId The ID of the ticket to delete
     */
    static async deleteTicket(userId: number, ticketId: number): Promise<void> {
        // Verify the ticket exists and include event for ownership check
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { event: { select: { organiserId: true } } } // Include event organiserId
        });

        if (!ticket) {
            throw new ValidationError('Ticket not found');
        }

        // Authorization Check: Ensure the user owns the event
        if (ticket.event.organiserId !== userId) {
            throw new AuthorizationError('Permission denied to delete this ticket.');
        }

        // Check if the ticket has been purchased
        if (ticket.quantitySold > 0) {
            throw new ValidationError('Cannot delete a ticket that has been purchased');
        }

        // Delete the ticket
        await prisma.ticket.delete({
            where: { id: ticketId }
        });
    }

    /**
     * Get tickets for an event
     */
    static async getTicketsByEvent(eventId: number): Promise<Ticket[]> {
        // Verify the event exists (optional, could rely on FK constraints or route validation)
        const eventExists = await prisma.event.count({ where: { id: eventId } });
        if (eventExists === 0) {
             throw new ValidationError('Event not found');
        }


        // Get tickets
        return prisma.ticket.findMany({
            where: {
                eventId,
                status: 'ACTIVE' // Typically only show active tickets publicly
            },
            orderBy: { price: 'asc' }
        });
    }

    /**
     * Get ticket details
     */
    static async getTicketById(ticketId: number): Promise<Ticket> {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId }
        });

        if (!ticket) {
            throw new ValidationError('Ticket not found');
        }

        return ticket;
    }

    /**
     * Check ticket availability
     */
    static async checkAvailability(ticketId: number): Promise<{
        available: boolean;
        availableQuantity: number;
        reason?: string;
    }> {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { event: true } // Include event for status check
        });

        if (!ticket) {
            throw new ValidationError('Ticket not found');
        }

        const now = new Date();
        const availableQuantity = ticket.quantityTotal - ticket.quantitySold;

        // Check if ticket is active
        if (ticket.status !== 'ACTIVE') {
            return { available: false, availableQuantity: 0, reason: 'Ticket is no longer available' };
        }

        // Check if event is published
        if (ticket.event.status !== 'PUBLISHED') {
            return { available: false, availableQuantity: 0, reason: 'Event is not open for registration' };
        }

        // Check sales period
        if (ticket.salesStart && now < new Date(ticket.salesStart)) {
            return { available: false, availableQuantity: 0, reason: 'Ticket sales have not started yet' };
        }
        if (ticket.salesEnd && now > new Date(ticket.salesEnd)) {
            return { available: false, availableQuantity: 0, reason: 'Ticket sales have ended' };
        }

        // Check quantity
        if (availableQuantity <= 0) {
            return { available: false, availableQuantity: 0, reason: 'Sold out' };
        }

        return { available: true, availableQuantity };
    }
}

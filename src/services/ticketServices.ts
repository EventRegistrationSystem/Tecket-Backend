import { prisma } from '../config/prisma';
import { Ticket, UserRole } from '@prisma/client'; // Import UserRole
import { ValidationError, AuthorizationError, NotFoundError } from '../utils/errors'; // Added NotFoundError, ensure it's used or remove
import { CreateTicketDTO, UpdateTicketDTO } from '../types/ticketTypes';

export class TicketService {
    /**
     * Create a new ticket for an event
     * @param userId The ID of the user attempting to create the ticket.
     * @param userRole The role of the user.
     * @param eventId The ID of the event to add the ticket to.
     * @param ticketData Data for the new ticket.
     */
    static async createTicket(userId: number, userRole: UserRole, eventId: number, ticketData: CreateTicketDTO): Promise<Ticket> {
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, organiserId: true, endDateTime: true }
        });

        if (!event) {
            throw new NotFoundError('Event not found'); // Changed to NotFoundError for consistency
        }

        // Authorization Check: User must be ADMIN or own the event
        if (userRole !== UserRole.ADMIN && event.organiserId !== userId) {
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
    static async updateTicket(
        userId: number,
        userRole: UserRole, // Added userRole
        ticketId: number,
        ticketData: UpdateTicketDTO): Promise<Ticket> {

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { event: { select: { organiserId: true, endDateTime: true } } }
        });

        if (!ticket) {
            throw new NotFoundError('Ticket not found');
        }

        // Authorization Check: User must be ADMIN or own the event
        if (userRole !== UserRole.ADMIN && ticket.event.organiserId !== userId) {
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
     * @param userId The ID of the user attempting the deletion.
     * @param userRole The role of the user.
     * @param ticketId The ID of the ticket to delete.
     */
    static async deleteTicket(userId: number, userRole: UserRole, ticketId: number): Promise<void> {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { event: { select: { organiserId: true } } }
        });

        if (!ticket) {
            throw new NotFoundError('Ticket not found');
        }

        // Authorization Check: User must be ADMIN or own the event
        if (userRole !== UserRole.ADMIN && ticket.event.organiserId !== userId) {
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
        // Verify the event exists
        const eventExists = await prisma.event.count({ where: { id: eventId } });
        if (eventExists === 0) {
            throw new NotFoundError('Event not found');
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
            throw new NotFoundError('Ticket not found');
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
            throw new NotFoundError('Ticket not found');
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

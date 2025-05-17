// src/controllers/ticketController.ts
import { Request, Response } from 'express';
import { TicketService } from '../services/ticketServices';
import { CreateTicketDTO, UpdateTicketDTO } from '../types/ticketTypes';
import { ValidationError, AuthorizationError, NotFoundError } from '../utils/errors'; // Import NotFoundError

export class TicketController {
    /**
     * Create a new ticket
     */
    static async createTicket(req: Request, res: Response): Promise<void> {
        try {
            const eventId = parseInt(req.params.eventId);
            const userId = req.user?.userId; // Get authenticated user ID for potential service-level check

            if (isNaN(eventId)) {
                res.status(400).json({ success: false, message: 'Invalid event ID' });
                return;
            }
            if (!userId) {
                // Should be caught by middleware, but belts and suspenders
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const ticketData: CreateTicketDTO = { ...req.body, eventId };

            // Pass userId to createTicket for ownership check
            const ticket = await TicketService.createTicket(userId, eventId, ticketData);

            res.status(201).json({ success: true, data: ticket });
        }
        catch (error: any) {
            console.error('Error creating ticket:', error);
            if (error instanceof NotFoundError) {
                res.status(404).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(403).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) {
                res.status(400).json({ success: false, message: error.message });
            }
            else {
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred while creating the ticket.'
                });
            }
        }
    }

    /**
     * Update an existing ticket
     */
    static async updateTicket(req: Request, res: Response): Promise<void> {
        try {
            // Read both eventId and ticketId from params
            const ticketId = parseInt(req.params.ticketId);
            const eventId = parseInt(req.params.eventId); // Read eventId for context
            const userId = req.user?.userId; // Get authenticated user ID

            if (isNaN(ticketId) || isNaN(eventId)) {
                res.status(400).json({ success: false, message: 'Invalid event or ticket ID' });
                return;
            }

            // Ensure user is authenticated
            if (!userId) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const ticketData: UpdateTicketDTO = req.body;

            // Pass userId to service for ownership check (Service method signature needs update)
            const ticket = await TicketService.updateTicket(userId, ticketId, ticketData);

            res.status(200).json({ success: true, data: ticket });
        }
        catch (error: any) {
            console.error('Error updating ticket:', error);
            if (error instanceof NotFoundError) {
                res.status(404).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(403).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) {
                res.status(400).json({ success: false, message: error.message });
            }
            else {
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred while updating the ticket.'
                });
            }
        }
    }

    /**
     * Delete a ticket
     */
    static async deleteTicket(req: Request, res: Response): Promise<void> {
        try {
            // Read both eventId and ticketId from params
            const ticketId = parseInt(req.params.ticketId);
            const eventId = parseInt(req.params.eventId); // Read eventId for context
            const userId = req.user?.userId; // Get authenticated user ID

            if (isNaN(ticketId) || isNaN(eventId)) {
                res.status(400).json({ success: false, message: 'Invalid event or ticket ID' });
                return;
            }

            // Ensure user is authenticated
            if (!userId) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            // Pass userId to service for ownership check (Service method signature needs update)
            await TicketService.deleteTicket(userId, ticketId);

            res.status(200).json({ success: true, message: 'Ticket deleted successfully' });
        }
        catch (error: any) {
            console.error('Error deleting ticket:', error);
            if (error instanceof NotFoundError) {
                res.status(404).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(403).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) {
                res.status(400).json({ success: false, message: error.message });
            }
            else {
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred while deleting the ticket.'
                });
            }
        }
    }

    /**
     * Get tickets for an event
     */
    static async getTicketsByEvent(req: Request, res: Response): Promise<void> {
        try {
            const eventId = parseInt(req.params.eventId);

            if (isNaN(eventId)) {
                res.status(400).json({ success: false, message: 'Invalid event ID' });
                return;
            }

            const tickets = await TicketService.getTicketsByEvent(eventId);

            res.status(200).json({ success: true, data: tickets });
        }
        catch (error: any) {
            console.error('Error getting tickets:', error);
            if (error instanceof NotFoundError) { // Service throws NotFoundError if event not found
                res.status(404).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) {
                res.status(400).json({ success: false, message: error.message });
            }
            else {
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred while retrieving tickets.'
                });
            }
        }
    }

    /**
     * Get ticket details
     */
    static async getTicketById(req: Request, res: Response): Promise<void> {
        try {
            // Read ticketId from params (eventId is available but not needed by current service method)
            const ticketId = parseInt(req.params.ticketId);
            const eventId = parseInt(req.params.eventId); // Read eventId for context

            if (isNaN(ticketId) || isNaN(eventId)) {
                res.status(400).json({ success: false, message: 'Invalid event or ticket ID' });
                return;
            }

            // Optional: Could add check here to ensure ticket belongs to eventId before calling service
            const ticket = await TicketService.getTicketById(ticketId);

            // Optional: Could add check here that ticket.eventId matches eventId from params

            res.status(200).json({ success: true, data: ticket });
        }
        catch (error: any) {
            console.error('Error getting ticket:', error);
            if (error instanceof NotFoundError) { // Service throws NotFoundError if ticket not found
                res.status(404).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) { // Should not happen if ID is validated, but as a fallback
                res.status(400).json({ success: false, message: error.message });
            }
            else {
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred while retrieving the ticket.'
                });
            }
        }
    }

    /**
     * Check ticket availability
     */
    static async checkAvailability(req: Request, res: Response): Promise<void> {
        try {
            // Read ticketId from params (eventId is available but not needed by current service method)
            const ticketId = parseInt(req.params.ticketId);
            const eventId = parseInt(req.params.eventId); // Read eventId for context

            if (isNaN(ticketId) || isNaN(eventId)) {
                res.status(400).json({ success: false, message: 'Invalid event or ticket ID' });
                return;
            }

            // Optional: Could add check here to ensure ticket belongs to eventId before calling service

            const availability = await TicketService.checkAvailability(ticketId);

            res.status(200).json({ success: true, data: availability });
        }
        catch (error: any) {
            console.error('Error checking ticket availability:', error);
            if (error instanceof NotFoundError) { // Service throws NotFoundError if ticket not found
                res.status(404).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) {
                res.status(400).json({ success: false, message: error.message });
            }
            else {
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred while checking ticket availability.'
                });
            }
        }
    }
}

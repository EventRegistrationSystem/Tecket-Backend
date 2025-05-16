// src/controllers/ticketController.ts
import { Request, Response } from 'express';
import { TicketService } from '../services/ticketServices';
import { CreateTicketDTO, UpdateTicketDTO } from '../types/ticketTypes';
import { ValidationError, AuthorizationError } from '../utils/errors'; // Assuming AuthorizationError exists or will be created

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
        catch (error) {
            console.error('Error creating ticket:', error);
            const statusCode = error instanceof ValidationError ? 400 : error instanceof AuthorizationError ? 403 : 500;
            res.status(statusCode).json({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
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
        catch (error) {
            console.error('Error updating ticket:', error);
            const statusCode = error instanceof ValidationError ? 400 : error instanceof AuthorizationError ? 403 : 500;
            res.status(statusCode).json({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
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
        catch (error) {
            console.error('Error deleting ticket:', error);
            const statusCode = error instanceof ValidationError ? 400 : error instanceof AuthorizationError ? 403 : 500;
            res.status(statusCode).json({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
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
        catch (error) {
            console.error('Error getting tickets:', error);
            const statusCode = error instanceof ValidationError ? 400 : 500;
            res.status(statusCode).json({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
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
        catch (error) {
            console.error('Error getting ticket:', error);
            const statusCode = error instanceof ValidationError ? 400 : 500;
            res.status(statusCode).json({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
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
        catch (error) {
            console.error('Error checking ticket availability:', error);
            const statusCode = error instanceof ValidationError ? 400 : 500;
            res.status(statusCode).json({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}

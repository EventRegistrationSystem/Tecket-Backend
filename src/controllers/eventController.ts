import { Request, Response, NextFunction } from 'express'; // Added NextFunction
import { EventService } from '../services/eventServices';
import { CreateEventDTO, EventFilters } from '../types/eventTypes';
import { ValidationError, NotFoundError, AuthorizationError, AuthenticationError } from '../utils/errors'; // Import more error types

export class EventController {

    /**
     * 01 - Create a new event
     * @param req 
     * @param res 
     */
    static async createEvent(req: Request<{}, {}, CreateEventDTO>, res: Response) {
        try {


            const requestingUser = req.user;

            if (!requestingUser || !requestingUser.userId || !requestingUser.role) {
                // If the user is not authenticated, return a 401 Unauthorized response
                res.status(401).json({
                    success: false,
                    message: 'Authentication required: User ID and role are missing.'
                });
                return;
            }

            const event = await EventService.createEvent(
                requestingUser.userId, // organiserId for the Event record
                req.body,              // eventData
                requestingUser.userId, // actorUserId - the user performing the action
                requestingUser.role    // actorUserRole - role of the user performing the action
            );

            res.status(201).json({
                success: true,
                data: event,
                message: 'Event created successfully'
            });
        }
        catch (error: any) {
            console.error("Error creating event: ", error);
            if (error instanceof AuthenticationError) {
                res.status(error.statusCode || 401).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(error.statusCode || 403).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) {
                res.status(error.statusCode || 400).json({ success: false, message: error.message });
            } else if (error instanceof NotFoundError) {
                res.status(error.statusCode || 404).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Internal server error creating event.',
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }

    /**
     * 02 - Get all events with filters and pagination
     * @param req 
     * @param res 
     * @returns 
     */
    static async getAllEvents(req: Request, res: Response): Promise<void> {
        try {

            // 1. Extract query parameters
            const page = req.query.page ? parseInt(req.query.page as string) : 1; // Page number
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 10; // Items per page

            //2. Build filters from query parameters
            const filters: EventFilters = {
                search: req.query.search as string,
                eventType: req.query.eventType as string,
                location: req.query.location as string,
                isFree: req.query.isFree === 'true' ? true :
                    req.query.isFree === 'false' ? false : undefined,
            };

            // 2.1 Add status from query if present, before role-specific logic potentially overrides it
            if (req.query.status) {
                filters.status = req.query.status as string;
            }

            //3. Handle date filters
            if (req.query.startDate) {
                filters.startDate = new Date(req.query.startDate as string);
            }

            if (req.query.endDate) {
                filters.endDate = new Date(req.query.endDate as string);
            }

            console.log('User role:', req.user?.role);
            console.log('Query params:', req.query);

            // Apply specific filtering based on user role
            if (req.user) {
                if (req.user.role === 'ADMIN') {
                    console.log('User is an admin');
                    filters.isAdmin = true;
                    // Admins can view all events, no additional filters needed
                }
                else if (req.user.role === 'ORGANIZER') {
                    console.log('User is an organizer');
                    filters.isOrganiser = true;
                    if (req.query.myEvents === 'true') { // For organizers viewing their own events
                        console.log('Organizer viewing own events');
                        filters.organiserId = req.user.userId;
                        filters.myEvents = true;

                        // Use specified status if provided
                        if (req.query.status) {
                            filters.status = req.query.status as string;
                        }
                    }
                }
                // PARTICIPANT role doesn't get special filtering
            }
            else {
                console.log('User is not authenticated, public access');
                filters.status = 'PUBLISHED';
            }

            console.log('Final filters:', filters);

            // Get events from service
            const result = await EventService.getAllEvents({ page, limit, filters });

            res.json({ success: true, data: result });
        }
        catch (error: any) {
            console.error('Error getting events:', error);
            if (error instanceof AuthenticationError) { // Added to handle errors from optionalAuthenticate
                res.status(error.statusCode || 401).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(error.statusCode || 403).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) { // e.g. if service throws validation on filter values
                res.status(error.statusCode || 400).json({ success: false, message: error.message });
            } else if (error instanceof NotFoundError) {
                res.status(error.statusCode || 404).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Internal server error retrieving events.', // Standardized message
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }

    /**
     * 03 - Get event by ID
     * @param req 
     * @param res 
     */
    static async getEventById(req: Request, res: Response): Promise<void> {
        try {
            const eventId = Number(req.params.id);
            const requestingUser = req.user; // Get the user object, which might be undefined

            // Validate event ID
            if (isNaN(eventId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid event ID'
                });
                return;
            }

            const event = await EventService.getEventWithDetails(eventId, requestingUser);

            res.status(200).json({
                success: true,
                data: event
            });
        }
        catch (error: any) { // Catch any error
            console.error('Error getting event:', error);
            if (error instanceof AuthenticationError) { // Added for completeness
                res.status(error.statusCode || 401).json({ success: false, message: error.message });
            } else if (error instanceof NotFoundError) {
                res.status(error.statusCode || 404).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(error.statusCode || 403).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) {
                res.status(error.statusCode || 400).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Internal server error retrieving event.', // Standardized message
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }

    /**
     * 04 - Update event
     * @param req 
     * @param res 
     * @returns 
     */
    static async updateEvent(req: Request, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const userId = req.user?.userId;
            const userRole = req.user?.role;

            if (isNaN(eventId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid event ID'
                });
                return; // Return early
            }

            if (!userId || !userRole) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            // Ownership check moved to service layer
            // Update event
            const event = await EventService.updateEvent(eventId, req.body, userId, userRole);

            res.status(200).json({
                success: true,
                data: event
            });
        }
        catch (error: any) { // Catch any error
            console.error('Error updating event:', error);
            if (error instanceof AuthenticationError) { // Added for completeness
                res.status(error.statusCode || 401).json({ success: false, message: error.message });
            } else if (error instanceof NotFoundError) {
                res.status(error.statusCode || 404).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(error.statusCode || 403).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) {
                res.status(error.statusCode || 400).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error updating event.', // Standardized message
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }

    /**
     * 05 - Update event status
     * @param req 
     * @param res 
     * @returns 
     */
    static async updateEventStatus(req: Request, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const status = req.body.status;
            const userId = req.user?.userId;
            const userRole = req.user?.role;

            if (isNaN(eventId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid event ID'
                });
                return; // Return early
            }

            if (!userId || !userRole) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            // Validate status
            if (!['DRAFT', 'PUBLISHED', 'CANCELLED'].includes(status)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be DRAFT, PUBLISHED, or CANCELLED'
                });
                return; // Return early
            }

            // Ownership check moved to service layer
            // Update event status
            const event = await EventService.updateEventStatus(eventId, status, userId, userRole);

            res.status(200).json({
                success: true,
                data: event
            });
        }
        catch (error: any) { // Catch any error
            console.error('Error updating event status:', error);
            if (error instanceof AuthenticationError) { // Added for completeness
                res.status(error.statusCode || 401).json({ success: false, message: error.message });
            } else if (error instanceof NotFoundError) {
                res.status(error.statusCode || 404).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(error.statusCode || 403).json({ success: false, message: error.message });
            } else if (error instanceof ValidationError) {
                res.status(error.statusCode || 400).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error updating event status.', // Standardized message
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }

    /**
     * 06 - Delete event
     * @param req 
     * @param res 
     * @returns 
     */
    static async deleteEvent(req: Request, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const userId = req.user?.userId;
            const userRole = req.user?.role;

            //Validate event ID
            if (isNaN(eventId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid event ID'
                });
                return; // Return early
            }

            if (!userId || !userRole) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            // Ownership check moved to service layer
            // Delete event
            await EventService.deleteEvent(eventId, userId, userRole);

            res.status(200).json({
                success: true,
                message: 'Event deleted successfully'
            });
        }
        catch (err: any) { // Catch any error
            console.error('Error deleting event:', err);
            if (err instanceof AuthenticationError) { // Added for completeness
                res.status(err.statusCode || 401).json({ success: false, message: err.message });
            } else if (err instanceof NotFoundError) {
                res.status(err.statusCode || 404).json({ success: false, message: err.message });
            } else if (err instanceof AuthorizationError) {
                res.status(err.statusCode || 403).json({ success: false, message: err.message });
            } else if (err instanceof ValidationError) {
                res.status(err.statusCode || 400).json({ success: false, message: err.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error deleting event.', // Standardized message
                    error: process.env.NODE_ENV === 'development' ? err.message : undefined
                });
            }
        }
    }

}

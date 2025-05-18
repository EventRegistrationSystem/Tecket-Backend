import { Router } from 'express';
import { TicketController } from '../controllers/ticketController';
import { authenticate, authorize, optionalAuthenticate } from '../middlewares/authMiddlewares';
import { validateRequest } from '../middlewares/authMiddlewares';
import { createTicketSchema, updateTicketSchema } from '../validation/ticketValidation';

const router = Router();

// Public routes (can be accessed without authentication)
/**
 * @openapi
 * tags:
 *   name: Tickets
 *   description: Ticket management endpoints
 */

/**
 * @openapi
 * /events/{eventId}/tickets:
 *   get:
 *     summary: Get all tickets for an event
 *     description: Retrieve tickets for a specific event
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     responses:
 *       200:
 *         description: List of tickets for the event
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TicketDetailResponse'
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.get('/events/:eventId/tickets', TicketController.getTicketsByEvent);

/**
 * @openapi
 * /events/{eventId}/tickets/{ticketId}:
 *   get:
 *     summary: Get a specific ticket for an event
 *     description: Retrieve details for a specific ticket type associated with an event.
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ticket ID
 *     responses:
 *       200:
 *         description: Ticket details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/TicketDetailResponse' # Assuming TicketDetailResponse exists
 *       404:
 *         description: Ticket or event not found
 *       500:
 *         description: Server error
 */
router.get('/events/:eventId/tickets/:ticketId', TicketController.getTicketById);

/**
 * @openapi
 * /events/{eventId}/tickets/{ticketId}/availability:
 *   get:
 *     summary: Check ticket availability
 *     description: Check if a specific ticket type for an event is currently available for purchase.
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ticket ID
 *     responses:
 *       200:
 *         description: Ticket availability status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     available:
 *                       type: boolean
 *                       example: true
 *                     availableQuantity:
 *                       type: integer
 *                       example: 35
 *                     reason:
 *                       type: string
 *                       nullable: true
 *                       example: "Sold out"
 *       404:
 *         description: Ticket or event not found
 *       500:
 *         description: Server error
 */
router.get('/events/:eventId/tickets/:ticketId/availability', TicketController.checkAvailability);

// Protected routes (require authentication)
/**
 * @openapi
 * /events/{eventId}/tickets:
 *   post:
 *     summary: Create a new ticket
 *     description: Create a new ticket type for an event
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTicketRequest'
 *     responses:
 *       201:
 *         description: Ticket created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/TicketDetailResponse'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not the event organizer
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.post('/events/:eventId/tickets',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'), 
    validateRequest(createTicketSchema),
    TicketController.createTicket
);

/**
 * @openapi
 * /events/{eventId}/tickets/{ticketId}:
 *   put:
 *     summary: Update a ticket
 *     description: Update an existing ticket's details
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ticket ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTicketRequest'
 *     responses:
 *       200:
 *         description: Ticket updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/TicketDetailResponse'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not the event organizer
 *       404:
 *         description: Ticket or event not found
 *       500:
 *         description: Server error
 */
router.put('/events/:eventId/tickets/:ticketId',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'), // Authorization check: Only organizers
    validateRequest(updateTicketSchema), 
    TicketController.updateTicket
);

/**
 * @openapi
 * /events/{eventId}/tickets/{ticketId}:
 *   delete:
 *     summary: Delete a ticket
 *     description: Delete a ticket (only if no tickets have been sold)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ticket ID
 *     responses:
 *       200:
 *         description: Ticket deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Ticket deleted successfully"
 *       400:
 *         description: Cannot delete a ticket with sales
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not the event organizer
 *       404:
 *         description: Ticket or event not found
 *       500:
 *         description: Server error
 */
router.delete('/events/:eventId/tickets/:ticketId',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'), // Authorization check: Only organizers
    TicketController.deleteTicket
);

export default router;

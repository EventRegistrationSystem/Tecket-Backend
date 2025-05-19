import { Router } from 'express';
import { EventController } from '../controllers/eventController';
import { RegistrationController } from '../controllers/registrationController'; // Import RegistrationController
import { authorize, authenticate, validateRequest, optionalAuthenticate } from '../middlewares/authMiddlewares';
import { createEventSchema } from '../validation/eventValidation';
import eventQuestionRoutes from './eventQuestionRoutes'; // Import the sub-router

const router = Router();

/**
 * @openapi
 * tags:
 *   name: Events
 *   description: Event management endpoints
 */

// Public routes
/**
 * @openapi
 * /events:
 *   get:
 *     summary: Get all events
 *     description: Retrieve a list of events with pagination and filtering options
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for event name or description
 *       - in: query
 *         name: eventType
 *         schema:
 *           $ref: '#/components/schemas/EventType'
 *         description: Filter by event type
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location
 *       - in: query
 *         name: isFree
 *         schema:
 *           type: boolean
 *         description: Filter by free/paid status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter events starting after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter events ending before this date
 *       - in: query
 *         name: myEvents
 *         schema:
 *           type: boolean
 *         description: For organizers, show only their events
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/EventStatus'
 *         description: Filter by event status (only for organizers viewing their events)
 *     responses:
 *       200:
 *         description: A list of events
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
 *                     events:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Event'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get('/', optionalAuthenticate, EventController.getAllEvents);

/**
 * @openapi
 * /events/{id}:
 *   get:
 *     summary: Get event by ID
 *     description: Retrieve detailed information about a specific event
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Event'
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.get('/:id', optionalAuthenticate, EventController.getEventById);

// Protected routes 
/**
 * @openapi
 * /events:
 *   post:
 *     summary: Create a new event
 *     description: Create a new event with basic details, tickets, and questions
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEventRequest'
 *     responses:
 *       201:
 *         description: Event created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Event'
 *                 message:
 *                   type: string
 *                   example: "Event created successfully"
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'), 
    // validateRequest(createEventSchema),
    EventController.createEvent);

/**
 * @openapi
 * /events/{id}:
 *   put:
 *     summary: Update an event
 *     description: Update an existing event's details
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEventRequest'
 *     responses:
 *       200:
 *         description: Event updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Event'
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
router.put('/:id',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'),
    EventController.updateEvent);

/**
* @openapi
* /events/{id}/status:
*   patch:
*     summary: Update event status
*     description: Update an event's status (draft, published, cancelled)
*     tags: [Events]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: integer
*         description: Event ID
*     requestBody:
*       required: true
*       content:
*         application/json:
*           schema:
*             type: object
*             properties:
*               status:
*                 type: string
*                 enum: [DRAFT, PUBLISHED, CANCELLED]
*                 example: "PUBLISHED"
*             required:
*               - status
*     responses:
*       200:
*         description: Event status updated successfully
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 success:
*                   type: boolean
*                   example: true
*                 data:
*                   $ref: '#/components/schemas/Event'
*       400:
*         description: Invalid status value
*       401:
*         description: Unauthorized
*       403:
*         description: Forbidden - not the event organizer
*       404:
*         description: Event not found
*       500:
*         description: Server error
*/
router.patch('/:id/status',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'),
    EventController.updateEventStatus
);

/**
 * @openapi
 * /events/{id}:
 *   delete:
 *     summary: Delete an event
 *     description: Delete an event (only if it has no registrations)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event deleted successfully
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
 *                   example: "Event deleted successfully"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not the event organizer
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.delete('/:id',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'),
    EventController.deleteEvent);

// Route to get registrations for a specific event
/**
 * @openapi
 * /events/{eventId}/registrations:
 *   get:
 *     summary: Get registrations for a specific event
 *     description: Retrieve a list of registration summaries for a specific event. Requires Admin or Event Organizer role.
 *     tags: [Events, Registrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the event
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for primary registrant name/email or attendee names/email
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/RegistrationStatus' # Assuming RegistrationStatus schema is defined
 *         description: Filter by registration status (CONFIRMED, PENDING, CANCELLED)
 *       - in: query
 *         name: ticketId
 *         schema:
 *           type: integer
 *         description: Filter by registrations containing a specific ticket type
 *     responses:
 *       200:
 *         description: A list of registration summaries for the event
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Define structure for registration summary
 *                     properties:
 *                       registrationId:
 *                         type: integer
 *                       registrationDate:
 *                         type: string
 *                         format: date-time
 *                       primaryParticipantName:
 *                         type: string
 *                       primaryParticipantEmail:
 *                         type: string
 *                       numberOfAttendees:
 *                         type: integer
 *                       registrationStatus:
 *                         $ref: '#/components/schemas/RegistrationStatus'
 *                       totalAmountPaid:
 *                         type: number
 *                         nullable: true
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Invalid input parameters
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - User does not have permission
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.get('/:eventId/registrations',
    authenticate, // Ensures req.user is populated for service layer authorization
    RegistrationController.getRegistrationsForEvent
);

// Mount event question routes nested under /events/:eventId/questions
router.use('/:eventId/questions', eventQuestionRoutes);

export default router;

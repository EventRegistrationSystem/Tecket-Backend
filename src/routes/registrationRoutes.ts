import { Router } from 'express';
import { RegistrationController } from '../controllers/registrationController';
import { authenticate, optionalAuthenticate, validateRequest, authorize } from '../middlewares/authMiddlewares'; // Added authorize
import { registrationValidationSchema, getRegistrationParamsSchema, updateRegistrationStatusSchema } from '../validation/registrationValidation';
import { UserRole } from '@prisma/client';

const router = Router();

/**
 * @openapi
 * tags:
 *   name: Registrations
 *   description: Event registration management endpoints
 */

/**
 * @openapi
 * /registrations:
 *   post:
 *     summary: Create Registration
 *     description: Register a participant for an event.
 *     tags: [Registrations]
 *     requestBody:
 *       required: true
 *       description: Registration details.
 *       content:
 *         application/json:
 *           schema:
 *             # Fully detailed inline schema for RegistrationDto request
 *             type: object
 *             required: [eventId, participant, responses]
 *             properties:
 *               eventId:
 *                 type: integer
 *                 description: ID of the event.
 *                 example: 1
 *               participant:
 *                 type: object
 *                 required: [email, firstName, lastName]
 *                 properties:
 *                   email: { type: string, format: email, example: "test@example.com" }
 *                   firstName: { type: string, example: "John" }
 *                   lastName: { type: string, example: "Doe" }
 *                   phoneNumber: { type: string, nullable: true, example: "0412345678" }
 *                   dateOfBirth: { type: string, format: date-time, nullable: true, example: "1990-01-15T00:00:00.000Z" }
 *                   address: { type: string, nullable: true, example: "123 Main St" }
 *                   city: { type: string, nullable: true, example: "Anytown" }
 *                   state: { type: string, nullable: true, example: "NSW" }
 *                   zipCode: { type: string, nullable: true, example: "2000" }
 *                   country: { type: string, nullable: true, example: "Australia" }
 *               ticketId:
 *                 type: integer
 *                 description: Required for paid events.
 *                 nullable: true
 *                 example: 5
 *               quantity:
 *                 type: integer
 *                 description: Required for paid events.
 *                 minimum: 1
 *                 nullable: true
 *                 example: 1
 *               responses:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [questionId, responseText]
 *                   properties:
 *                     questionId: { type: integer, example: 101 }
 *                     responseText: { type: string, example: "Vegetarian" }
 *               userId:
 *                 type: integer
 *                 description: Optional ID of logged-in user.
 *                 nullable: true
 *                 example: 12
 *     responses:
 *       '201': # Use quotes for numeric status codes
 *         description: Registration created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Registration successful"
 *                 data:
 *                   # Fully detailed inline Registration response
 *                   type: object
 *                   properties:
 *                     id: { type: integer, example: 150 }
 *                     eventId: { type: integer, example: 1 }
 *                     participantId: { type: integer, example: 75 }
 *                     userId: { type: integer, nullable: true, example: 12 }
 *                     status: { type: string, enum: [PENDING, CONFIRMED, CANCELLED], example: "CONFIRMED" }
 *                     created_at: { type: string, format: date-time }
 *                     updated_at: { type: string, format: date-time }
 *                     participant: { $ref: '#/components/schemas/Participant' } # Ref for brevity
 *                     event: { $ref: '#/components/schemas/EventSummary' } # Ref for brevity (assuming summary schema)
 *                     purchase: { $ref: '#/components/schemas/Purchase', nullable: true } # Ref for brevity
 *                     responses:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ResponseDetail' } # Ref for brevity
 *       '400':
 *         description: Bad Request (Validation, Event Full, Ticket Unavailable, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Validation failed: Event ID is required" }
 *                 error: { type: string, nullable: true, example: "Bad Request" }
 *       '404':
 *         description: Not Found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Event not found" }
 *                 error: { type: string, nullable: true, example: "Not Found" }
 *       '500':
 *         description: Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "An unexpected error occurred" }
 *                 error: { type: string, nullable: true, example: "Internal Server Error" }
 */
router.post(
    '/',
    optionalAuthenticate, // Optional authentication for guest registrations
    validateRequest(registrationValidationSchema),
    RegistrationController.createRegistration
);

/**
 * @openapi
 * /registrations:
 *   get:
 *     summary: List Registrations
 *     description: Get registrations with filtering, pagination, and authorization.
 *     tags: [Registrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: eventId
 *         schema: { type: integer }
 *         required: false
 *         description: Filter by event ID (Organizer/Admin).
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *         required: false
 *         description: Filter by user ID (Owner/Admin).
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         required: false
 *         description: Page number.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         required: false
 *         description: Items per page.
 *     responses:
 *       '200':
 *         description: List of registrations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Registrations retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     # Fully detailed inline Registration structure for list items
 *                     type: object
 *                     properties:
 *                       id: { type: integer, example: 150 }
 *                       eventId: { type: integer, example: 1 }
 *                       participantId: { type: integer, example: 75 }
 *                       userId: { type: integer, nullable: true, example: 12 }
 *                       status: { type: string, enum: [PENDING, CONFIRMED, CANCELLED], example: "CONFIRMED" }
 *                       created_at: { type: string, format: date-time }
 *                       updated_at: { type: string, format: date-time }
 *                       participant: { $ref: '#/components/schemas/ParticipantSummary' } # Ref summary
 *                       event: { $ref: '#/components/schemas/EventSummary' } # Ref summary
 *                       purchase: { $ref: '#/components/schemas/PurchaseSummary', nullable: true } # Ref summary
 *                 pagination:
 *                   # Fully detailed inline Pagination structure
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 10 }
 *                     totalCount: { type: integer, example: 53 }
 *                     totalPages: { type: integer, example: 6 }
 *       '400':
 *         description: Bad Request (Invalid Query Params)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Invalid query parameters: page must be an integer" }
 *                 error: { type: string, nullable: true, example: "Bad Request" }
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Authentication required" }
 *                 error: { type: string, nullable: true, example: "Unauthorized" }
 *       '403':
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Forbidden: You do not have permission to view these registrations." }
 *                 error: { type: string, nullable: true, example: "Forbidden" }
 *       '500':
 *         description: Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "An unexpected error occurred" }
 *                 error: { type: string, nullable: true, example: "Internal Server Error" }
 */
router.get(
    '/',
    authenticate,
    RegistrationController.getRegistrations
);

/**
 * @openapi
 * /registrations/{registrationId}:
 *   get:
 *     summary: Get Registration by ID
 *     description: Get details for one registration with authorization.
 *     tags: [Registrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: registrationId
 *         required: true
 *         schema: { type: integer }
 *         description: ID of the registration.
 *     responses:
 *       '200':
 *         description: Registration details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Registration retrieved successfully"
 *                 data:
 *                   # Fully detailed inline Registration response
 *                   type: object
 *                   properties:
 *                     id: { type: integer, example: 150 }
 *                     eventId: { type: integer, example: 1 }
 *                     participantId: { type: integer, example: 75 }
 *                     userId: { type: integer, nullable: true, example: 12 }
 *                     status: { type: string, enum: [PENDING, CONFIRMED, CANCELLED], example: "CONFIRMED" }
 *                     created_at: { type: string, format: date-time }
 *                     updated_at: { type: string, format: date-time }
 *                     participant: { $ref: '#/components/schemas/Participant' } # Ref for brevity
 *                     event: { $ref: '#/components/schemas/EventSummary' } # Ref for brevity
 *                     purchase: { $ref: '#/components/schemas/Purchase', nullable: true } # Ref for brevity
 *                     responses:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ResponseDetail' } # Ref for brevity
 *       '400':
 *         description: Bad Request (Invalid ID)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Invalid registration ID: registrationId must be a positive number" }
 *                 error: { type: string, nullable: true, example: "Bad Request" }
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Authentication required" }
 *                 error: { type: string, nullable: true, example: "Unauthorized" }
 *       '403':
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Forbidden: You do not have permission to view this registration." }
 *                 error: { type: string, nullable: true, example: "Forbidden" }
 *       '404':
 *         description: Not Found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Registration not found" }
 *                 error: { type: string, nullable: true, example: "Not Found" }
 *       '500':
 *         description: Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "An unexpected error occurred" }
 *                 error: { type: string, nullable: true, example: "Internal Server Error" }
 */
router.get(
    '/:registrationId',
    authenticate,
    RegistrationController.getRegistrationById
);

/**
 * @openapi
 * /registrations/{registrationId}:
 *   patch:
 *     summary: Cancel Registration
 *     description: Mark a registration as cancelled. Requires authentication. Allowed for the user who owns the registration or an admin.
 *     tags: [Registrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: registrationId
 *         required: true
 *         schema: { type: integer }
 *         description: ID of the registration to cancel.
 *     requestBody:
 *       required: true
 *       description: Specify the status update.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [CANCELLED] # Only allow cancelling via this endpoint
 *                 example: CANCELLED
 *     responses:
 *       '200':
 *         description: Registration cancelled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Registration cancelled successfully"
 *                 data:
 *                   # Include the updated registration details
 *                   $ref: '#/components/schemas/Registration' # Assuming a full Registration schema exists
 *       '400':
 *         description: Bad Request (Invalid ID, Invalid Status)
 *       '401':
 *         description: Unauthorized (Not logged in)
 *       '403':
 *         description: Forbidden (User does not own registration and is not admin)
 *       '404':
 *         description: Not Found (Registration not found)
 *       '409': # Conflict status code
 *         description: Conflict (e.g., Registration already cancelled)
 *       '500':
 *         description: Server Error
 */
router.patch(
    '/:registrationId',
    authenticate, // Ensure user is logged in
    RegistrationController.cancelRegistration // Add the new controller method
);

/**
 * @openapi
 * /registrations/{registrationId}/status:
 *   patch:
 *     summary: Update Registration Status
 *     description: Update the status of a specific registration. Requires ADMIN or ORGANIZER role (organizer must own the event).
 *     tags: [Registrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: registrationId
 *         required: true
 *         schema: { type: integer }
 *         description: ID of the registration to update.
 *     requestBody:
 *       required: true
 *       description: New status for the registration.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRegistrationStatusDto'
 *     responses:
 *       '200':
 *         description: Registration status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Registration status updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/RegistrationDetailed' # Assuming a detailed Registration schema
 *       '400':
 *         description: Bad Request (Invalid ID, Invalid Status, Invalid Transition)
 *       '401':
 *         description: Unauthorized (Not logged in)
 *       '403':
 *         description: Forbidden (User not Admin or authorized Organizer)
 *       '404':
 *         description: Not Found (Registration not found)
 *       '500':
 *         description: Server Error
 */
router.patch(
    '/:registrationId/status',
    authenticate,
    authorize("ADMIN", "ORGANIZER"), // Removed extra comma
    validateRequest(updateRegistrationStatusSchema), // Validate only req.body
    RegistrationController.updateRegistrationStatus
);

/**
 * @openapi
 * /registrations/admin/all-system-summary:
 *   get:
 *     summary: (Admin) Get all registrations system-wide
 *     description: Retrieve a paginated list of all registration summaries across all events. Requires ADMIN role.
 *     tags: [Registrations, Admin]
 *     security:
 *       - bearerAuth: []
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
 *         description: Search term for primary registrant name/email or attendee names/email
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/RegistrationStatus' 
 *         description: Filter by registration status (CONFIRMED, PENDING, CANCELLED)
 *       - in: query
 *         name: ticketId
 *         schema:
 *           type: integer
 *         description: Filter by registrations containing a specific ticket type
 *       - in: query
 *         name: eventId
 *         schema:
 *           type: integer
 *         description: Filter by a specific event ID
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: Filter by registrations made by a specific user ID
 *       - in: query
 *         name: participantId
 *         schema:
 *           type: integer
 *         description: Filter by registrations involving a specific primary participant ID
 *     responses:
 *       200:
 *         description: A list of all registration summaries
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
 *                     type: object 
 *                     properties:
 *                       registrationId:
 *                         type: integer
 *                       registrationDate:
 *                         type: string
 *                         format: date-time
 *                       eventName:
 *                         type: string
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
 *         description: Forbidden - User does not have ADMIN role
 *       500:
 *         description: Server error
 */
router.get(
    '/admin/all-system-summary',
    authenticate,
    authorize('ADMIN'),
    RegistrationController.getAdminAllRegistrations
);

export default router;

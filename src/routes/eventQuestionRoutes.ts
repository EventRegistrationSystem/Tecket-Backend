import { Router } from 'express';
import { EventQuestionController } from '../controllers/eventQuestionController';
import { authenticate, authorize, validateRequest, optionalAuthenticate } from '../middlewares/authMiddlewares';
import { addEventQuestionLinkSchema, updateEventQuestionLinkSchema } from '../validation/eventQuestionValidation';

const router = Router({ mergeParams: true }); // mergeParams is important for accessing :eventId from parent router

/**
 * @openapi
 * tags:
 *   name: Event Questions
 *   description: Management of questions linked to specific events
 */

/**
 * @openapi
 * /events/{eventId}/questions:
 *   get:
 *     summary: List questions for an event
 *     tags: [Event Questions]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the event
 *     responses:
 *       200:
 *         description: A list of questions linked to the event.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EventQuestionWithDetails' # Define this schema
 *       404:
 *         description: Event not found.
 */
router.get(
    '/',
    // optionalAuthenticate, // Or authenticate if only organizers/admins should list them this way
    EventQuestionController.getEventQuestions
);

/**
 * @openapi
 * /events/{eventId}/questions:
 *   post:
 *     summary: Add a question to an event
 *     tags: [Event Questions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the event
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddEventQuestionLinkDTO' # Define this DTO schema
 *     responses:
 *       201:
 *         description: Question successfully linked to the event.
 *       400:
 *         description: Invalid input data.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (not event organizer).
 *       404:
 *         description: Event or global question not found.
 */
router.post(
    '/',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'),
    // validateRequest(addEventQuestionLinkSchema),
    EventQuestionController.addQuestionToEvent
);

/**
 * @openapi
 * /events/{eventId}/questions/{eventQuestionId}:
 *   put:
 *     summary: Update a linked question's properties for an event
 *     tags: [Event Questions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the event
 *       - in: path
 *         name: eventQuestionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the event-question link
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateEventQuestionLinkDTO' # Define this DTO schema
 *     responses:
 *       200:
 *         description: Event question link updated successfully.
 *       400:
 *         description: Invalid input data.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Event or event question link not found.
 */
router.put(
    '/:eventQuestionId',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'),
    // validateRequest(updateEventQuestionLinkSchema),
    EventQuestionController.updateEventQuestionLink
);

/**
 * @openapi
 * /events/{eventId}/questions/{eventQuestionId}:
 *   delete:
 *     summary: Remove a question from an event
 *     tags: [Event Questions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the event
 *       - in: path
 *         name: eventQuestionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the event-question link
 *     responses:
 *       200:
 *         description: Event question link deleted successfully.
 *       400:
 *         description: Cannot delete question with existing responses.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Event or event question link not found.
 */
router.delete(
    '/:eventQuestionId',
    authenticate,
    authorize('ORGANIZER', 'ADMIN'),
    EventQuestionController.deleteEventQuestionLink
);

export default router;

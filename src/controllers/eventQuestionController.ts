import { Request, Response } from 'express';
import { EventQuestionService } from '../services/eventQuestionService';
import { AddEventQuestionLinkDTO, UpdateEventQuestionLinkDTO } from '../types/questionTypes';
import { AuthorizationError, NotFoundError, ValidationError } from '../utils/errors';

export class EventQuestionController {

    /**
     * Get all questions linked to a specific event.
     * Route: GET /events/:eventId/questions
     */
    static async getEventQuestions(req: Request, res: Response): Promise<void> {
        try {
            const eventId = parseInt(req.params.eventId);
            if (isNaN(eventId)) {
                res.status(400).json({ success: false, message: 'Invalid event ID.' });
                return;
            }

            const eventQuestions = await EventQuestionService.getEventQuestions(eventId);
            res.status(200).json({ success: true, data: eventQuestions });
        } catch (error) {
            console.error('Error in EventQuestionController.getEventQuestions:', error);
            if (error instanceof NotFoundError) {
                res.status(404).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error while retrieving event questions.' });
            }
        }
    }

    /**
     * Add/link a question to an event.
     * Route: POST /events/:eventId/questions
     */
    static async addQuestionToEvent(req: Request, res: Response): Promise<void> {
        try {
            const eventId = parseInt(req.params.eventId);
            const userId = req.user?.userId;

            if (isNaN(eventId)) {
                res.status(400).json({ success: false, message: 'Invalid event ID.' });
                return;
            }
            if (!userId) {
                res.status(401).json({ success: false, message: 'Authentication required.' });
                return;
            }

            const dto: AddEventQuestionLinkDTO = req.body;
            const newEventQuestion = await EventQuestionService.addQuestionToEvent(userId, eventId, dto);
            res.status(201).json({ success: true, data: newEventQuestion, message: 'Question linked to event successfully.' });
        } catch (error) {
            console.error('Error in EventQuestionController.addQuestionToEvent:', error);
            if (error instanceof ValidationError) {
                res.status(400).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(403).json({ success: false, message: error.message });
            } else if (error instanceof NotFoundError) {
                res.status(404).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error while adding question to event.' });
            }
        }
    }

    /**
     * Update an EventQuestions link.
     * Route: PUT /events/:eventId/questions/:eventQuestionId
     */
    static async updateEventQuestionLink(req: Request, res: Response): Promise<void> {
        try {
            const eventId = parseInt(req.params.eventId);
            const eventQuestionId = parseInt(req.params.eventQuestionId);
            const userId = req.user?.userId;

            if (isNaN(eventId) || isNaN(eventQuestionId)) {
                res.status(400).json({ success: false, message: 'Invalid event ID or event question ID.' });
                return;
            }
            if (!userId) {
                res.status(401).json({ success: false, message: 'Authentication required.' });
                return;
            }

            const dto: UpdateEventQuestionLinkDTO = req.body;
            const updatedLink = await EventQuestionService.updateEventQuestionLink(userId, eventId, eventQuestionId, dto);
            res.status(200).json({ success: true, data: updatedLink, message: 'Event question link updated successfully.' });
        } catch (error) {
            console.error('Error in EventQuestionController.updateEventQuestionLink:', error);
            if (error instanceof ValidationError) {
                res.status(400).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(403).json({ success: false, message: error.message });
            } else if (error instanceof NotFoundError) {
                res.status(404).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error while updating event question link.' });
            }
        }
    }

    /**
     * Delete/unlink a question from an event.
     * Route: DELETE /events/:eventId/questions/:eventQuestionId
     */
    static async deleteEventQuestionLink(req: Request, res: Response): Promise<void> {
        try {
            const eventId = parseInt(req.params.eventId);
            const eventQuestionId = parseInt(req.params.eventQuestionId);
            const userId = req.user?.userId;

            if (isNaN(eventId) || isNaN(eventQuestionId)) {
                res.status(400).json({ success: false, message: 'Invalid event ID or event question ID.' });
                return;
            }
            if (!userId) {
                res.status(401).json({ success: false, message: 'Authentication required.' });
                return;
            }

            await EventQuestionService.deleteEventQuestionLink(userId, eventId, eventQuestionId);
            res.status(200).json({ success: true, message: 'Event question link deleted successfully.' });
        } catch (error) {
            console.error('Error in EventQuestionController.deleteEventQuestionLink:', error);
            if (error instanceof ValidationError) { // e.g., cannot delete if responses exist
                res.status(400).json({ success: false, message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(403).json({ success: false, message: error.message });
            } else if (error instanceof NotFoundError) {
                res.status(404).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error while deleting event question link.' });
            }
        }
    }
}

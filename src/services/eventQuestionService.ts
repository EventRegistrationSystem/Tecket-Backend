import { prisma } from '../config/prisma';
import { AddEventQuestionLinkDTO, UpdateEventQuestionLinkDTO, EventQuestionWithQuestionDetails } from '../types/questionTypes';
import { AuthorizationError, ValidationError, NotFoundError } from '../utils/errors';
import { UserRole, Prisma } from '@prisma/client'; // Import UserRole and Prisma

// Define a type for the Prisma transaction client
type PrismaTransactionClient = Omit<Prisma.TransactionClient, "$commit" | "$rollback">;

export class EventQuestionService {

    /**
     * Verify if the user is the organizer of the event OR an ADMIN.
     * @param userId - The ID of the user attempting the action.
     * @param userRole - The role of the user.
     * @param eventId - The ID of the event.
     * @param tx Optional Prisma transaction client
     */
    private static async verifyAdminOrEventOrganizer(userId: number, userRole: UserRole, eventId: number, tx?: PrismaTransactionClient): Promise<void> {
        const prismaClient = tx || prisma;
        if (userRole === UserRole.ADMIN) {
            const eventExists = await prismaClient.event.count({ where: { id: eventId } });
            if (eventExists === 0) {
                throw new NotFoundError('Event not found');
            }
            return; 
        }

        const event = await prismaClient.event.findUnique({
            where: { id: eventId },
            select: { organiserId: true }
        });
        if (!event) {
            throw new NotFoundError('Event not found');
        }
        if (event.organiserId !== userId) {
            throw new AuthorizationError('You are not authorized to manage questions for this event.');
        }
    }

    /**
     * Get all questions linked to a specific event.
     * @param eventId - The ID of the event.
     */
    static async getEventQuestions(eventId: number, tx?: PrismaTransactionClient): Promise<EventQuestionWithQuestionDetails[]> {
        const prismaClient = tx || prisma;
        const eventExists = await prismaClient.event.count({ where: { id: eventId } });
        if (eventExists === 0) {
            throw new NotFoundError('Event not found');
        }

        return prismaClient.eventQuestions.findMany({
            where: { eventId },
            include: {
                question: true, // Include the details of the linked global Question
                _count: {
                    select: { responses: true }
                }
            },
            orderBy: {
                displayOrder: 'asc'
            }
        }) as Promise<EventQuestionWithQuestionDetails[]>; // Type assertion
    }

    /**
     * Add/link a question to an event.
     * @param userId - The ID of the user performing the action.
     * @param userRole - The role of the user.
     * @param eventId - The ID of the event.
     * @param data - DTO containing question details and link properties.
     * @param tx Optional Prisma transaction client
     */
    static async addQuestionToEvent(userId: number, userRole: UserRole, eventId: number, data: AddEventQuestionLinkDTO, tx?: PrismaTransactionClient) {
        const prismaClient = tx || prisma;
        await this.verifyAdminOrEventOrganizer(userId, userRole, eventId, prismaClient);

        let questionId: number;

        if (data.questionId) {
            const globalQuestionExists = await prismaClient.question.count({ where: { id: data.questionId } });
            if (globalQuestionExists === 0) {
                throw new NotFoundError(`Global question with ID ${data.questionId} not found.`);
            }
            questionId = data.questionId;
        } else if (data.questionText) {
            const existingGlobalQuestion = await prismaClient.question.findFirst({
                where: { questionText: data.questionText }
            });
            if (existingGlobalQuestion) {
                questionId = existingGlobalQuestion.id;
            } else {
                const newGlobalQuestion = await prismaClient.question.create({
                    data: {
                        questionText: data.questionText,
                        questionType: data.questionType || 'TEXT',
                        category: data.category,
                        validationRules: data.validationRules || undefined,
                    }
                });
                questionId = newGlobalQuestion.id;
            }
        } else {
            throw new ValidationError('Either questionId or questionText must be provided.');
        }

        // Check if this global question is already linked to this event
        const existingLink = await prismaClient.eventQuestions.findFirst({
            where: { eventId, questionId }
        });
        if (existingLink) {
            throw new ValidationError('This question is already linked to the event.');
        }

        return prismaClient.eventQuestions.create({
            data: {
                eventId,
                questionId,
                isRequired: data.isRequired,
                displayOrder: data.displayOrder
            },
            include: { question: true }
        });
    }

    /**
     * Update an EventQuestions link (e.g., isRequired, displayOrder).
     * @param userId - The ID of the user performing the action.
     * @param eventId - The ID of the event (for authorization context).
     * @param eventQuestionId - The ID of the EventQuestions link record.
     * @param userId - The ID of the user performing the action.
     * @param userRole - The role of the user.
     * @param eventId - The ID of the event (for authorization context).
     * @param eventQuestionId - The ID of the EventQuestions link record.
     * @param data - DTO containing properties to update.
     * @param tx Optional Prisma transaction client
     */
    static async updateEventQuestionLink(userId: number, userRole: UserRole, eventId: number, eventQuestionId: number, data: UpdateEventQuestionLinkDTO, tx?: PrismaTransactionClient) {
        const prismaClient = tx || prisma;
        await this.verifyAdminOrEventOrganizer(userId, userRole, eventId, prismaClient);

        const existingLink = await prismaClient.eventQuestions.findUnique({
            where: { id: eventQuestionId }
        });

        if (!existingLink) {
            throw new NotFoundError('Event question link not found.');
        }
        if (existingLink.eventId !== eventId) {
            throw new AuthorizationError('This question link does not belong to the specified event.');
        }

        if (data.isRequired === undefined && data.displayOrder === undefined) {
            throw new ValidationError('No update data provided for isRequired or displayOrder.');
        }

        return prismaClient.eventQuestions.update({
            where: { id: eventQuestionId },
            data: {
                isRequired: data.isRequired,
                displayOrder: data.displayOrder
            },
            include: { question: true }
        });
    }

    /**
     * Delete/unlink a question from an event.
     * @param userId - The ID of the user performing the action.
     * @param userId - The ID of the user performing the action.
     * @param userRole - The role of the user.
     * @param eventId - The ID of the event (for authorization context).
     * @param eventQuestionId - The ID of the EventQuestions link record.
     * @param tx Optional Prisma transaction client
     */
    static async deleteEventQuestionLink(userId: number, userRole: UserRole, eventId: number, eventQuestionId: number, tx?: PrismaTransactionClient): Promise<void> {
        const prismaClient = tx || prisma;
        await this.verifyAdminOrEventOrganizer(userId, userRole, eventId, prismaClient);

        const existingLink = await prismaClient.eventQuestions.findUnique({
            where: { id: eventQuestionId },
            include: { _count: { select: { responses: true } } }
        });

        if (!existingLink) {
            throw new NotFoundError('Event question link not found.');
        }
        if (existingLink.eventId !== eventId) {
            throw new AuthorizationError('This question link does not belong to the specified event.');
        }

        if (existingLink._count.responses > 0) {
            throw new ValidationError('Cannot remove a question that has already received responses. Consider making it not required or changing its display order.');
        }

        await prismaClient.eventQuestions.delete({
            where: { id: eventQuestionId }
        });
    }
}

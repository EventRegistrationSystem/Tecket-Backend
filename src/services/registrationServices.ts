import { Registration, UserRole, Prisma, RegistrationStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { RegistrationDto } from '../types/registrationTypes'; // Removed RegistrationQueryFilters import
import { ParticipantService } from './participantServices';
// Ensure all necessary error types are imported
import { AppError, ValidationError, AuthorizationError, NotFoundError } from '../utils/errors';
import { JwtPayload } from '../types/authTypes';

// Define type for query parameters validated by Joi (used internally)
interface GetRegistrationsQuery {
    eventId?: number;
    userId?: number;
    page: number;
    limit: number;
}

export class RegistrationService {
    /**
     * 01 - Register a participant for an event
     */
    static async registerForEvent(registrationData: RegistrationDto) {
        const event = await prisma.event.findUnique({
            where: { id: registrationData.eventId },
            include: {
                tickets: true,
                eventQuestions: { include: { question: true } }
            }
        });

        if (!event) {
            throw new NotFoundError('Event not found'); // Use NotFoundError
        }

        if (event.status !== 'PUBLISHED') {
             throw new ValidationError('Event is not currently open for registration.');
        }

        const totalRegistrations = await prisma.registration.count({
            where: {
                eventId: registrationData.eventId,
                status: { in: [RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING] }
            }
        });

        if (totalRegistrations >= event.capacity) {
            throw new ValidationError('Event is full');
        }

        let ticketForPurchase = null;
        if (!event.isFree) {
            if (!registrationData.ticketId || !registrationData.quantity)
                throw new ValidationError('Ticket ID and quantity are required for paid events');

            ticketForPurchase = event.tickets.find(ticket => ticket.id === registrationData.ticketId);
            if (!ticketForPurchase) {
                throw new NotFoundError('Ticket not found'); // Use NotFoundError
            }
            const now = new Date();
            if (ticketForPurchase.status !== 'ACTIVE') {
                 throw new ValidationError('Selected ticket is not active.');
            }
            if (ticketForPurchase.salesStart && now < new Date(ticketForPurchase.salesStart)) {
                 throw new ValidationError('Selected ticket sales have not started yet.');
            }
            if (ticketForPurchase.salesEnd && now > new Date(ticketForPurchase.salesEnd)) {
                 throw new ValidationError('Selected ticket sales have ended.');
            }
            if (ticketForPurchase.quantitySold + registrationData.quantity > ticketForPurchase.quantityTotal) {
                throw new ValidationError('Selected ticket quantity not available');
            }
        }

        const requiredQuestions = event.eventQuestions
            .filter(eq => eq.isRequired)
            .map(eq => eq.questionId);
        const providedQuestionIds = new Set(registrationData.responses.map(r => r.questionId));
        for (const reqId of requiredQuestions) {
            const eventQuestion = event.eventQuestions.find(eq => eq.questionId === reqId);
            if (!eventQuestion || !eventQuestion.question) continue;
            if (!providedQuestionIds.has(reqId)) {
                throw new ValidationError(`Response required for question: "${eventQuestion.question.questionText}"`);
            }
            const response = registrationData.responses.find(r => r.questionId === reqId);
            if (response && response.responseText.trim() === '') {
                throw new ValidationError(`Response cannot be empty for required question: "${eventQuestion.question.questionText}"`);
            }
        }
        const validQuestionIds = new Set(event.eventQuestions.map(eq => eq.questionId));
        for (const providedId of providedQuestionIds) {
            if (!validQuestionIds.has(providedId)) {
                throw new ValidationError(`Invalid question ID provided: ${providedId}`);
            }
        }

        return prisma.$transaction(async (tx) => {
            // Correct call to findOrCreateParticipant with 2 arguments
            const participant = await ParticipantService.findOrCreateParticipant(registrationData.participant, tx);

            const registration = await tx.registration.create({
                data: {
                    eventId: registrationData.eventId,
                    participantId: participant.id,
                    userId: participant.userId,
                    status: event.isFree ? RegistrationStatus.CONFIRMED : RegistrationStatus.PENDING
                }
            });

            if (!event.isFree && registrationData.ticketId && registrationData.quantity && ticketForPurchase) {
                 const currentTicketState = await tx.ticket.findUnique({ where: { id: registrationData.ticketId } });
                 if (!currentTicketState || currentTicketState.quantitySold + registrationData.quantity > currentTicketState.quantityTotal) {
                     throw new ValidationError('Ticket quantity became unavailable during registration.');
                 }
                await tx.purchase.create({
                    data: {
                        registrationId: registration.id,
                        ticketId: registrationData.ticketId,
                        quantity: registrationData.quantity,
                        unitPrice: ticketForPurchase.price,
                        totalPrice: ticketForPurchase.price.toNumber() * registrationData.quantity,
                    }
                });
                await tx.ticket.update({
                    where: { id: registrationData.ticketId },
                    data: { quantitySold: { increment: registrationData.quantity } }
                });
            }

            const responseCreates = registrationData.responses.map(response => {
                const eventQuestion = event.eventQuestions.find(eq => eq.questionId === response.questionId);
                if (!eventQuestion) {
                    throw new Error(`Consistency error: EventQuestion mapping not found for questionId: ${response.questionId}`);
                }
                return tx.response.create({
                    data: {
                        registrationId: registration.id,
                        eqId: eventQuestion.id,
                        responseText: response.responseText
                    }
                });
            });
            await Promise.all(responseCreates);

            return tx.registration.findUniqueOrThrow({
                where: { id: registration.id },
                include: {
                    participant: true,
                    event: { select: { id: true, name: true, isFree: true } },
                    purchase: { include: { ticket: true } },
                    responses: { include: { eventQuestion: { include: { question: true } } } }
                }
            });
        });
    }

    /**
     * Retrieves a paginated list of registrations based on filters and authorization.
     */
    static async getRegistrations(query: GetRegistrationsQuery, authUser: JwtPayload) {
        const { eventId, userId, page, limit } = query;
        const skip = (page - 1) * limit;
        const where: Prisma.RegistrationWhereInput = {};
        let isAuthorized = false;

        if (authUser.role === UserRole.ADMIN) {
            isAuthorized = true;
            if (eventId) where.eventId = eventId;
            if (userId) where.userId = userId;
        } else if (eventId) {
            const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organiserId: true } });
            if (event && event.organiserId === authUser.userId) {
                isAuthorized = true;
                where.eventId = eventId;
                if (userId) where.userId = userId;
            } else {
                where.eventId = eventId;
                where.userId = authUser.userId;
                isAuthorized = true;
            }
        } else if (userId) {
            if (userId === authUser.userId) {
                isAuthorized = true;
                where.userId = userId;
            } else {
                throw new AuthorizationError('Forbidden: You can only view your own registrations.');
            }
        } else {
            isAuthorized = true;
            where.userId = authUser.userId;
        }

        if (!isAuthorized) {
             throw new AuthorizationError('Forbidden: You do not have permission to view these registrations.');
        }

        const [registrations, totalCount] = await prisma.$transaction([
            prisma.registration.findMany({
                where, skip, take: limit, orderBy: { created_at: 'desc' },
                include: {
                    participant: { select: { id: true, firstName: true, lastName: true, email: true } },
                    event: { select: { id: true, name: true, organiserId: true } },
                    purchase: { include: { ticket: { select: { id: true, name: true } } } }
                }
            }),
            prisma.registration.count({ where })
        ]);

        return { registrations, totalCount };
    }

    /**
     * Retrieves a single registration by ID, performing authorization checks.
     */
    static async getRegistrationById(registrationId: number, authUser: JwtPayload) {
        const registration = await prisma.registration.findUnique({
            where: { id: registrationId },
            include: {
                participant: true, // Include full participant for potential userId check
                event: { select: { id: true, name: true, organiserId: true } },
                purchase: { include: { ticket: true } },
                responses: { include: { eventQuestion: { include: { question: true } } } }
            }
        });

        if (!registration) {
            throw new NotFoundError('Registration not found'); // Use NotFoundError
        }

        const isOwner = registration.userId === authUser.userId ||
                       (registration.participant?.userId !== null && registration.participant?.userId === authUser.userId);
        const isEventOrganizer = registration.event.organiserId === authUser.userId;
        const isAdmin = authUser.role === UserRole.ADMIN;

        if (!isOwner && !isEventOrganizer && !isAdmin) {
            throw new AuthorizationError('Forbidden: You do not have permission to view this registration.');
        }

        return registration;
    }

     /**
     * Cancels a registration by ID, performing authorization checks.
     * @param registrationId The ID of the registration to cancel.
     * @param requestingUser The authenticated user attempting the cancellation.
     */
    static async cancelRegistration(registrationId: number, requestingUser: JwtPayload) {
        const registration = await prisma.registration.findUnique({
            where: { id: registrationId },
            include: {
                event: { select: { id: true, isFree: true } },
                purchase: { include: { ticket: true } },
                participant: { select: { userId: true } }, // Include participant userId for ownership check
                user: { select: { id: true } } // Include registration's direct userId link as well
            }
        });

        if (!registration) {
            throw new NotFoundError('Registration not found'); // Use NotFoundError
        }

        const isAdmin = requestingUser.role === UserRole.ADMIN;
        // Check if the registration's linked user OR the participant's linked user matches
        const isOwner = registration.userId === requestingUser.userId ||
                       (registration.participant?.userId !== null && registration.participant?.userId === requestingUser.userId);

        if (!isAdmin && !isOwner) {
            throw new AuthorizationError('Forbidden: You do not have permission to cancel this registration.');
        }

        if (registration.status === RegistrationStatus.CANCELLED) {
             return registration; // Already cancelled, return current state
        }

        // Only allow cancellation if CONFIRMED or PENDING
        if (registration.status !== RegistrationStatus.CONFIRMED && registration.status !== RegistrationStatus.PENDING) {
             throw new ValidationError(`Cannot cancel registration with status: ${registration.status}`);
        }


        return prisma.$transaction(async (tx) => {
            const updatedRegistration = await tx.registration.update({
                where: { id: registrationId },
                data: { status: RegistrationStatus.CANCELLED },
                 include: { // Re-include necessary data for the response object
                    participant: true,
                    event: { select: { id: true, name: true, isFree: true } },
                    purchase: { include: { ticket: true } },
                    responses: { include: { eventQuestion: { include: { question: true } } } }
                }
            });

            // If it was a paid event and CONFIRMED/PENDING, decrement ticket quantitySold
            if (!registration.event.isFree && registration.purchase && registration.purchase.ticket) {
                // Check ticket exists before decrementing (safety)
                 const ticketExists = await tx.ticket.findUnique({ where: { id: registration.purchase.ticketId } });
                 if (ticketExists) {
                     await tx.ticket.update({
                         where: { id: registration.purchase.ticketId },
                         data: {
                             quantitySold: {
                                 decrement: registration.purchase.quantity
                             }
                         }
                     });
                 } else {
                      console.warn(`Ticket ID ${registration.purchase.ticketId} not found during cancellation for registration ${registrationId}. Quantity not decremented.`);
                 }
                 // TODO: Implement refund logic here in a future step
            }

            return updatedRegistration;
        });
    }
}

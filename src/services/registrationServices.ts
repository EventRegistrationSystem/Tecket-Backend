import { Registration, UserRole, Prisma, RegistrationStatus, Participant, Attendee, Response as PrismaResponse, Purchase, Ticket, Event, QuestionType } from '@prisma/client'; // Import necessary models, Added QuestionType
import { prisma } from '../config/prisma';
// DTO and types
import {
    CreateRegistrationDto,
    CreateRegistrationResponse,
    ParticipantInput,
    GetRegistrationsQuery,
    GetRegistrationsForEventQuery,
    GetAdminAllRegistrationsQuery,
    UpdateRegistrationStatusDto
} from '../types/registrationTypes';
import { ParticipantService } from './participantServices';
import { AppError, ValidationError, AuthorizationError, NotFoundError } from '../utils/errors';
import { JwtPayload } from '../types/authTypes';
import { Decimal } from '@prisma/client/runtime/library';
import crypto from 'crypto'; // For generating token
import bcrypt from 'bcrypt'; // For hashing token

// Define args for fetching full registration details, mirroring getRegistrationById's includes
const registrationFullDetailsArgs = Prisma.validator<Prisma.RegistrationDefaultArgs>()({
    include: {
        participant: true,
        event: {
            select: {
                id: true,
                name: true,
                startDateTime: true,
                organiserId: true,
                isFree: true
            }
        },
        attendees: {
            include: {
                participant: true,
                ticket: true, // include ticket relation
                responses: {
                    include: {
                        eventQuestion: {
                            include: {
                                question: { select: { id: true, questionText: true, questionType: true } }
                            }
                        }
                    }
                }
            }
        },
        purchase: {
            include: {
                items: {
                    select: {
                        id: true,
                        quantity: true,
                        unitPrice: true,
                        ticket: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                payment: true
            }
        }
    }
});
type DetailedRegistration = Prisma.RegistrationGetPayload<typeof registrationFullDetailsArgs>;

export class RegistrationService {
    /**
     * Creates a registration for an event, handling multiple participants and tickets.
     * @param dto - The registration data (eventId, tickets, participants).
     * @param userId - Optional ID of the authenticated user.
     * @returns The ID of the created registration.
     */
    static async createRegistration(dto: CreateRegistrationDto, userId?: number): Promise<CreateRegistrationResponse> {
        const { eventId, tickets, participants } = dto;

        // --- Pre-transaction Validations ---

        // 1. Basic Input Presence
        if (!eventId || !participants || participants.length === 0) {
            throw new ValidationError('Event ID and participant details are required.');
        }

        const eventData = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                tickets: (tickets && tickets.length > 0) ? { where: { id: { in: tickets.map(t => t.ticketId) } } } : undefined,
                eventQuestions: {
                    include: {
                        question: {
                            include: {
                                options: true // Ensure options are fetched for questions
                            }
                        }
                    }
                }
            }
        });

        if (!eventData) { throw new NotFoundError('Event not found'); }
        if (eventData.status !== 'PUBLISHED') {
            throw new ValidationError('Event is not currently open for registration.');
        }

        if (!eventData.isFree) {
            if (!tickets || tickets.length === 0) {
                throw new ValidationError('Tickets are required for paid events.');
            }
        } else {
            if (tickets && tickets.length > 0 && tickets.some(t => t.ticketId)) {
                throw new ValidationError('Cannot select specific tickets for a free event. The tickets array should be empty.');
            }
        }

        let totalTicketQuantity = 0;
        if (!eventData.isFree && tickets && tickets.length > 0) {
            totalTicketQuantity = tickets.reduce((sum, t) => sum + t.quantity, 0);
            if (totalTicketQuantity !== participants.length) {
                throw new ValidationError('Number of participants must match the total quantity of tickets for paid events.');
            }
        } else if (eventData.isFree) {
            totalTicketQuantity = participants.length;
        }

        const currentRegistrationsCount = await prisma.registration.count({
            where: {
                eventId: eventId,
                status: { in: [RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING] }
            }
        });
        if (currentRegistrationsCount + totalTicketQuantity > eventData.capacity) {
            throw new ValidationError(`Event capacity (${eventData.capacity}) exceeded. Only ${eventData.capacity - currentRegistrationsCount} spots remaining.`);
        }

        let overallTotalPrice = new Decimal(0);
        const ticketQuantities: { [key: number]: number } = {};

        if (!eventData.isFree && tickets && tickets.length > 0) {
            const now = new Date();
            for (const requestedTicket of tickets) {
                const dbTicket = eventData.tickets?.find(t => t.id === requestedTicket.ticketId);
                if (!dbTicket) {
                    throw new NotFoundError(`Ticket with ID ${requestedTicket.ticketId} not found for this event.`);
                }
                if (dbTicket.status !== 'ACTIVE') {
                    throw new ValidationError(`Ticket "${dbTicket.name}" is not active.`);
                }
                if (dbTicket.salesStart && now < new Date(dbTicket.salesStart)) {
                    throw new ValidationError(`Ticket "${dbTicket.name}" sales have not started yet.`);
                }
                if (dbTicket.salesEnd && now > new Date(dbTicket.salesEnd)) {
                    throw new ValidationError(`Ticket "${dbTicket.name}" sales have ended.`);
                }
                overallTotalPrice = overallTotalPrice.add(dbTicket.price.mul(requestedTicket.quantity));
                ticketQuantities[requestedTicket.ticketId] = requestedTicket.quantity;
            }
        } else {
            if (tickets && tickets.some(t => t.ticketId)) { // Ensure tickets array is not just empty but also doesn't contain ticketIds
                throw new ValidationError('Cannot select specific tickets for a free event.');
            }
            if (participants.length > 1 && (!tickets || tickets.length === 0) && eventData.isFree) {
                console.warn("Handling multiple participants for free events without explicit tickets needs clarification on capacity impact if not 1:1.");
            }
        }

        const eventQuestionMap = new Map(eventData.eventQuestions.map(eq => [eq.id, eq]));
        const requiredQuestionIds = new Set(eventData.eventQuestions.filter(eq => eq.isRequired).map(eq => eq.id));

        for (const participant of participants) {
            const providedEqIds = new Set(participant.responses.map(r => r.eventQuestionId));
            for (const reqId of requiredQuestionIds) {
                if (!providedEqIds.has(reqId)) {
                    const questionText = eventQuestionMap.get(reqId)?.question.questionText;
                    throw new ValidationError(`Response required for question "${questionText || reqId}" for participant ${participant.firstName} ${participant.lastName}.`);
                }
                const response = participant.responses.find(r => r.eventQuestionId === reqId);
                if (response && response.responseText.trim() === '') {
                    const questionText = eventQuestionMap.get(reqId)?.question.questionText;
                    throw new ValidationError(`Response cannot be empty for required question "${questionText || reqId}" for participant ${participant.firstName} ${participant.lastName}.`);
                }
            }
            for (const providedEqId of providedEqIds) {
                if (!eventQuestionMap.has(providedEqId)) {
                    throw new ValidationError(`Invalid event question ID ${providedEqId} provided for participant ${participant.firstName} ${participant.lastName}.`);
                }

                // Validate DROPDOWN question responses
                const eventQuestion = eventQuestionMap.get(providedEqId)!; // We've confirmed it exists
                if (eventQuestion.question.questionType === QuestionType.DROPDOWN) {
                    const responseForQuestion = participant.responses.find(r => r.eventQuestionId === providedEqId);
                    if (responseForQuestion) { // Only validate if a response is provided
                        const responseText = responseForQuestion.responseText;
                        const validOptions = eventQuestion.question.options;

                        if (eventQuestion.isRequired && responseText.trim() === '') {
                            // This case is already handled by the requiredQuestionIds check,
                            // but an explicit check here for DROPDOWN is fine for clarity if needed.
                            // For now, relying on the earlier check for empty required responses.
                        }

                        if (responseText.trim() !== '') { // Only validate non-empty responses against options
                            if (!validOptions || validOptions.length === 0) {
                                throw new ValidationError(`Question "${eventQuestion.question.questionText}" is a DROPDOWN type but has no defined options. Cannot validate response "${responseText}".`);
                            }
                            const isValidOption = validOptions.some(opt => opt.optionText === responseText);
                            if (!isValidOption) {
                                throw new ValidationError(
                                    `Invalid option "${responseText}" provided for question "${eventQuestion.question.questionText}" for participant ${participant.firstName} ${participant.lastName}. ` +
                                    `Valid options are: ${validOptions.map(opt => opt.optionText).join(', ')}.`
                                );
                            }
                        }
                    }
                } else if (eventQuestion.question.questionType === QuestionType.CHECKBOX) {
                    const responseForQuestion = participant.responses.find(r => r.eventQuestionId === providedEqId);
                    if (responseForQuestion) { // Only validate if a response is provided
                        const responseText = responseForQuestion.responseText;
                        const validOptions = eventQuestion.question.options;

                        if (responseText.trim() !== '') { // Only validate non-empty responses
                            let selectedOptions: string[] = [];
                            try {
                                selectedOptions = JSON.parse(responseText);
                                if (!Array.isArray(selectedOptions) || !selectedOptions.every(item => typeof item === 'string')) {
                                    throw new Error('Response for CHECKBOX must be a JSON array of strings.');
                                }
                            } catch (e) {
                                throw new ValidationError(
                                    `Invalid response format for question "${eventQuestion.question.questionText}" for participant ${participant.firstName} ${participant.lastName}. Expected a JSON array of strings.`
                                );
                            }

                            if (eventQuestion.isRequired && selectedOptions.length === 0) {
                                throw new ValidationError(
                                    `At least one option must be selected for required question "${eventQuestion.question.questionText}" for participant ${participant.firstName} ${participant.lastName}.`
                                );
                            }

                            if (!validOptions || validOptions.length === 0) {
                                // This case implies a CHECKBOX question was defined without options, which is problematic if answered.
                                if (selectedOptions.length > 0) {
                                    throw new ValidationError(`Question "${eventQuestion.question.questionText}" is a CHECKBOX type but has no defined options. Cannot validate response.`);
                                }
                            } else {
                                for (const selectedOpt of selectedOptions) {
                                    const isValidOption = validOptions.some(opt => opt.optionText === selectedOpt);
                                    if (!isValidOption) {
                                        throw new ValidationError(
                                            `Invalid option "${selectedOpt}" provided for question "${eventQuestion.question.questionText}" for participant ${participant.firstName} ${participant.lastName}. ` +
                                            `Valid options are: ${validOptions.map(opt => opt.optionText).join(', ')}.`
                                        );
                                    }
                                }
                            }
                        } else if (eventQuestion.isRequired) {
                            // Empty responseText for a required CHECKBOX question
                            throw new ValidationError(
                                `At least one option must be selected for required question "${eventQuestion.question.questionText}" for participant ${participant.firstName} ${participant.lastName}.`
                            );
                        }
                    } else if (eventQuestion.isRequired) {
                        // No response object found for a required CHECKBOX question
                        throw new ValidationError(
                            `Response required for question "${eventQuestion.question.questionText}" for participant ${participant.firstName} ${participant.lastName}.`
                        );
                    }
                }
            }
        }

        return prisma.$transaction(async (tx) => {
            let generatedPlaintextToken: string | undefined = undefined;

            if (!eventData.isFree && tickets && tickets.length > 0) { // Check tickets array again for safety
                const ticketIds = Object.keys(ticketQuantities).map(Number);
                const currentTickets = await tx.ticket.findMany({
                    where: { id: { in: ticketIds } },
                });
                for (const currentTicket of currentTickets) {
                    const requestedQuantity = ticketQuantities[currentTicket.id];
                    if (currentTicket.quantitySold + requestedQuantity > currentTicket.quantityTotal) {
                        throw new ValidationError(`Ticket "${currentTicket.name}" quantity became unavailable during registration. Only ${currentTicket.quantityTotal - currentTicket.quantitySold} left.`);
                    }
                }
            }

            const primaryParticipantInput = participants[0];
            // Remove ticketId from participant data before creating Participant
            const { ticketId: _, responses: primaryResponses, ...primaryData } = primaryParticipantInput;
            const primaryParticipant = await ParticipantService.findOrCreateParticipant(primaryData as any, tx);

            const registration = await tx.registration.create({
                data: {
                    eventId: eventId,
                    participantId: primaryParticipant.id,
                    userId: userId,
                    status: eventData.isFree ? RegistrationStatus.CONFIRMED : RegistrationStatus.PENDING
                }
            });
            const newRegistrationId = registration.id;

            if (!eventData.isFree && tickets && tickets.length > 0) { // Check tickets array again
                const purchase = await tx.purchase.create({
                    data: {
                        registrationId: newRegistrationId,
                        totalPrice: overallTotalPrice
                    }
                });
                const newPurchaseId = purchase.id;

                const purchaseItemPromises = tickets.map(ticketRequest => {
                    const dbTicket = eventData.tickets!.find(t => t.id === ticketRequest.ticketId); // tickets is now guaranteed by outer if
                    if (!dbTicket) {
                        throw new Error(`Consistency error: Ticket ${ticketRequest.ticketId} not found during purchase item creation.`);
                    }
                    return tx.purchaseItem.create({
                        data: {
                            purchaseId: newPurchaseId,
                            ticketId: ticketRequest.ticketId,
                            quantity: ticketRequest.quantity,
                            unitPrice: dbTicket.price
                        }
                    });
                });
                await Promise.all(purchaseItemPromises);

                const ticketUpdatePromises = tickets.map(ticketRequest => {
                    return tx.ticket.update({
                        where: { id: ticketRequest.ticketId },
                        data: { quantitySold: { increment: ticketRequest.quantity } }
                    });
                });
                await Promise.all(ticketUpdatePromises);

                if (!userId) {
                    const plaintextToken = crypto.randomUUID();
                    const saltRounds = 10;
                    const hashedToken = await bcrypt.hash(plaintextToken, saltRounds);
                    const expiryMinutes = 60;
                    const expiryDate = new Date(Date.now() + expiryMinutes * 60 * 1000);
                    await tx.purchase.update({
                        where: { id: newPurchaseId },
                        data: {
                            paymentToken: hashedToken,
                            paymentTokenExpiry: expiryDate,
                        },
                    });
                    generatedPlaintextToken = plaintextToken;
                }
            }

            const attendeePromises = participants.map(async (participantInput) => {
                let currentParticipantId: number;
                if (participantInput.email === primaryParticipantInput.email) {
                    currentParticipantId = primaryParticipant.id;
                } else {
                    // Strip ticketId and responses before creating Participant
                    const { ticketId: _, responses, ...pData } = participantInput;
                    const participant = await ParticipantService.findOrCreateParticipant(pData as any, tx);
                    currentParticipantId = participant.id;
                }
                const attendee = await tx.attendee.create({
                    data: {
                        registrationId: newRegistrationId,
                        participantId: currentParticipantId,
                        ticketId: participantInput.ticketId,
                    }
                });
                const responsePromises = participantInput.responses.map(response => {
                    const eventQuestion = eventQuestionMap.get(response.eventQuestionId);
                    if (!eventQuestion) {
                        throw new Error(`Consistency error: EventQuestion mapping not found for eventQuestionId: ${response.eventQuestionId}`);
                    }
                    return tx.response.create({
                        data: {
                            attendeeId: attendee.id,
                            eqId: eventQuestion.id,
                            responseText: response.responseText
                        }
                    });
                });
                await Promise.all(responsePromises);
            });
            await Promise.all(attendeePromises);

            const response: CreateRegistrationResponse = {
                message: eventData.isFree ? "Registration confirmed" : "Registration pending payment",
                registrationId: newRegistrationId
            };
            if (generatedPlaintextToken) {
                response.paymentToken = generatedPlaintextToken;
            }
            return response;
        });
    }

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
                if (userId) where.userId = userId; // Admin/Organizer can filter by userId for their event
            } else { // Participant viewing registrations for an event (likely only their own)
                where.eventId = eventId;
                where.userId = authUser.userId; // Can only see their own for this event
                isAuthorized = true;
            }
        } else if (userId) { // No eventId specified, filtering by userId
            if (userId === authUser.userId) { // Participant viewing their own registrations
                isAuthorized = true;
                where.userId = userId;
            } else { // Trying to view someone else's registrations without admin/organizer context
                throw new AuthorizationError('Forbidden: You can only view your own registrations.');
            }
        } else { // No eventId or userId specified by a non-admin
            isAuthorized = true; // Default to showing user their own registrations
            where.userId = authUser.userId;
        }

        if (!isAuthorized) { // Should be redundant if logic above is correct, but as a safeguard
            throw new AuthorizationError('Forbidden: You do not have permission to view these registrations.');
        }

        const [registrations, totalCount] = await prisma.$transaction([
            prisma.registration.findMany({
                where, skip, take: limit, orderBy: { created_at: 'desc' },
                include: {
                    participant: { select: { id: true, firstName: true, lastName: true, email: true } },
                    event: { select: { id: true, name: true, organiserId: true, isFree: true } },
                    attendees: {
                        include: {
                            participant: { select: { id: true, firstName: true, lastName: true, email: true } },
                        }
                    },
                    purchase: {
                        include: {
                            items: {
                                include: {
                                    ticket: { select: { id: true, name: true, price: true } }
                                }
                            }
                        }
                    }
                }
            }),
            prisma.registration.count({ where })
        ]);
        return { registrations, totalCount };
    }

    static async getRegistrationsForEvent(
        eventId: number,
        query: GetRegistrationsForEventQuery,
        authUser: JwtPayload
    ) {
        const { page = 1, limit = 10, search, status, ticketId } = query;
        const skip = (page - 1) * limit;

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { organiserId: true }
        });
        if (!event) {
            throw new NotFoundError('Event not found.');
        }
        const isAdmin = authUser.role === UserRole.ADMIN;
        const isEventOrganizer = event.organiserId === authUser.userId;
        if (!isAdmin && !isEventOrganizer) {
            throw new AuthorizationError('Forbidden: You do not have permission to view registrations for this event.');
        }

        const whereInput: Prisma.RegistrationWhereInput = { eventId: eventId };
        if (status) {
            whereInput.status = status;
        }
        if (search) {
            const searchLower = search.toLowerCase();
            const participantSearch = [
                { participant: { firstName: { contains: searchLower } } },
                { participant: { lastName: { contains: searchLower } } },
                { participant: { email: { contains: searchLower } } },
            ];
            const attendeeParticipantSearch = {
                attendees: {
                    some: {
                        participant: {
                            OR: [
                                { firstName: { contains: searchLower } },
                                { lastName: { contains: searchLower } },
                                { email: { contains: searchLower } },
                            ]
                        }
                    }
                }
            };
            whereInput.OR = [...participantSearch, attendeeParticipantSearch];
        }
        if (ticketId) {
            // filter by ticket purchased or assigned to attendee
            whereInput.purchase = {
                items: {
                    some: { ticketId: ticketId }
                }
            };
        }

        type RegistrationWithDetails = Prisma.RegistrationGetPayload<{
            include: {
                participant: {
                    select: { firstName: true, lastName: true, email: true }
                },
                attendees: {
                    select: { id: true }
                },
                purchase: {
                    select: { totalPrice: true }
                }
            }
        }>;

        const transactionResult = await prisma.$transaction([
            prisma.registration.findMany({
                where: whereInput,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    participant: {
                        select: { firstName: true, lastName: true, email: true }
                    },
                    attendees: {
                        select: { id: true }
                    },
                    purchase: {
                        select: { totalPrice: true }
                    }
                }
            }),
            prisma.registration.count({ where: whereInput })
        ]);
        const registrations = transactionResult[0] as RegistrationWithDetails[];
        const totalCount = transactionResult[1] as number;

        const formattedRegistrations = registrations.map((reg: RegistrationWithDetails) => {
            const primaryParticipantName = `${reg.participant.firstName} ${reg.participant.lastName}`;
            return {
                registrationId: reg.id,
                registrationDate: reg.created_at,
                primaryParticipantName: primaryParticipantName,
                primaryParticipantEmail: reg.participant.email,
                numberOfAttendees: reg.attendees.length,
                registrationStatus: reg.status,
                totalAmountPaid: reg.purchase?.totalPrice ?? null
            };
        });
        return {
            data: formattedRegistrations,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        };
    }

    static async getRegistrationById(registrationId: number, authUser: JwtPayload) {
        // Define a type for the detailed registration payload
        type RegistrationFullDetails = Prisma.RegistrationGetPayload<{
            include: {
                participant: true,
                event: {
                    select: {
                        id: true,
                        name: true,
                        startDateTime: true, // Corrected field name from schema
                        // endDateTime: true, // Also available if needed
                        organiserId: true,
                        isFree: true
                    }
                },
                attendees: {
                    include: {
                        participant: true,
                        ticket: true,      // include ticket info
                        responses: {
                            include: {
                                eventQuestion: { // To get the actual question text
                                    include: {
                                        question: { select: { id: true, questionText: true, questionType: true } }
                                    }
                                }
                            }
                        }
                    }
                },
                purchase: {
                    include: {
                        items: { // PurchaseItems
                            select: {
                                id: true,
                                quantity: true,
                                unitPrice: true, // Price at the time of purchase
                                ticket: { // Linked ticket
                                    select: {
                                        id: true,
                                        name: true // Name of the ticket type
                                    }
                                }
                            }
                        },
                        payment: true // Full payment details
                    }
                },
            }
        }>;

        // Let TypeScript infer the type of 'registration' directly from the Prisma query with includes.
        // The explicit type 'RegistrationFullDetails | null' can sometimes cause issues if inference is tricky.
        const registration = await prisma.registration.findUnique({
            where: { id: registrationId },
            include: {
                participant: true, // Primary participant details
                event: {
                    select: {
                        id: true,
                        name: true,
                        startDateTime: true, // Corrected field name from schema
                        // endDateTime: true, // Also available if needed
                        organiserId: true,
                        isFree: true
                    }
                },
                attendees: {
                    include: {
                        participant: true, // Full participant details for each attendee
                        responses: {
                            include: {
                                eventQuestion: { // To get the actual question text
                                    include: {
                                        question: { select: { id: true, questionText: true, questionType: true } }
                                    }
                                }
                            }
                        }
                    }
                },
                purchase: {
                    include: {
                        items: { // PurchaseItems
                            select: {
                                id: true,
                                quantity: true,
                                unitPrice: true, // Price at the time of purchase
                                ticket: { // Linked ticket
                                    select: {
                                        id: true,
                                        name: true // Name of the ticket type
                                    }
                                }
                            }
                        },
                        payment: true // Full payment details
                    }
                },
            }
        });
        if (!registration) {
            throw new NotFoundError('Registration not found');
        }
        const isOwner = registration.userId === authUser.userId ||
            (registration.participant?.userId !== null && registration.participant?.userId === authUser.userId);
        const isEventOrganizer = registration.event?.organiserId === authUser.userId;
        const isAdmin = authUser.role === UserRole.ADMIN;
        if (!isOwner && !isEventOrganizer && !isAdmin) {
            throw new AuthorizationError('Forbidden: You do not have permission to view this registration.');
        }
        return registration;
    }

    static async cancelRegistration(registrationId: number, requestingUser: JwtPayload) {
        const registration = await prisma.registration.findUnique({
            where: { id: registrationId },
            include: {
                event: { select: { id: true, isFree: true } },
                purchase: { select: { id: true } },
                participant: { select: { userId: true } },
                user: { select: { id: true } }
            }
        });
        if (!registration) {
            throw new NotFoundError('Registration not found');
        }
        const isAdmin = requestingUser.role === UserRole.ADMIN;
        const isOwner = registration.userId === requestingUser.userId ||
            (registration.participant?.userId !== null && registration.participant?.userId === requestingUser.userId);
        if (!isAdmin && !isOwner) {
            throw new AuthorizationError('Forbidden: You do not have permission to cancel this registration.');
        }
        if (registration.status === RegistrationStatus.CANCELLED) {
            return registration;
        }
        if (registration.status !== RegistrationStatus.CONFIRMED && registration.status !== RegistrationStatus.PENDING) {
            throw new ValidationError(`Cannot cancel registration with status: ${registration.status}`);
        }

        return prisma.$transaction(async (tx) => {
            const updatedRegistration = await tx.registration.update({
                where: { id: registrationId },
                data: { status: RegistrationStatus.CANCELLED },
                include: {
                    participant: true,
                    event: { select: { id: true, name: true, isFree: true } },
                    purchase: {
                        include: {
                            items: {
                                include: {
                                    ticket: true
                                }
                            }
                        }
                    },
                    attendees: { include: { participant: true } }
                }
            });
            if (!registration.event.isFree && registration.purchase) {
                const purchaseItems = await tx.purchaseItem.findMany({
                    where: { purchaseId: registration.purchase.id }
                });
                const ticketUpdatePromises = purchaseItems.map(item => {
                    return tx.ticket.updateMany({
                        where: { id: item.ticketId },
                        data: {
                            quantitySold: {
                                decrement: item.quantity
                            }
                        }
                    }).catch(err => {
                        console.warn(`Failed to decrement quantity for Ticket ID ${item.ticketId} during cancellation for registration ${registrationId}:`, err);
                    });
                });
                await Promise.all(ticketUpdatePromises);
                // TODO: Implement refund logic here in a future step
            }
            return updatedRegistration;
        });
    }

    static async getAdminAllRegistrations(
        query: GetAdminAllRegistrationsQuery,
        authUser: JwtPayload
    ) {
        if (authUser.role !== UserRole.ADMIN) {
            throw new AuthorizationError('Forbidden: You do not have permission to access this resource.');
        }

        const {
            page = 1,
            limit = 10,
            search,
            status,
            ticketId,
            eventId,
            userId,
            participantId
        } = query;
        const skip = (page - 1) * limit;

        const baseWhereInput: Prisma.RegistrationWhereInput = {};
        if (eventId) baseWhereInput.eventId = eventId;
        if (userId) baseWhereInput.userId = userId;
        if (participantId) baseWhereInput.participantId = participantId;
        if (status) baseWhereInput.status = status;
        if (ticketId) {
            baseWhereInput.purchase = {
                items: { some: { ticketId: ticketId } }
            };
        }

        const andConditions: Prisma.RegistrationWhereInput[] = [];
        if (Object.keys(baseWhereInput).length > 0) {
            andConditions.push(baseWhereInput);
        }

        if (search) {
            const searchLower = search.toLowerCase();
            const searchORConditions: Prisma.RegistrationWhereInput[] = [
                { participant: { firstName: { contains: searchLower } } },
                { participant: { lastName: { contains: searchLower } } },
                { participant: { email: { contains: searchLower } } },
                {
                    attendees: {
                        some: {
                            participant: {
                                OR: [
                                    { firstName: { contains: searchLower } },
                                    { lastName: { contains: searchLower } },
                                    { email: { contains: searchLower } },
                                ]
                            }
                        }
                    }
                },
            ];
            andConditions.push({ OR: searchORConditions });
        }

        const finalWhereInput: Prisma.RegistrationWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

        type AdminRegistrationWithDetails = Prisma.RegistrationGetPayload<{
            include: {
                participant: {
                    select: { firstName: true, lastName: true, email: true }
                },
                event: {
                    select: { name: true }
                },
                attendees: {
                    select: { id: true } 
                },
                purchase: {
                    select: { totalPrice: true }
                }
            }
        }>;

        const transactionResult = await prisma.$transaction([
            prisma.registration.findMany({
                where: finalWhereInput,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    participant: {
                        select: { firstName: true, lastName: true, email: true }
                    },
                    event: {
                        select: { name: true }
                    },
                    attendees: {
                        select: { id: true } 
                    },
                    purchase: {
                        select: { totalPrice: true }
                    }
                }
            }),
            prisma.registration.count({ where: finalWhereInput })
        ]);

        const registrations = transactionResult[0] as AdminRegistrationWithDetails[];
        const totalCount = transactionResult[1] as number;

        const formattedRegistrations = registrations.map((reg: AdminRegistrationWithDetails) => {
            const primaryParticipantName = `${reg.participant.firstName} ${reg.participant.lastName}`;
            return {
                registrationId: reg.id,
                registrationDate: reg.created_at,
                eventName: reg.event.name,
                primaryParticipantName: primaryParticipantName,
                primaryParticipantEmail: reg.participant.email,
                numberOfAttendees: reg.attendees.length,
                registrationStatus: reg.status,
                totalAmountPaid: reg.purchase?.totalPrice ?? null
            };
        });

        return {
            data: formattedRegistrations,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        };
    }

    static async updateRegistrationStatus(
        registrationId: number,
        dto: UpdateRegistrationStatusDto,
        requestingUser: JwtPayload
    ): Promise<DetailedRegistration> {
        const { status: newStatus } = dto;

        const registrationForAuth = await prisma.registration.findUnique({
            where: { id: registrationId },
            include: {
                event: { select: { id: true, organiserId: true, isFree: true } },
                purchase: { include: { items: true } }, // For ticket stock adjustment
            }
        });

        if (!registrationForAuth) {
            throw new NotFoundError('Registration not found.');
        }

        const isAdmin = requestingUser.role === UserRole.ADMIN;
        const isEventOrganizer = registrationForAuth.event?.organiserId === requestingUser.userId;

        if (!isAdmin && !isEventOrganizer) {
            throw new AuthorizationError('Forbidden: You do not have permission to update this registration status.');
        }

        const currentStatus = registrationForAuth.status;

        if (currentStatus === newStatus) {
            // If status is not changing, just return the full details.
            // getRegistrationById returns Promise<RegistrationFullDetails>, which is compatible with Promise<DetailedRegistration>
            // if RegistrationFullDetails is structurally identical or a superset of DetailedRegistration.
            // The explicit cast `as unknown as DetailedRegistration` handles potential nominal type differences
            // if `getRegistrationById`'s internal `RegistrationFullDetails` type isn't exported or directly used here.
            // Given `registrationFullDetailsArgs` mirrors `getRegistrationById`'s includes, this should be safe.
            return this.getRegistrationById(registrationId, requestingUser) as unknown as DetailedRegistration;
        }

        if (currentStatus === RegistrationStatus.CANCELLED) {
            throw new ValidationError('Cannot change status of a cancelled registration.');
        }
        // Add any other specific disallowed transitions here if needed.
        // E.g., if (currentStatus === RegistrationStatus.CONFIRMED && newStatus === RegistrationStatus.PENDING) {
        //     throw new ValidationError('Cannot change a confirmed registration back to pending.');
        // }

        await prisma.$transaction(async (tx) => {
            await tx.registration.update({
                where: { id: registrationId },
                data: { status: newStatus },
            });

            if (newStatus === RegistrationStatus.CANCELLED &&
                (currentStatus === RegistrationStatus.CONFIRMED || currentStatus === RegistrationStatus.PENDING)) {
                if (!registrationForAuth.event.isFree && registrationForAuth.purchase && registrationForAuth.purchase.items.length > 0) {
                    const ticketUpdatePromises = registrationForAuth.purchase.items.map(item => {
                        return tx.ticket.updateMany({
                            where: { id: item.ticketId },
                            data: {
                                quantitySold: {
                                    decrement: item.quantity
                                }
                            }
                        }).catch(err => {
                            console.warn(`Failed to decrement quantity for Ticket ID ${item.ticketId} during status update to CANCELLED for registration ${registrationId}:`, err);
                        });
                    });
                    await Promise.all(ticketUpdatePromises);
                    // TODO: Implement refund logic if transitioning from CONFIRMED to CANCELLED for paid events.
                }
            }
        });

        // After transaction, fetch and return the full, updated registration details.
        return this.getRegistrationById(registrationId, requestingUser) as unknown as DetailedRegistration;
    }
}

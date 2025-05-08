import { Registration, UserRole, Prisma, RegistrationStatus, Participant, Attendee, Response as PrismaResponse, Purchase, Ticket } from '@prisma/client'; // Import necessary models
import { prisma } from '../config/prisma';
import { CreateRegistrationDto, CreateRegistrationResponse, ParticipantInput } from '../types/registrationTypes'; // Use new DTOs
import { ParticipantService } from './participantServices';
import { AppError, ValidationError, AuthorizationError, NotFoundError } from '../utils/errors';
import { JwtPayload } from '../types/authTypes';
import { Decimal } from '@prisma/client/runtime/library';

// Define type for query parameters validated by Joi (used internally)
interface GetRegistrationsQuery {
    eventId?: number;
    userId?: number;
    page: number;
    limit: number;
}

export class RegistrationService {
    /**
     * Creates a registration for an event, handling multiple participants and tickets.
     * @param data - The registration data including event, tickets, and participant details with responses.
     * @returns The ID of the created registration.
     */
    static async createRegistration(data: CreateRegistrationDto): Promise<CreateRegistrationResponse> {
        const { eventId, userId, tickets, participants } = data;

        // --- Pre-transaction Validations ---

        // 1. Validate Input Structure
        if (!eventId || !tickets || tickets.length === 0 || !participants || participants.length === 0) {
            throw new ValidationError('Event ID, tickets, and participant details are required.');
        }
        const totalTicketQuantity = tickets.reduce((sum, t) => sum + t.quantity, 0);
        if (totalTicketQuantity !== participants.length) {
            throw new ValidationError('Number of participants must match the total quantity of tickets.');
        }

        // 2. Fetch Event and related data needed for validation
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                tickets: { where: { id: { in: tickets.map(t => t.ticketId) } } }, // Fetch only relevant tickets
                eventQuestions: { include: { question: true } } // Fetch questions for response validation
            }
        });

        // 3. Validate Event
        if (!event) { throw new NotFoundError('Event not found'); }
        if (event.status !== 'PUBLISHED') {
            throw new ValidationError('Event is not currently open for registration.');
        }

        // 4. Validate Capacity (Consider total requested tickets)
        const currentRegistrationsCount = await prisma.registration.count({
            where: {
                eventId: eventId,
                status: { in: [RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING] }
            }
        });
        // Estimate new attendees based on total quantity, might need refinement if registrations can have varying attendee counts
        if (currentRegistrationsCount + totalTicketQuantity > event.capacity) {
            throw new ValidationError(`Event capacity (${event.capacity}) exceeded. Only ${event.capacity - currentRegistrationsCount} spots remaining.`);
        }

        // 5. Validate Tickets (if not free) and Calculate Total Price
        let overallTotalPrice = new Decimal(0);
        const ticketQuantities: { [key: number]: number } = {}; // Track requested quantity per ticketId

        if (!event.isFree) {
            const now = new Date();
            for (const requestedTicket of tickets) {
                const dbTicket = event.tickets.find(t => t.id === requestedTicket.ticketId);
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
                // Check availability later within transaction for atomicity
                overallTotalPrice = overallTotalPrice.add(dbTicket.price.mul(requestedTicket.quantity));
                ticketQuantities[requestedTicket.ticketId] = requestedTicket.quantity;
            }
        } else {
             // Ensure no paid tickets are selected for a free event
             if (tickets.some(t => t.ticketId)) {
                  throw new ValidationError('Cannot select specific tickets for a free event.');
             }
             // For free events, maybe default quantity is 1 per participant? Adjust logic as needed.
             // For now, assume free events don't use the 'tickets' array structure in the same way.
             // This part needs clarification for free event multi-participant flow.
             // Let's assume free events follow a simpler path or are handled differently.
             // For this refactor, focus on the paid flow described.
             if (participants.length > 1 && tickets.length === 0) {
                 // How to handle multiple participants for free events without tickets? Schema might need adjustment.
                 console.warn("Handling multiple participants for free events without explicit tickets needs clarification.");
             }
        }


        // 6. Validate Participant Responses (Basic - check required, valid question IDs)
        const eventQuestionMap = new Map(event.eventQuestions.map(eq => [eq.id, eq])); // Map eq.id to eq object
        const requiredQuestionIds = new Set(event.eventQuestions.filter(eq => eq.isRequired).map(eq => eq.id));

        for (const participant of participants) {
            const providedEqIds = new Set(participant.responses.map(r => r.eventQuestionId));

            // Check required questions are answered
            for (const reqId of requiredQuestionIds) {
                if (!providedEqIds.has(reqId)) {
                    const question = eventQuestionMap.get(reqId)?.question.questionText;
                    throw new ValidationError(`Response required for question "${question || reqId}" for participant ${participant.firstName} ${participant.lastName}.`);
                }
                const response = participant.responses.find(r => r.eventQuestionId === reqId);
                if (response && response.responseText.trim() === '') {
                     const question = eventQuestionMap.get(reqId)?.question.questionText;
                    throw new ValidationError(`Response cannot be empty for required question "${question || reqId}" for participant ${participant.firstName} ${participant.lastName}.`);
                }
            }

            // Check provided question IDs are valid for the event
            for (const providedEqId of providedEqIds) {
                if (!eventQuestionMap.has(providedEqId)) {
                    throw new ValidationError(`Invalid event question ID ${providedEqId} provided for participant ${participant.firstName} ${participant.lastName}.`);
                }
            }
        }


        // --- Database Transaction ---
        return prisma.$transaction(async (tx) => {

            // 7. Lock and Re-validate Ticket Quantities (if not free)
            if (!event.isFree) {
                const ticketIds = Object.keys(ticketQuantities).map(Number);
                const currentTickets = await tx.ticket.findMany({
                    where: { id: { in: ticketIds } },
                    // Use pessimistic locking if DB supports it and high concurrency is expected
                    // For MySQL: await tx.$queryRaw`SELECT * FROM tickets WHERE id IN (${Prisma.join(ticketIds)}) FOR UPDATE`;
                });

                for (const currentTicket of currentTickets) {
                    const requestedQuantity = ticketQuantities[currentTicket.id];
                    if (currentTicket.quantitySold + requestedQuantity > currentTicket.quantityTotal) {
                        throw new ValidationError(`Ticket "${currentTicket.name}" quantity became unavailable during registration. Only ${currentTicket.quantityTotal - currentTicket.quantitySold} left.`);
                    }
                }
            }

            // 8. Find/Create Primary Participant
            // Assuming the first participant in the array is the primary one
            const primaryParticipantInput = participants[0];
            // Call findOrCreateParticipant with only ParticipantDto fields
            const primaryParticipant = await ParticipantService.findOrCreateParticipant(
                primaryParticipantInput, // Do not pass userId here
                tx
            );

            // 9. Create Main Registration Record
            const registration = await tx.registration.create({
                data: {
                    eventId: eventId,
                    participantId: primaryParticipant.id, // Link to primary participant
                    userId: userId, // Link to user if logged in
                    status: event.isFree ? RegistrationStatus.CONFIRMED : RegistrationStatus.PENDING
                }
            });
            const newRegistrationId = registration.id;

            // 10. Create Purchase and PurchaseItem Records (if not free)
            if (!event.isFree) {
                // Create the main Purchase record linked to the registration
                const purchase = await tx.purchase.create({
                    data: {
                        registrationId: newRegistrationId,
                        totalPrice: overallTotalPrice // Store the pre-calculated total price
                    }
                });
                const newPurchaseId = purchase.id;

                // Create PurchaseItem records for each ticket type in the request
                const purchaseItemPromises = tickets.map(ticketRequest => {
                    const dbTicket = event.tickets.find(t => t.id === ticketRequest.ticketId);
                    if (!dbTicket) {
                        // This should have been caught earlier, but safety check
                        throw new Error(`Consistency error: Ticket ${ticketRequest.ticketId} not found during purchase item creation.`);
                    }
                    return tx.purchaseItem.create({ // Use correct model name PurchaseItem
                        data: {
                            purchaseId: newPurchaseId,
                            ticketId: ticketRequest.ticketId,
                            quantity: ticketRequest.quantity,
                            unitPrice: dbTicket.price // Store price at time of purchase
                        }
                    });
                });
                await Promise.all(purchaseItemPromises);

                // 11. Update Ticket Quantities Sold for each ticket type
                const ticketUpdatePromises = tickets.map(ticketRequest => {
                    return tx.ticket.update({
                        where: { id: ticketRequest.ticketId },
                        data: { quantitySold: { increment: ticketRequest.quantity } }
                    });
                });
                await Promise.all(ticketUpdatePromises);
            }


            // 12. Create Attendee and Response Records for ALL participants
            const attendeePromises = participants.map(async (participantInput) => {
                // Find/Create Participant record for this attendee
                // If it's the primary participant and already created, use their ID
                let currentParticipantId: number;
                if (participantInput.email === primaryParticipantInput.email) { // Assuming email is unique identifier
                     currentParticipantId = primaryParticipant.id;
                } else {
                    // Pass null/undefined for userId for secondary participants unless explicitly provided
                    const participant = await ParticipantService.findOrCreateParticipant(participantInput, tx);
                    currentParticipantId = participant.id;
                }

                // Create Attendee record linking Registration and Participant
                const attendee = await tx.attendee.create({
                    data: {
                        registrationId: newRegistrationId,
                        participantId: currentParticipantId,
                        // ticketId: ??? // Assign if needed and schema supports
                    }
                });

                // Create Response records linked to this Attendee
                const responsePromises = participantInput.responses.map(response => {
                    const eventQuestion = eventQuestionMap.get(response.eventQuestionId);
                    if (!eventQuestion) {
                         // This validation was done earlier, but double-check
                         throw new Error(`Consistency error: EventQuestion mapping not found for eventQuestionId: ${response.eventQuestionId}`);
                    }
                    return tx.response.create({
                        data: {
                            attendeeId: attendee.id, // Link to Attendee
                            eqId: eventQuestion.id, // Link to EventQuestions
                            responseText: response.responseText
                        }
                    });
                });
                await Promise.all(responsePromises);
            });

            await Promise.all(attendeePromises);


            // 13. Return success response
            return {
                message: event.isFree ? "Registration confirmed" : "Registration pending payment",
                registrationId: newRegistrationId
            };
        });
    }

    // For example, getRegistrationById should include attendees and their participants/responses.
    // cancelRegistration might need to adjust ticket quantity logic if Purchase changes.

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
                    participant: { select: { id: true, firstName: true, lastName: true, email: true } }, // Primary participant
                    event: { select: { id: true, name: true, organiserId: true, isFree: true } }, // Include isFree
                    // Include attendees and their participants
                    attendees: {
                        include: {
                            participant: { select: { id: true, firstName: true, lastName: true, email: true } }
                        }
                    },
                    // Include purchase and its items with ticket details
                    purchase: {
                        include: {
                            items: {
                                include: {
                                    ticket: { select: { id: true, name: true, price: true } } // Include ticket price in item
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

     /**
      * Retrieves a single registration by ID, performing authorization checks.
      */
    static async getRegistrationById(registrationId: number, authUser: JwtPayload) {
        const registration = await prisma.registration.findUnique({
            where: { id: registrationId },
            include: {
                participant: true, // Include full primary participant for potential userId check
                event: { select: { id: true, name: true, organiserId: true, isFree: true } }, // Include isFree
                // Include attendees and their participants and responses
                attendees: {
                    include: {
                        participant: true, // Include participant details for each attendee
                        responses: { // Include responses for each attendee
                            include: {
                                eventQuestion: { include: { question: true } } // Include question details for each response
                            }
                        }
                    }
                },
                // Include purchase and its items with ticket details, and payment details
                purchase: {
                    include: {
                        items: {
                            include: {
                                ticket: { select: { id: true, name: true, price: true } } // Include ticket price in item
                            }
                        },
                        payment: true // Include payment details if available
                    }
                },
            }
        });

        if (!registration) {
            throw new NotFoundError('Registration not found'); // Use NotFoundError
        }

        // Authorization check needs update if primary participant isn't always the owner
        // Access participant and event through the included relations
        const isOwner = registration.userId === authUser.userId ||
                       (registration.participant?.userId !== null && registration.participant?.userId === authUser.userId); // Access participant via relation
        const isEventOrganizer = registration.event?.organiserId === authUser.userId; // Access event via relation
        const isAdmin = authUser.role === UserRole.ADMIN;

        if (!isOwner && !isEventOrganizer && !isAdmin) {
            throw new AuthorizationError('Forbidden: You do not have permission to view this registration.');
        }

        return registration;
    }

     /**
     * Cancels a registration by ID, performing authorization checks.
     * TODO: Review logic related to Purchase/Ticket quantity if Purchase model changes.
     * @param registrationId The ID of the registration to cancel.
     * @param requestingUser The authenticated user attempting the cancellation.
     */
    static async cancelRegistration(registrationId: number, requestingUser: JwtPayload) {
        // Fetch registration with necessary includes for validation and updates
        const registration = await prisma.registration.findUnique({
            where: { id: registrationId },
            include: {
                event: { select: { id: true, isFree: true } },
                // Include purchase to get its ID if it exists
                purchase: { select: { id: true } },
                participant: { select: { userId: true } }, // Include primary participant userId for ownership check
                user: { select: { id: true } } // Include registration's direct userId link as well
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
             return registration; // Already cancelled, return current state
        }

        if (registration.status !== RegistrationStatus.CONFIRMED && registration.status !== RegistrationStatus.PENDING) {
             throw new ValidationError(`Cannot cancel registration with status: ${registration.status}`);
        }


        return prisma.$transaction(async (tx) => {
            // Update the registration status first
            const updatedRegistration = await tx.registration.update({
                where: { id: registrationId },
                data: { status: RegistrationStatus.CANCELLED },
                 include: { 
                    participant: true,
                    event: { select: { id: true, name: true, isFree: true } },
                    purchase: { // Include purchase and its items
                        include: {
                            items: { // Include the purchase items
                                include: {
                                    ticket: true // Include the ticket details for each item
                                }
                            }
                        }
                    },
                    attendees: { include: { participant: true } } // Include attendees for context
                }
            });

            // If it was a paid event (check if purchase existed), decrement ticket quantitySold
            if (!registration.event.isFree && registration.purchase) {
                 // Fetch the purchase items associated with this registration's purchase
                 const purchaseItems = await tx.purchaseItem.findMany({
                     where: { purchaseId: registration.purchase.id } // Use the ID from the initially fetched registration
                 });

                 const ticketUpdatePromises = purchaseItems.map(item => {
                     // Safety check: Ensure ticket exists before decrementing
                     return tx.ticket.updateMany({ // Use updateMany for safety in case ticket was deleted
                         where: { id: item.ticketId },
                         data: {
                             quantitySold: {
                                 decrement: item.quantity
                             }
                         }
                     }).catch(err => {
                         // Log if a specific ticket update fails, but don't block cancellation
                         console.warn(`Failed to decrement quantity for Ticket ID ${item.ticketId} during cancellation for registration ${registrationId}:`, err);
                     });
                 });
                 await Promise.all(ticketUpdatePromises);

                 // TODO: Implement refund logic here in a future step
            }

            return updatedRegistration;
        });
    }
}

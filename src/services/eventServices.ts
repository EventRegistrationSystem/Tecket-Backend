import { prisma } from '../config/prisma';
import { CreateEventDTO, EventFilters, EventResponse, TicketResponse } from '../types/eventTypes';
import { JwtPayload } from '../types/authTypes';
import { NotFoundError, AuthorizationError, ValidationError, EventError } from '../utils/errors';

export class EventService {

    /**
     * 01 - Create a new event
     * @param organiserId 
     * @param eventData 
     * @returns 
     */
    static async createEvent(organiserId: number, eventData: CreateEventDTO) {

        // Make sure the event end date is after the start date
        if (new Date(eventData.endDateTime) < new Date(eventData.startDateTime)) {
            throw new ValidationError('Event end date must be after the start date');
        }

        // Make sure the event is not in the past
        if (new Date(eventData.startDateTime) < new Date()) {
            throw new ValidationError('Event start date must be in the future');
        }

        // Validate tickets only for paid events
        if (!eventData.isFree) {
            if (!eventData.tickets || eventData.tickets.length === 0) {
                throw new ValidationError('At least one ticket type is required for paid events');
            }

            // Check ticket dates
            for (const ticket of eventData.tickets) {
                if (new Date(ticket.salesEnd) <= new Date(ticket.salesStart)) {
                    throw new ValidationError('Ticket sales end date must be after sales start date');
                }

                if (new Date(ticket.salesEnd) > new Date(eventData.endDateTime)) {
                    throw new ValidationError('Ticket sales cannot end after the event ends');
                }
            }
        }

        return prisma.$transaction(async (tx) => {
            // 1 - Create the event
            const event = await tx.event.create({
                data: {
                    organiserId: organiserId,
                    name: eventData.name,
                    description: eventData.description,
                    location: eventData.location,
                    capacity: eventData.capacity,
                    eventType: eventData.eventType,
                    isFree: eventData.isFree,
                    startDateTime: new Date(eventData.startDateTime),
                    endDateTime: new Date(eventData.endDateTime),
                    status: 'DRAFT'
                }
            });

            // 2 - Create the tickets and link them to the event (paid events only)
            let eventTickets: TicketResponse[] = [];
            if (!eventData.isFree && eventData.tickets && eventData.tickets.length > 0) {
                eventTickets = await Promise.all(
                    eventData.tickets.map(async (ticket) => {
                        return tx.ticket.create({
                            data: {
                                eventId: event.id,
                                name: ticket.name,
                                description: ticket.description,
                                price: ticket.price,
                                quantityTotal: ticket.quantityTotal,
                                quantitySold: 0,
                                salesStart: new Date(ticket.salesStart),
                                salesEnd: new Date(ticket.salesEnd)
                            }
                        });
                    })
                );
            }

            // 3 - Create the questions and link them to the event
            const eventQuestions = await Promise.all(

                // Map over the questions array
                eventData.questions.map(async (q) => {
                    let questionId: number;

                    // 3.1 - Try to find an existing Question by its text
                    const existingQuestion = await tx.question.findFirst({
                        where: { questionText: q.questionText }
                    });

                    if (existingQuestion) {
                        questionId = existingQuestion.id;
                    } else {
                        // Create a new Question if it doesn't exist
                        const newQuestion = await tx.question.create({
                            data: {
                                questionText: q.questionText,
                                questionType: 'TEXT', // Default to text for now
                                // category and validationRules could be added here if part of CreateEventDTO's question structure
                            }
                        });
                        questionId = newQuestion.id;
                    }

                    // 3.2 - Link the question to the event
                    return tx.eventQuestions.create({
                        data: {
                            eventId: event.id,
                            questionId: questionId,
                            isRequired: q.isRequired,
                            displayOrder: q.displayOrder
                        }
                    });
                })
            );

            // 4 - Return the created events with its questions
            return {
                ...event,
                tickets: eventTickets,
                questions: eventQuestions
            };
        });
    };

    /**
     * 02 - Get all events with pagination and filters
     * @param param0 
     * @returns 
     */
    static async getAllEvents({ page = 1, limit = 10, filters = {} as EventFilters }) {

        // 1. Calculate the number of items to skip
        const skip = (page - 1) * limit;

        // 2. Build the where condition object
        const where: any = {};

        // 2.1. Status filter
        if (filters.status) {
            where.status = filters.status;
        }
        else {
            // Default to only showing PUBLISHED events for non-admins/non-owners
            // If user is admin or checking their own events, this will be overridden
            where.status = "PUBLISHED";
        }

        // Handle admin view - admins can see all events in all statuses
        if (filters.isAdmin) { // adminView flag is removed, isAdmin is sufficient
            console.log('Admin view: removing status filter to show all statuses');
            delete where.status; // Remove the status filter for admin view
        }
        // Handle organizer view - organizers can see their own events in all statuses
        else if (filters.isOrganiser && filters.organiserId) {
            where.organiserId = filters.organiserId;

            // Organizers can see all statuses of their own events
            if (filters.myEvents === true && !filters.status) {
                console.log('Removing status filter for organizer view');
                delete where.status;
            }
        }

        // 2.2. Text search filter
        if (filters.search) {
            where.OR = [
                { name: { contains: filters.search } },
                { description: { contains: filters.search } }
            ];
        }

        // 2.3. Event type filter
        if (filters.eventType) {
            where.eventType = filters.eventType;
        }

        // 2.4. Location filter
        if (filters.location) {
            where.location = { contains: filters.location };
        }

        // 2.5. Date filters
        if (filters.startDate) {
            where.startDateTime = { gte: filters.startDate };
        }

        if (filters.endDate) {
            where.endDateTime = { lte: filters.endDate };
        }

        //2.6 - Free event filter
        // Check if the filter is explicitly provided (true or false), not just truthy
        if (filters.isFree !== undefined) {
            where.isFree = filters.isFree;
        }

        console.log('Final where filters:', where);

        //3. Get the events with the filters and pagination
        const [events, total] = await Promise.all([
            prisma.event.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    startDateTime: 'asc'  // Show upcoming events first
                },
                include: {
                    organizer: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true
                        }
                    },
                    tickets: {
                        where: { status: 'ACTIVE' }
                    },
                    _count: {
                        select: {
                            registrations: true // Count number of registrations
                        }
                    }
                }
            }),
            prisma.event.count({ where }) // Count the total number of events
        ]);

        // 4. Return the events and total count with pagination
        return {
            events,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        }
    }

    /**
     * 03 - Get event by ID
     * @param eventId 
     * @returns 
     */
    static async getEventById(eventId: number) {
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                _count: {
                    select: { registrations: true },
                },
            }
        });

        if (!event) {
            throw new NotFoundError('Event not found');
        }

        return event;

    }

    /**
     * 04 - Get event with details
     * @param eventId
     * @param requestingUser
     * @returns 
     */
    static async getEventWithDetails(eventId: number, requestingUser?: JwtPayload) {
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                organizer: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                },
                tickets: {
                    where: { status: 'ACTIVE' }
                },
                eventQuestions: {
                    include: {
                        question: true
                    },
                    orderBy: {
                        displayOrder: 'asc'
                    }
                },
                _count: {
                    select: {
                        registrations: true
                    }
                }
            }
        });

        if (!event) {
            throw new NotFoundError('Event not found');
        }

        // Visibility Check
        if (event.status !== 'PUBLISHED') {
            if (!requestingUser) { // Unauthenticated
                throw new AuthorizationError('Access denied to this event'); // Or NotFoundError to not reveal its existence
            }
            if (requestingUser.role === 'PARTICIPANT') {
                throw new AuthorizationError('Access denied to this event');
            }
            if (requestingUser.role === 'ORGANIZER' && event.organiserId !== requestingUser.userId) {
                throw new AuthorizationError('Access denied to this event');
            }
            // ADMINs can see any status, so no explicit check needed here for them.
        }

        return event;
    }

    /**
     * 05 - Update event
     * @param eventId 
     * @param eventData
     * @param requestingUserId
     * @param requestingUserRole
     * @returns 
     */
    static async updateEvent(
        eventId: number,
        eventData: Partial<CreateEventDTO>,
        requestingUserId: number,
        requestingUserRole: string
    ) {
        // Verify that event exists
        const existingEvent = await prisma.event.findUnique({
            where: { id: eventId }
        });

        if (!existingEvent) {
            throw new NotFoundError('Event not found');
        }

        // Ownership Check / Admin Bypass
        if (requestingUserRole !== 'ADMIN' && existingEvent.organiserId !== requestingUserId) {
            throw new AuthorizationError('You are not authorized to update this event');
        }

        // Make sure the event is not completed
        if (existingEvent.status === 'COMPLETED') {
            throw new ValidationError('Cannot update a completed event');
        }

        // Handle date validation if provided
        if (eventData.startDateTime && eventData.endDateTime) {
            if (new Date(eventData.endDateTime) < new Date(eventData.startDateTime)) {
                throw new ValidationError('Event end date must be after the start date');
            }
        } else if (eventData.startDateTime && existingEvent.endDateTime) {
            if (new Date(existingEvent.endDateTime) < new Date(eventData.startDateTime)) {
                throw new ValidationError('Event end date must be after the start date');
            }
        } else if (eventData.endDateTime && existingEvent.startDateTime) {
            if (new Date(eventData.endDateTime) < new Date(existingEvent.startDateTime)) {
                throw new ValidationError('Event end date must be after the start date');
            }
        }

        // Check if changing from free to paid
        if (eventData.isFree !== undefined && eventData.isFree !== existingEvent.isFree) {

            // If changing from free to paid, tickets must be provided
            if (eventData.isFree === false && (!eventData.tickets || eventData.tickets.length === 0)) {
                throw new ValidationError('At least one ticket type is required for paid events');
            }

            // If changing from paid to free and there are registrations, reject
            // Otherwise, deactivate all tickets
            if (eventData.isFree === true) {
                const registrationCount = await prisma.registration.count({
                    where: { eventId }
                });

                if (registrationCount > 0) {
                    throw new ValidationError('Cannot change a paid event to free when registrations exist');
                }
                else {
                    // Deactivate tickets
                    await prisma.ticket.updateMany({
                        where: { eventId },
                        data: { status: 'INACTIVE' }
                    });
                }
            }

            // Add more validation here
        }

        // Update the event
        return prisma.$transaction(async (tx) => {
            // 01 - Update the event basic information
            const updatedEvent = await tx.event.update({
                where: { id: eventId },
                data: {
                    name: eventData.name,
                    description: eventData.description,
                    location: eventData.location,
                    capacity: eventData.capacity,
                    eventType: eventData.eventType,
                    isFree: eventData.isFree,
                    startDateTime: eventData.startDateTime ? new Date(eventData.startDateTime) : undefined,
                    endDateTime: eventData.endDateTime ? new Date(eventData.endDateTime) : undefined
                }
            });


            // Ticket and Question management is now handled by dedicated Ticket/EventQuestion routes and services.

            return this.getEventWithDetails(eventId);
        });
    }

    /**
     * 05 - Update event status
     * @param eventId
     * @param status
     * @param requestingUserId
     * @param requestingUserRole
     */
    static async updateEventStatus(
        eventId: number,
        status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED',
        requestingUserId: number,
        requestingUserRole: string
    ) {
        // Verify event exists
        const existingEvent = await this.getEventById(eventId); // Fetches event for validation

        // Ownership Check / Admin Bypass
        if (requestingUserRole !== 'ADMIN' && existingEvent.organiserId !== requestingUserId) {
            throw new AuthorizationError('You are not authorized to update this event status');
        }

        // Validate status transition
        if (existingEvent.status === 'COMPLETED') {
            throw new ValidationError('Cannot change status of a completed event');
        }

        if (existingEvent.status === 'CANCELLED' && status !== 'DRAFT') {
            throw new ValidationError('Cancelled events can only be restored to draft status');
        }

        // 01 - For publishing, verify the event has questions and tickets (if paid)
        if (status === 'PUBLISHED') {

            // Get question count
            const questionCount = await prisma.eventQuestions.count({
                where: { eventId }
            });
            if (questionCount === 0) {
                throw new ValidationError('Events must have at least one question before publishing');
            }

            // For paid events, verify tickets exist
            if (!existingEvent.isFree) {
                const ticketCount = await prisma.ticket.count({
                    where: { eventId }
                });

                if (ticketCount === 0) {
                    throw new ValidationError('Paid events must have at least one ticket type before publishing');
                }
            }
        }

        // 02 - For cancellation, handle existing registrations
        if (status === 'CANCELLED' && existingEvent.status === 'PUBLISHED') {
            const registrationCount = await prisma.registration.count({
                where: { eventId }
            });

            if (registrationCount > 0) {
                // TODO: Implement: send cancellation notifications here and process refunds for paid events

                // Update all registrations to cancelled
                await prisma.registration.updateMany({
                    where: {
                        eventId,
                        status: {
                            in: ['CONFIRMED', 'PENDING']
                        }
                    },
                    data: { status: 'CANCELLED' }
                });
            }
        }

        // Update the event status
        const updatedEvent = await prisma.event.update({
            where: { id: eventId },
            data: { status }
        });

        return updatedEvent;
    }

    /**
     * 06 - Delete an event
     * @param eventId
     * @param requestingUserId
     * @param requestingUserRole
     * @returns 
     */
    static async deleteEvent(
        eventId: number,
        requestingUserId: number,
        requestingUserRole: string
    ) {
        // Verify event exists
        const existingEvent = await this.getEventById(eventId);

        if (!existingEvent) {
            throw new NotFoundError('Event not found');
        }

        // Ownership Check / Admin Bypass
        if (requestingUserRole !== 'ADMIN' && existingEvent.organiserId !== requestingUserId) {
            throw new AuthorizationError('You are not authorized to delete this event');
        }

        // Check for registrations, if any, reject and suggest cancellation
        const registrationCount = await prisma.registration.count({
            where: { eventId }
        });

        if (registrationCount > 0) {
            throw new ValidationError('Cannot delete an event with registrations. Please cancel the event instead.');
        }

        // Delete the event
        return prisma.$transaction(async (tx) => {
            // Delete related records
            await tx.eventQuestions.deleteMany({
                where: { eventId }
            });

            // Delete tickets
            await tx.ticket.deleteMany({
                where: { eventId }
            });

            // Delete the event
            return tx.event.delete({
                where: { id: eventId }
            });
        });
    }
}

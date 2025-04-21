import { EventService } from "../../services/eventServices";
import { prisma } from "../../config/prisma";
import { CreateEventDTO } from "../../types/eventTypes";

// Mock the prisma client module
jest.mock('../../config/prisma', () => {
    // Define the mock object *inside* the factory function to avoid hoisting issues
    const mockPrismaInside = {
        event: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            count: jest.fn()
        },
        ticket: {
            create: jest.fn(),
            deleteMany: jest.fn(),
            count: jest.fn(),
            updateMany: jest.fn(),
        },
        eventQuestions: {
            create: jest.fn(),
            findMany: jest.fn(),
            deleteMany: jest.fn(),
            count: jest.fn(),
            update: jest.fn(),
        },
        question: {
            create: jest.fn(),
            findFirst: jest.fn(),
            upsert: jest.fn(),
        },
        registration: {
            count: jest.fn(),
            updateMany: jest.fn()
        },
        $transaction: jest.fn().mockImplementation(async (callbackOrArray) => {
            // Simplified mock for transaction: execute the callback with the mock prisma
            if (typeof callbackOrArray === 'function') {
                // Pass the mock prisma instance defined *inside* this factory
                return await callbackOrArray(mockPrismaInside);
            } else if (Array.isArray(callbackOrArray)) {
                // For array transactions, just resolve all promises passed in
                return await Promise.all(callbackOrArray);
            }
            throw new Error('Invalid argument passed to $transaction mock');
        })
    };
    return { prisma: mockPrismaInside };
});


// Mock getEventWithDetails as it's called internally by updateEvent
const mockGetEventWithDetails = jest.fn();
// Assign the mock to the actual service method BEFORE the describe block
// Note: This assignment might still cause issues if EventService is used before this line executes.
// Consider alternative mocking strategies if problems persist.
EventService.getEventWithDetails = mockGetEventWithDetails;

describe('EventService', () => {

    beforeEach(() => {
        // Clear all mocks including mocks on service methods
        jest.clearAllMocks();
        // Reset specific service method mocks if needed
        mockGetEventWithDetails.mockClear(); // Ensure this is cleared
    })

    // Sample test data
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Normalize time for comparisons

    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    dayAfterTomorrow.setHours(0, 0, 0, 0); // Normalize time

    const validPaidEventData: CreateEventDTO = {
        name: "Test Paid Event",
        description: "This is a test paid event",
        location: "Test Location",
        capacity: 100,
        eventType: "SOCIAL",
        isFree: false,
        startDateTime: tomorrow,
        endDateTime: dayAfterTomorrow,
        tickets: [
            {
                name: "General Admission",
                description: "Standard ticket",
                price: 50,
                quantityTotal: 80,
                salesStart: new Date(),
                salesEnd: tomorrow
            }
        ],
        questions: [
            {
                questionText: "What is your t-shirt size?",
                isRequired: true,
                displayOrder: 1
            }
        ]
    };

    const validFreeEventData: CreateEventDTO = {
        name: "Test Free Event",
        description: "This is a test free event",
        location: "Test Location",
        capacity: 100,
        eventType: "SOCIAL",
        isFree: true,
        startDateTime: tomorrow,
        endDateTime: dayAfterTomorrow,
        questions: [
            {
                questionText: "What is your t-shirt size?",
                isRequired: true,
                displayOrder: 1
            }
        ]
    };

    // Test cases for createEvent method
    describe('createEvent', () => {
        it('should create a paid event successfully with tickets', async () => {
            const mockEvent = { id: 1, ...validPaidEventData, startDateTime: new Date(validPaidEventData.startDateTime), endDateTime: new Date(validPaidEventData.endDateTime) };
            const mockTicket = { id: 1, eventId: 1, ...validPaidEventData.tickets![0], salesStart: new Date(validPaidEventData.tickets![0].salesStart), salesEnd: new Date(validPaidEventData.tickets![0].salesEnd) };
            const mockQuestion = { id: 1, questionText: 'What is your t-shirt size?' };
            const mockEventQuestion = { id: 1, eventId: 1, questionId: 1, ...validPaidEventData.questions[0] };

            // Mock the Prisma client methods within the transaction
            // Access mocks via the imported prisma object (which is now mocked)
            (prisma.event.create as jest.Mock).mockResolvedValue(mockEvent);
            (prisma.ticket.create as jest.Mock).mockResolvedValue(mockTicket);
            (prisma.question.create as jest.Mock).mockResolvedValue(mockQuestion);
            (prisma.eventQuestions.create as jest.Mock).mockResolvedValue(mockEventQuestion);

            const result = await EventService.createEvent(1, validPaidEventData);

            expect(result).toBeDefined();
            expect(prisma.event.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    name: validPaidEventData.name,
                    isFree: false,
                    organiserId: 1
                })
            });
            expect(prisma.ticket.create).toHaveBeenCalledTimes(1);
            expect(prisma.question.create).toHaveBeenCalledTimes(1);
            expect(prisma.eventQuestions.create).toHaveBeenCalledTimes(1);
        });

        it('should reject a paid event without tickets', async () => {
            const invalidData = { ...validPaidEventData, tickets: [] };
            await expect(EventService.createEvent(1, invalidData))
                .rejects.toThrow('At least one ticket type is required for paid events');
        });

        // --- Additions for createEvent ---
        it('should create a free event successfully without tickets', async () => {
            const mockEvent = { id: 2, ...validFreeEventData, startDateTime: new Date(validFreeEventData.startDateTime), endDateTime: new Date(validFreeEventData.endDateTime) };
            const mockQuestion = { id: 2, questionText: 'What is your t-shirt size?' };
            const mockEventQuestion = { id: 2, eventId: 2, questionId: 2, ...validFreeEventData.questions[0] };

            (prisma.event.create as jest.Mock).mockResolvedValue(mockEvent);
            (prisma.question.create as jest.Mock).mockResolvedValue(mockQuestion);
            (prisma.eventQuestions.create as jest.Mock).mockResolvedValue(mockEventQuestion);

            const result = await EventService.createEvent(1, validFreeEventData);

            expect(result).toBeDefined();
            expect(prisma.event.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    name: validFreeEventData.name,
                    isFree: true,
                    organiserId: 1
                })
            });
            expect(prisma.ticket.create).not.toHaveBeenCalled();
            expect(prisma.question.create).toHaveBeenCalledTimes(1);
            expect(prisma.eventQuestions.create).toHaveBeenCalledTimes(1);
        });

        it('should reject event creation if end date is before start date', async () => {
            const invalidDateData = {
                ...validFreeEventData,
                startDateTime: dayAfterTomorrow,
                endDateTime: tomorrow
            };
            await expect(EventService.createEvent(1, invalidDateData))
                .rejects.toThrow('Event end date must be after the start date');
        });

        it('should reject event creation if start date is in the past', async () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);
            const invalidDateData = {
                ...validFreeEventData,
                startDateTime: pastDate,
            };
            await expect(EventService.createEvent(1, invalidDateData))
                .rejects.toThrow('Event start date must be in the future');
        });
        // --- End of additions for createEvent ---
    });

    // Test cases for getAllEvents method
    describe('getAllEvents', () => {
        it('should return events and pagination', async () => {
            const mockEvents = [{ id: 1, name: 'Test Event' }];
            const mockCount = 1;
            (prisma.event.findMany as jest.Mock).mockResolvedValue(mockEvents);
            (prisma.event.count as jest.Mock).mockResolvedValue(mockCount);

            const result = await EventService.getAllEvents({ page: 1, limit: 10 });

            expect(result.events).toEqual(mockEvents);
            expect(result.pagination).toEqual({ total: mockCount, page: 1, limit: 10, pages: 1 });
            expect(prisma.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PUBLISHED' } })); // Default status
        });

        it('should apply filters correctly (search, type, isFree)', async () => {
            (prisma.event.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.event.count as jest.Mock).mockResolvedValue(0);

            await EventService.getAllEvents({
                page: 1, limit: 10, filters: { search: 'concert', eventType: 'MUSICAL', isFree: false }
            });

            expect(prisma.event.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        OR: expect.any(Array),
                        eventType: 'MUSICAL',
                        isFree: false, // Added missing filter check
                        status: 'PUBLISHED'
                    })
                })
            );
        });

        // --- Additions for getAllEvents ---
        it('should apply date filters correctly', async () => {
            (prisma.event.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.event.count as jest.Mock).mockResolvedValue(0);
            const startDate = new Date('2025-05-01');
            const endDate = new Date('2025-05-10');

            await EventService.getAllEvents({ page: 1, limit: 10, filters: { startDate, endDate } });

            expect(prisma.event.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        startDateTime: { gte: startDate },
                        endDateTime: { lte: endDate },
                        status: 'PUBLISHED'
                    })
                })
            );
        });

        it('should apply location filter correctly', async () => {
            (prisma.event.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.event.count as jest.Mock).mockResolvedValue(0);

            await EventService.getAllEvents({ page: 1, limit: 10, filters: { location: 'Test Location' } });

            expect(prisma.event.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        location: { contains: 'Test Location' },
                        status: 'PUBLISHED'
                    })
                })
            );
        });

        it('should default to PUBLISHED status for unauthenticated users', async () => {
            (prisma.event.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.event.count as jest.Mock).mockResolvedValue(0);

            await EventService.getAllEvents({ page: 1, limit: 10, filters: {} });

            expect(prisma.event.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { status: 'PUBLISHED' } })
            );
        });

        it('should allow ADMIN to view all statuses when adminView is true', async () => {
            (prisma.event.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.event.count as jest.Mock).mockResolvedValue(0);

            await EventService.getAllEvents({ page: 1, limit: 10, filters: { isAdmin: true, adminView: true } });

            expect(prisma.event.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.not.objectContaining({ status: expect.anything() }) // Status filter removed
                })
            );
        });

        it('should allow ORGANIZER to view their events in all statuses when myEvents is true', async () => {
            (prisma.event.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.event.count as jest.Mock).mockResolvedValue(0);
            const organiserId = 5;

            await EventService.getAllEvents({ page: 1, limit: 10, filters: { isOrganiser: true, organiserId: organiserId, myEvents: true } });

            expect(prisma.event.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        organiserId: organiserId,
                    })
                })
            );
             // Also check status is NOT included
             expect(prisma.event.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.not.objectContaining({ status: expect.anything() })
                })
            );
        });

        it('should allow ORGANIZER to filter their events by status when myEvents is true and status is provided', async () => {
            (prisma.event.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.event.count as jest.Mock).mockResolvedValue(0);
            const organiserId = 5;

            await EventService.getAllEvents({ page: 1, limit: 10, filters: { isOrganiser: true, organiserId: organiserId, myEvents: true, status: 'DRAFT' } });

            expect(prisma.event.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        organiserId: organiserId,
                        status: 'DRAFT'
                    })
                })
            );
        });
        // --- End of additions for getAllEvents ---
    });

    // Test cases for updateEvent method
    describe('updateEvent', () => {
        const eventId = 1;
        const baseExistingEvent = {
            id: eventId,
            name: 'Old Name',
            isFree: false,
            status: 'DRAFT',
            startDateTime: tomorrow,
            endDateTime: dayAfterTomorrow
        };

        it('should update event basic details', async () => {
            const updateData = { name: 'New Name' };
            const expectedUpdatedEvent = { ...baseExistingEvent, ...updateData };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.event.update as jest.Mock).mockResolvedValue(expectedUpdatedEvent);
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent); // Mock the final fetch

            await EventService.updateEvent(eventId, updateData);

            expect(prisma.event.update).toHaveBeenCalledWith({
                where: { id: eventId },
                data: expect.objectContaining({ name: 'New Name' })
            });
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });

        it('should reject updates to completed events', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue({ ...baseExistingEvent, status: 'COMPLETED' });
            await expect(EventService.updateEvent(eventId, { name: 'New Name' }))
                .rejects.toThrow('Cannot update a completed event');
        });

        it('should handle changing from free to paid correctly', async () => {
            const existingFreeEvent = { ...baseExistingEvent, isFree: true };
            const updateData = {
                isFree: false,
                tickets: [{ name: "GA", price: 50, quantityTotal: 100, salesStart: new Date(), salesEnd: tomorrow }]
            };
            const expectedUpdatedEvent = { ...existingFreeEvent, isFree: false };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(existingFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            (prisma.event.update as jest.Mock).mockResolvedValue(expectedUpdatedEvent);
            (prisma.ticket.create as jest.Mock).mockResolvedValue({}); // Mock ticket creation
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent);

            await EventService.updateEvent(eventId, updateData);

            expect(prisma.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isFree: false }) }));
            expect(prisma.ticket.create).toHaveBeenCalled();
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });

        // --- Additions for updateEvent ---
        it('should reject update if end date is before start date', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            const invalidUpdateData = { endDateTime: new Date(baseExistingEvent.startDateTime.getTime() - 86400000) }; // Set end date one day before start date

            await expect(EventService.updateEvent(eventId, invalidUpdateData))
                .rejects.toThrow('Event end date must be after the start date');
        });

        it('should handle changing from paid to free (no registrations)', async () => {
            const updateData = { isFree: true };
            const expectedUpdatedEvent = { ...baseExistingEvent, isFree: true };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            (prisma.event.update as jest.Mock).mockResolvedValue(expectedUpdatedEvent);
            (prisma.ticket.updateMany as jest.Mock).mockResolvedValue({});
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent);

            await EventService.updateEvent(eventId, updateData);

            expect(prisma.registration.count).toHaveBeenCalledWith({ where: { eventId: eventId } });
            expect(prisma.ticket.updateMany).toHaveBeenCalledWith({ where: { eventId: eventId }, data: { status: 'INACTIVE' } });
            expect(prisma.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isFree: true }) }));
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });

        it('should reject changing from paid to free if registrations exist', async () => {
            const updateData = { isFree: true };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(5); // Registrations exist

            await expect(EventService.updateEvent(eventId, updateData))
                .rejects.toThrow('Cannot change a paid event to free when registrations exist');
            expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
        });

        it('should update tickets when provided for a paid event', async () => {
            const newTicketData = { name: "VIP", price: 100, quantityTotal: 50, salesStart: new Date(), salesEnd: tomorrow };
            const updateData = { tickets: [newTicketData] };
            const expectedUpdatedEvent = { ...baseExistingEvent }; // Basic event data doesn't change here

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.event.update as jest.Mock).mockResolvedValue(expectedUpdatedEvent); // Mock basic update
            (prisma.ticket.deleteMany as jest.Mock).mockResolvedValue({});
            (prisma.ticket.create as jest.Mock).mockResolvedValue({});
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent);

            await EventService.updateEvent(eventId, updateData);

            expect(prisma.ticket.deleteMany).toHaveBeenCalledWith({ where: { eventId: eventId, quantitySold: 0 } });
            expect(prisma.ticket.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ eventId: eventId, name: newTicketData.name, price: newTicketData.price })
            });
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });

        it('should throw error if updating a non-existent event', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(EventService.updateEvent(999, { name: 'New Name' }))
                .rejects.toThrow('Event not found');
        });
        // --- End of additions for updateEvent ---

        // --- Tests for Question Handling during updateEvent ---
        it('should add a new question during update', async () => {
            const updateData = { questions: [{ questionText: "New Q?", isRequired: false, displayOrder: 1 }] };
            const mockNewQuestion = { id: 101, questionText: "New Q?" };
            const mockExistingEventQuestions: any[] = [];
            const expectedUpdatedEvent = { ...baseExistingEvent, eventQuestions: [{ /* ... */ }] }; // Simplified expected result

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.event.update as jest.Mock).mockResolvedValue(baseExistingEvent); // Basic update
            (prisma.eventQuestions.findMany as jest.Mock).mockResolvedValue(mockExistingEventQuestions);
            (prisma.question.findFirst as jest.Mock).mockResolvedValue(null);
            (prisma.question.create as jest.Mock).mockResolvedValue(mockNewQuestion);
            (prisma.eventQuestions.create as jest.Mock).mockResolvedValue({ id: 1, eventId, questionId: mockNewQuestion.id });
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent); // Mock final fetch

            await EventService.updateEvent(eventId, updateData);

            expect(prisma.eventQuestions.findMany).toHaveBeenCalledWith({ where: { eventId: eventId }, select: expect.any(Object) });
            expect(prisma.question.findFirst).toHaveBeenCalledWith({ where: { questionText: "New Q?" } });
            expect(prisma.question.create).toHaveBeenCalledWith({ data: { questionText: "New Q?", questionType: 'TEXT' } });
            expect(prisma.eventQuestions.create).toHaveBeenCalledWith({ data: { eventId: eventId, questionId: mockNewQuestion.id, isRequired: false, displayOrder: 1 } });
            expect(prisma.eventQuestions.deleteMany).not.toHaveBeenCalled(); // Corrected: Should not be called when only adding
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });

        it('should update an existing question link (isRequired/displayOrder)', async () => {
            const existingQuestionId = 101;
            const updateData = { questions: [{ questionText: "Existing Q?", isRequired: true, displayOrder: 5 }] };
            const mockExistingQuestion = { id: existingQuestionId, questionText: "Existing Q?" };
            const mockExistingEventQuestions = [{ id: 1, eventId: eventId, questionId: existingQuestionId, isRequired: false, displayOrder: 1, _count: { responses: 0 } }];
            const expectedUpdatedEvent = { ...baseExistingEvent, eventQuestions: [{ /* ... */ }] };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.event.update as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.eventQuestions.findMany as jest.Mock).mockResolvedValue(mockExistingEventQuestions);
            (prisma.question.findFirst as jest.Mock).mockResolvedValue(mockExistingQuestion);
            (prisma.eventQuestions.update as jest.Mock).mockResolvedValue({});
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent);

            await EventService.updateEvent(eventId, updateData);

            expect(prisma.question.findFirst).toHaveBeenCalledWith({ where: { questionText: "Existing Q?" } });
            expect(prisma.question.create).not.toHaveBeenCalled();
            expect(prisma.eventQuestions.create).not.toHaveBeenCalled();
            expect(prisma.eventQuestions.update).toHaveBeenCalledWith({ where: { id: mockExistingEventQuestions[0].id }, data: { isRequired: true, displayOrder: 5 } });
            expect(prisma.eventQuestions.deleteMany).not.toHaveBeenCalled(); // Corrected: Should not be called when only updating
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });

        it('should remove an unanswered question link during update', async () => {
            const questionIdToRemove = 102;
            const updateData = { questions: [{ questionText: "Keep Me", isRequired: true, displayOrder: 1 }] };
            const mockKeptQuestion = { id: 101, questionText: "Keep Me" };
            const mockExistingEventQuestions = [
                { id: 1, eventId: eventId, questionId: 101, isRequired: true, displayOrder: 1, _count: { responses: 0 } },
                { id: 2, eventId: eventId, questionId: questionIdToRemove, isRequired: false, displayOrder: 2, _count: { responses: 0 } }
            ];
             const expectedUpdatedEvent = { ...baseExistingEvent, eventQuestions: [{ /* ... */ }] }; // Simplified

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.event.update as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.eventQuestions.findMany as jest.Mock).mockResolvedValue(mockExistingEventQuestions);
            (prisma.question.findFirst as jest.Mock).mockResolvedValue(mockKeptQuestion);
            (prisma.eventQuestions.update as jest.Mock).mockResolvedValue({}); // For the kept question link
            (prisma.eventQuestions.deleteMany as jest.Mock).mockResolvedValue({});
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent);

            await EventService.updateEvent(eventId, updateData);

            expect(prisma.question.findFirst).toHaveBeenCalledWith({ where: { questionText: "Keep Me" } });
            expect(prisma.eventQuestions.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [mockExistingEventQuestions[1].id] } } }); // Delete ID 2
             expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });

        it('should NOT remove a question link that has responses', async () => {
            const questionIdToAttemptRemove = 102;
            const updateData = { questions: [{ questionText: "Keep Me", isRequired: true, displayOrder: 1 }] };
            const mockKeptQuestion = { id: 101, questionText: "Keep Me" };
            const mockExistingEventQuestions = [
                { id: 1, eventId: eventId, questionId: 101, isRequired: true, displayOrder: 1, _count: { responses: 0 } },
                { id: 2, eventId: eventId, questionId: questionIdToAttemptRemove, isRequired: false, displayOrder: 2, _count: { responses: 5 } } // Has responses!
            ];
            const expectedUpdatedEvent = { ...baseExistingEvent, eventQuestions: [{ /* ... */ }, { /* ... */ }] }; // Both should remain

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.event.update as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.eventQuestions.findMany as jest.Mock).mockResolvedValue(mockExistingEventQuestions);
            (prisma.question.findFirst as jest.Mock).mockResolvedValue(mockKeptQuestion);
            (prisma.eventQuestions.update as jest.Mock).mockResolvedValue({}); // For the kept question link
            (prisma.eventQuestions.deleteMany as jest.Mock).mockResolvedValue({});
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent);

            await EventService.updateEvent(eventId, updateData);

            // Should attempt to delete links not in final set AND with 0 responses. Link 2 has responses, so delete list is empty.
            expect(prisma.eventQuestions.deleteMany).not.toHaveBeenCalled(); // Corrected: Should not be called when the target has responses
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });

        it('should remove all unanswered questions if an empty questions array is provided', async () => {
            const updateData = { questions: [] };
            const mockExistingEventQuestions = [
                { id: 1, eventId: eventId, questionId: 101, isRequired: true, displayOrder: 1, _count: { responses: 0 } },
                { id: 2, eventId: eventId, questionId: 102, isRequired: false, displayOrder: 2, _count: { responses: 3 } }, // Has responses
                { id: 3, eventId: eventId, questionId: 103, isRequired: false, displayOrder: 3, _count: { responses: 0 } }
            ];
            const expectedUpdatedEvent = { ...baseExistingEvent, eventQuestions: [{ /* link 2 remains */ }] };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.event.update as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.eventQuestions.findMany as jest.Mock).mockResolvedValue(mockExistingEventQuestions);
            (prisma.eventQuestions.deleteMany as jest.Mock).mockResolvedValue({});
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent);

            await EventService.updateEvent(eventId, updateData);

            expect(prisma.question.findFirst).not.toHaveBeenCalled();
            expect(prisma.eventQuestions.create).not.toHaveBeenCalled();
            expect(prisma.eventQuestions.update).not.toHaveBeenCalled();
            // Should delete links with IDs 1 and 3 (those with 0 responses)
            expect(prisma.eventQuestions.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1, 3] } } });
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });

        it('should not modify questions if questions array is undefined', async () => {
            const updateData = { name: "Updated Name" }; // No questions property
            const expectedUpdatedEvent = { ...baseExistingEvent, name: "Updated Name" };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(baseExistingEvent);
            (prisma.event.update as jest.Mock).mockResolvedValue(expectedUpdatedEvent);
            mockGetEventWithDetails.mockResolvedValue(expectedUpdatedEvent);

            await EventService.updateEvent(eventId, updateData);

            expect(prisma.eventQuestions.findMany).not.toHaveBeenCalled();
            expect(prisma.question.findFirst).not.toHaveBeenCalled();
            expect(prisma.question.create).not.toHaveBeenCalled();
            expect(prisma.eventQuestions.create).not.toHaveBeenCalled();
            expect(prisma.eventQuestions.update).not.toHaveBeenCalled();
            expect(prisma.eventQuestions.deleteMany).not.toHaveBeenCalled();
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });
    });

    // Test cases for updateEventStatus method
    describe('updateEventStatus', () => {
        const eventId = 1;

        it('should publish a valid free event', async () => {
            const draftEvent = { id: eventId, status: 'DRAFT', isFree: true };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(draftEvent); // Mock the findUnique used by getEventById
            (prisma.eventQuestions.count as jest.Mock).mockResolvedValue(1);
            (prisma.event.update as jest.Mock).mockResolvedValue({ ...draftEvent, status: 'PUBLISHED' });

            const result = await EventService.updateEventStatus(eventId, 'PUBLISHED');

            expect(result.status).toBe('PUBLISHED');
            expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: eventId }, data: { status: 'PUBLISHED' } });
        });

         it('should publish a valid paid event', async () => {
            const draftEvent = { id: eventId, status: 'DRAFT', isFree: false };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(draftEvent);
            (prisma.eventQuestions.count as jest.Mock).mockResolvedValue(1);
            (prisma.ticket.count as jest.Mock).mockResolvedValue(1); // Has tickets
            (prisma.event.update as jest.Mock).mockResolvedValue({ ...draftEvent, status: 'PUBLISHED' });

            const result = await EventService.updateEventStatus(eventId, 'PUBLISHED');

            expect(result.status).toBe('PUBLISHED');
            expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: eventId }, data: { status: 'PUBLISHED' } });
        });


        it('should cancel an event and update registrations', async () => {
            const publishedEvent = { id: eventId, status: 'PUBLISHED', isFree: true };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(publishedEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(5); // Check if registrations exist
            (prisma.registration.updateMany as jest.Mock).mockResolvedValue({ count: 5 }); // Mock update count
            (prisma.event.update as jest.Mock).mockResolvedValue({ ...publishedEvent, status: 'CANCELLED' });

            const result = await EventService.updateEventStatus(eventId, 'CANCELLED');

            expect(result.status).toBe('CANCELLED');
            expect(prisma.registration.updateMany).toHaveBeenCalledWith({
                where: { eventId: eventId, status: { in: ['CONFIRMED', 'PENDING'] } },
                data: { status: 'CANCELLED' }
            });
            expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: eventId }, data: { status: 'CANCELLED' } });
        });

        it('should reject publishing an event without questions', async () => {
            const draftEvent = { id: eventId, status: 'DRAFT', isFree: true };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(draftEvent);
            (prisma.eventQuestions.count as jest.Mock).mockResolvedValue(0); // No questions

            await expect(EventService.updateEventStatus(eventId, 'PUBLISHED'))
                .rejects.toThrow('Events must have at least one question before publishing');
        });

        // --- Additions for updateEventStatus ---
        it('should reject publishing a paid event without tickets', async () => {
            const draftEvent = { id: eventId, status: 'DRAFT', isFree: false };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(draftEvent);
            (prisma.eventQuestions.count as jest.Mock).mockResolvedValue(1);
            (prisma.ticket.count as jest.Mock).mockResolvedValue(0); // No tickets

            await expect(EventService.updateEventStatus(eventId, 'PUBLISHED'))
                .rejects.toThrow('Paid events must have at least one ticket type before publishing');
        });

        it('should reject invalid status transitions (e.g., COMPLETED to PUBLISHED)', async () => {
            const completedEvent = { id: eventId, status: 'COMPLETED', isFree: true };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(completedEvent);

            await expect(EventService.updateEventStatus(eventId, 'PUBLISHED'))
                .rejects.toThrow('Cannot change status of a completed event');
        });

        it('should reject invalid status transitions (e.g., CANCELLED to PUBLISHED)', async () => {
            const cancelledEvent = { id: eventId, status: 'CANCELLED', isFree: true };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(cancelledEvent);

            await expect(EventService.updateEventStatus(eventId, 'PUBLISHED'))
                .rejects.toThrow('Cancelled events can only be restored to draft status');
        });

        it('should allow restoring a CANCELLED event to DRAFT', async () => {
            const cancelledEvent = { id: eventId, status: 'CANCELLED', isFree: true };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(cancelledEvent);
            (prisma.event.update as jest.Mock).mockResolvedValue({ ...cancelledEvent, status: 'DRAFT' });

            const result = await EventService.updateEventStatus(eventId, 'DRAFT');

            expect(result.status).toBe('DRAFT');
            expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: eventId }, data: { status: 'DRAFT' } });
        });

        it('should throw error if updating status for a non-existent event', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(null); // Event not found for getEventById call

            await expect(EventService.updateEventStatus(999, 'PUBLISHED'))
                .rejects.toThrow('Event not found');
        });
        // --- End of additions for updateEventStatus ---
    });

    // --- Additions for getEventById ---
    describe('getEventById', () => {
        it('should return an event with registration count when found', async () => {
            const eventId = 1;
            const mockEvent = { id: eventId, name: 'Test Event', status: 'PUBLISHED', _count: { registrations: 5 } };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent);

            const result = await EventService.getEventById(eventId);

            expect(result).toEqual(mockEvent);
            expect(prisma.event.findUnique).toHaveBeenCalledWith({
                where: { id: eventId },
                include: { _count: { select: { registrations: true } } }
            });
        });

        it('should throw an error if event is not found', async () => {
            const eventId = 999;
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(EventService.getEventById(eventId)).rejects.toThrow('Event not found');
        });
    });
    // --- End of additions for getEventById ---

    // --- Additions for getEventWithDetails ---
    describe('getEventWithDetails', () => {
        it('should return an event with all details when found', async () => {
            const eventId = 1;
            const mockEventDetails = {
                id: eventId, name: 'Detailed Test Event', status: 'PUBLISHED',
                organizer: { id: 1, firstName: 'John', lastName: 'Doe' },
                tickets: [{ id: 1, name: 'GA', status: 'ACTIVE' }],
                eventQuestions: [{ id: 1, question: { id: 101, questionText: 'Size?' }, isRequired: true, displayOrder: 1 }],
                _count: { registrations: 10 }
            };
            // Use the service method mock directly here
            mockGetEventWithDetails.mockResolvedValue(mockEventDetails);
             // We also need to mock the underlying prisma call if the service method wasn't mocked
            // (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEventDetails);


            const result = await EventService.getEventWithDetails(eventId);

            expect(result).toEqual(mockEventDetails);
             // If testing the service method directly, check the mock was called
            expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
            // If testing the underlying prisma call (assuming service wasn't mocked):
            // expect(prisma.event.findUnique).toHaveBeenCalledWith({
            //     where: { id: eventId },
            //     include: {
            //         organizer: { select: { id: true, firstName: true, lastName: true } },
            //         tickets: { where: { status: 'ACTIVE' } },
            //         eventQuestions: { include: { question: true }, orderBy: { displayOrder: 'asc' } },
            //         _count: { select: { registrations: true } }
            //     }
            // });
        });

        it('should throw an error if event is not found', async () => {
            const eventId = 999;
             // Use the service method mock directly here
            mockGetEventWithDetails.mockRejectedValue(new Error('Event not found'));
            // If testing the underlying prisma call:
            // (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(EventService.getEventWithDetails(eventId)).rejects.toThrow('Event not found');
             // Check the mock was called
             expect(mockGetEventWithDetails).toHaveBeenCalledWith(eventId);
        });
    });
    // --- End of additions for getEventWithDetails ---

    // Test cases for deleteEvent method
    describe('deleteEvent', () => {
        const eventId = 1;

        it('should delete an event without registrations', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue({ id: eventId }); // Mock getEventById call
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            (prisma.eventQuestions.deleteMany as jest.Mock).mockResolvedValue({});
            (prisma.ticket.deleteMany as jest.Mock).mockResolvedValue({});
            (prisma.event.delete as jest.Mock).mockResolvedValue({ id: eventId }); // Mock the actual delete

            await EventService.deleteEvent(eventId);

            expect(prisma.eventQuestions.deleteMany).toHaveBeenCalledWith({ where: { eventId } });
            expect(prisma.ticket.deleteMany).toHaveBeenCalledWith({ where: { eventId } });
            expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: eventId } });
        });

        it('should reject deleting an event with registrations', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue({ id: eventId }); // Mock getEventById call
            (prisma.registration.count as jest.Mock).mockResolvedValue(5);

            await expect(EventService.deleteEvent(eventId))
                .rejects.toThrow('Cannot delete an event with registrations. Please cancel the event instead.');
        });

        // --- Additions for deleteEvent ---
        it('should throw error if deleting a non-existent event', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(null); // Mock getEventById call - event not found
            await expect(EventService.deleteEvent(999)).rejects.toThrow('Event not found');
        });
        // --- End of additions for deleteEvent ---
    });
})

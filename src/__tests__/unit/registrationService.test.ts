import { RegistrationService } from '../../services/registrationServices';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { RegistrationDto } from '../../types/registrationTypes';
import { JwtPayload } from '../../types/authTypes';
import { UserRole } from '@prisma/client';

// Mock Prisma client
jest.mock('../../config/prisma', () => ({
    prisma: {
        event: {
            findUnique: jest.fn(),
        },
        participant: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        registration: {
            create: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        ticket: {
            findUnique: jest.fn(), // Added for completeness, though event includes tickets
            update: jest.fn(),
        },
        purchase: {
            create: jest.fn(),
        },
        response: {
            create: jest.fn(),
        },
        eventQuestions: {
            // Not directly called, but included in event fetch
        },
        question: {
            // Not directly called, but included in event fetch
        },
        // Updated mock to handle both callback and array patterns
        $transaction: jest.fn().mockImplementation(async (arg) => {
            if (typeof arg === 'function') {
                // Handle callback pattern (used in registerForEvent)
                return arg(prisma);
            } else if (Array.isArray(arg)) {
                // Handle array pattern (used in getRegistrations)
                // Resolve promises based on the mocked functions for findMany, count, etc.
                // This assumes the array contains promises like [findManyPromise, countPromise]
                const results = await Promise.all(arg.map(p => Promise.resolve(p))); // Resolve the mocked promises
                return results;
            }
            throw new Error('Unsupported $transaction argument type');
        }),
    }
}));

// Mock AppError if needed for specific tests, though usually we check if it's thrown
// jest.mock('../../utils/errors');

describe('RegistrationService', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    // --- Test Suite for registerForEvent ---
    describe('registerForEvent', () => {
        const mockFreeEvent = {
            id: 1,
            name: 'Free Community Picnic',
            capacity: 100,
            isFree: true,
            startDateTime: new Date('2025-07-01T12:00:00Z'),
            endDateTime: new Date('2025-07-01T15:00:00Z'),
            tickets: [], // No tickets for free event
            eventQuestions: [
                { id: 1, eventId: 1, questionId: 101, isRequired: true, displayOrder: 1, question: { id: 101, questionText: 'Dietary Restrictions?' } },
                { id: 2, eventId: 1, questionId: 102, isRequired: false, displayOrder: 2, question: { id: 102, questionText: 'Bringing guests?' } },
            ],
        };

        const mockPaidEvent = {
            id: 2,
            name: 'Paid Workshop',
            capacity: 50,
            isFree: false,
            startDateTime: new Date('2025-08-01T09:00:00Z'),
            endDateTime: new Date('2025-08-01T17:00:00Z'),
            tickets: [
                // Mock price as an object with toNumber() method to simulate Prisma Decimal
                { id: 201, eventId: 2, name: 'Standard Ticket', price: { toNumber: () => 50.00 }, quantityTotal: 40, quantitySold: 10, salesStart: new Date(), salesEnd: new Date('2025-07-31T23:59:59Z'), status: 'ACTIVE' },
                { id: 202, eventId: 2, name: 'VIP Ticket', price: { toNumber: () => 100.00 }, quantityTotal: 10, quantitySold: 5, salesStart: new Date(), salesEnd: new Date('2025-07-31T23:59:59Z'), status: 'ACTIVE' },
            ],
            eventQuestions: [
                { id: 3, eventId: 2, questionId: 201, isRequired: true, displayOrder: 1, question: { id: 201, questionText: 'Company Name?' } },
            ],
        };

        const baseRegistrationData: Omit<RegistrationDto, 'eventId' | 'ticketId' | 'quantity'> = {
            participant: {
                email: 'test@example.com',
                firstName: 'Test',
                lastName: 'User',
            },
            responses: [
                { questionId: 101, responseText: 'None' }, // For free event
                { questionId: 201, responseText: 'Test Corp' }, // For paid event
            ],
        };

        const mockParticipant = {
            id: 1,
            userId: null, // Assume guest for now
            ...baseRegistrationData.participant,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        it('should register successfully for a FREE event and set status to CONFIRMED', async () => {
            const registrationInput: RegistrationDto = {
                ...baseRegistrationData,
                eventId: mockFreeEvent.id,
                responses: [{ questionId: 101, responseText: 'None' }], // Only required question for free event
            };
            const expectedRegistration = { id: 1, eventId: mockFreeEvent.id, participantId: mockParticipant.id, status: 'CONFIRMED' };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0); // Event not full
            (prisma.participant.findUnique as jest.Mock).mockResolvedValue(null); // New participant
            (prisma.participant.create as jest.Mock).mockResolvedValue(mockParticipant);
            (prisma.registration.create as jest.Mock).mockResolvedValue(expectedRegistration);
            (prisma.response.create as jest.Mock).mockResolvedValue({}); // Mock response creation
            // Mock the final fetch within the transaction
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue({ ...expectedRegistration, participant: mockParticipant, event: mockFreeEvent, purchase: null, responses: [] });

            const result = await RegistrationService.registerForEvent(registrationInput);

            expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: mockFreeEvent.id }, include: expect.any(Object) });
            expect(prisma.registration.count).toHaveBeenCalledWith({ where: { eventId: mockFreeEvent.id } });
            expect(prisma.participant.findUnique).toHaveBeenCalledWith({ where: { email: registrationInput.participant.email } });
            expect(prisma.participant.create).toHaveBeenCalled();
            expect(prisma.registration.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    eventId: mockFreeEvent.id,
                    participantId: mockParticipant.id,
                    status: 'CONFIRMED', // Verify status
                }),
            });
            expect(prisma.purchase.create).not.toHaveBeenCalled(); // No purchase for free event
            expect(prisma.ticket.update).not.toHaveBeenCalled(); // No ticket update for free event
            expect(prisma.response.create).toHaveBeenCalledTimes(1);
            expect(result!.status).toBe('CONFIRMED'); // Added non-null assertion
        });

        it('should register successfully for a PAID event and set status to PENDING', async () => {
            const registrationInput: RegistrationDto = {
                ...baseRegistrationData,
                eventId: mockPaidEvent.id,
                ticketId: 201, // Standard Ticket
                quantity: 1,
                responses: [{ questionId: 201, responseText: 'Test Corp' }], // Only required question for paid event
            };
            const expectedRegistration = { id: 2, eventId: mockPaidEvent.id, participantId: mockParticipant.id, status: 'PENDING' };
            // Adjust expectedPurchase unitPrice to match the mock structure if needed, though comparison might work
            const expectedPurchase = { id: 1, registrationId: 2, ticketId: 201, quantity: 1, unitPrice: mockPaidEvent.tickets[0].price, totalPrice: 50.00 };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0); // Event not full
            (prisma.participant.findUnique as jest.Mock).mockResolvedValue(mockParticipant); // Existing participant
            (prisma.registration.create as jest.Mock).mockResolvedValue(expectedRegistration);
            (prisma.purchase.create as jest.Mock).mockResolvedValue(expectedPurchase);
            (prisma.ticket.update as jest.Mock).mockResolvedValue({}); // Mock ticket update
            (prisma.response.create as jest.Mock).mockResolvedValue({}); // Mock response creation
            // Mock the final fetch within the transaction
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue({ ...expectedRegistration, participant: mockParticipant, event: mockPaidEvent, purchase: expectedPurchase, responses: [] });


            const result = await RegistrationService.registerForEvent(registrationInput);

            expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: mockPaidEvent.id }, include: expect.any(Object) });
            expect(prisma.registration.count).toHaveBeenCalledWith({ where: { eventId: mockPaidEvent.id } });
            expect(prisma.participant.findUnique).toHaveBeenCalledWith({ where: { email: registrationInput.participant.email } });
            expect(prisma.participant.create).not.toHaveBeenCalled(); // Participant exists
            expect(prisma.registration.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    eventId: mockPaidEvent.id,
                    participantId: mockParticipant.id,
                    status: 'PENDING', // Verify status
                }),
            });
            expect(prisma.purchase.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    registrationId: expectedRegistration.id,
                    ticketId: registrationInput.ticketId,
                    quantity: registrationInput.quantity,
                }),
            });
            expect(prisma.ticket.update).toHaveBeenCalledWith({
                where: { id: registrationInput.ticketId },
                data: { quantitySold: { increment: registrationInput.quantity } },
            });
            expect(prisma.response.create).toHaveBeenCalledTimes(1);
            expect(result!.status).toBe('PENDING'); // Added non-null assertion
        });

        it('should throw error if event is not found', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: 999 };

            await expect(RegistrationService.registerForEvent(registrationInput))
                .rejects.toThrow('Event not found');
        });

        it('should throw error if event is full', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(mockFreeEvent.capacity); // Event is full
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockFreeEvent.id, responses: [{ questionId: 101, responseText: 'None' }] };

            await expect(RegistrationService.registerForEvent(registrationInput))
                .rejects.toThrow('Event is full');
        });

        it('should throw error for paid event if ticketId is missing', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockPaidEvent.id, quantity: 1, responses: [{ questionId: 201, responseText: 'Test Corp' }] }; // Missing ticketId

            await expect(RegistrationService.registerForEvent(registrationInput))
                .rejects.toThrow('Ticket and quantity are required for paid events');
        });

        it('should throw error for paid event if ticket is not found in event data', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockPaidEvent.id, ticketId: 999, quantity: 1, responses: [{ questionId: 201, responseText: 'Test Corp' }] }; // Invalid ticketId

            await expect(RegistrationService.registerForEvent(registrationInput))
                .rejects.toThrow('Ticket not found');
        });

        it('should throw error for paid event if ticket quantity is not available', async () => {
            const soldOutTicketEvent = {
                ...mockPaidEvent,
                tickets: [{ ...mockPaidEvent.tickets[0], quantitySold: mockPaidEvent.tickets[0].quantityTotal }] // Ticket 201 is sold out
            };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(soldOutTicketEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockPaidEvent.id, ticketId: 201, quantity: 1, responses: [{ questionId: 201, responseText: 'Test Corp' }] };

            await expect(RegistrationService.registerForEvent(registrationInput))
                .rejects.toThrow('Selected ticket quantity not available');
        });

        it('should throw error if a required question response is missing', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockFreeEvent.id, responses: [] }; // Missing required response for Q101

            await expect(RegistrationService.registerForEvent(registrationInput))
                .rejects.toThrow('Response required for question: "Dietary Restrictions?"');
        });

        it('should throw error if a required question response is empty', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockFreeEvent.id, responses: [{ questionId: 101, responseText: '  ' }] }; // Empty required response

            await expect(RegistrationService.registerForEvent(registrationInput))
                .rejects.toThrow('Response cannot be empty for required question: "Dietary Restrictions?"');
        });

        it('should throw error if an invalid question ID is provided', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockFreeEvent.id, responses: [{ questionId: 101, responseText: 'None' }, { questionId: 999, responseText: 'Invalid' }] }; // Invalid QID 999

            await expect(RegistrationService.registerForEvent(registrationInput))
                .rejects.toThrow('Invalid question ID provided: 999');
        });

    });

    // --- Test Suite for getRegistrations ---
    describe('getRegistrations', () => {
        const mockUser: JwtPayload = { userId: 1, role: UserRole.PARTICIPANT };
        const mockOrganizer: JwtPayload = { userId: 2, role: UserRole.ORGANIZER };
        const mockAdmin: JwtPayload = { userId: 3, role: UserRole.ADMIN };

        const mockRegistrations = [
            { id: 1, eventId: 10, userId: 1, participant: { id: 1 }, event: { id: 10, organiserId: 2 } },
            { id: 2, eventId: 10, userId: 4, participant: { id: 4 }, event: { id: 10, organiserId: 2 } },
            { id: 3, eventId: 11, userId: 1, participant: { id: 1 }, event: { id: 11, organiserId: 5 } },
        ];

        it('should allow ADMIN to get all registrations', async () => {
            (prisma.registration.findMany as jest.Mock).mockResolvedValue(mockRegistrations);
            (prisma.registration.count as jest.Mock).mockResolvedValue(mockRegistrations.length);

            const result = await RegistrationService.getRegistrations({ page: 1, limit: 10 }, mockAdmin);

            expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
            expect(result.registrations).toHaveLength(3);
        });

        it('should allow ADMIN to filter by eventId', async () => {
            (prisma.registration.findMany as jest.Mock).mockResolvedValue([mockRegistrations[0], mockRegistrations[1]]);
            (prisma.registration.count as jest.Mock).mockResolvedValue(2);

            const result = await RegistrationService.getRegistrations({ page: 1, limit: 10, eventId: 10 }, mockAdmin);

            expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: 10 } }));
            expect(result.registrations).toHaveLength(2);
        });

        it('should allow ORGANIZER to get registrations for their event', async () => {
            // Mock event fetch for organizer check
            (prisma.event.findUnique as jest.Mock).mockResolvedValue({ organiserId: mockOrganizer.userId });
            (prisma.registration.findMany as jest.Mock).mockResolvedValue([mockRegistrations[0], mockRegistrations[1]]);
            (prisma.registration.count as jest.Mock).mockResolvedValue(2);

            const result = await RegistrationService.getRegistrations({ page: 1, limit: 10, eventId: 10 }, mockOrganizer);

            expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: 10 }, select: { organiserId: true } });
            expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: 10 } }));
            expect(result.registrations).toHaveLength(2);
        });

        it('should restrict PARTICIPANT to only their own registrations when no filter', async () => {
            (prisma.registration.findMany as jest.Mock).mockResolvedValue([mockRegistrations[0], mockRegistrations[2]]);
            (prisma.registration.count as jest.Mock).mockResolvedValue(2);

            const result = await RegistrationService.getRegistrations({ page: 1, limit: 10 }, mockUser);

            expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: mockUser.userId } }));
            expect(result.registrations).toHaveLength(2);
        });

        it('should restrict PARTICIPANT to only their own registrations when filtering by eventId', async () => {
            // Mock event fetch for organizer check (will fail for participant)
            (prisma.event.findUnique as jest.Mock).mockResolvedValue({ organiserId: 5 }); // Not the participant's event
            (prisma.registration.findMany as jest.Mock).mockResolvedValue([mockRegistrations[2]]); // Only registration 3 matches userId and eventId
            (prisma.registration.count as jest.Mock).mockResolvedValue(1);

            const result = await RegistrationService.getRegistrations({ page: 1, limit: 10, eventId: 11 }, mockUser);

            expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: 11 }, select: { organiserId: true } });
            // Should filter by BOTH eventId and userId
            expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: 11, userId: mockUser.userId } }));
            expect(result.registrations).toHaveLength(1);
            expect(result.registrations[0].id).toBe(3);
        });

        it('should throw ForbiddenError if PARTICIPANT tries to filter by another userId', async () => {
            await expect(RegistrationService.getRegistrations({ page: 1, limit: 10, userId: 4 }, mockUser))
                .rejects.toThrow(AppError); // Check for AppError specifically if possible, or just toThrow()
            await expect(RegistrationService.getRegistrations({ page: 1, limit: 10, userId: 4 }, mockUser))
                .rejects.toHaveProperty('statusCode', 403);
        });

    });

    // --- Test Suite for getRegistrationById ---
    describe('getRegistrationById', () => {
        const mockUser: JwtPayload = { userId: 1, role: UserRole.PARTICIPANT };
        const mockOrganizer: JwtPayload = { userId: 2, role: UserRole.ORGANIZER };
        const mockAdmin: JwtPayload = { userId: 3, role: UserRole.ADMIN };

        const mockRegistration = {
            id: 101,
            userId: 1, // Belongs to mockUser
            eventId: 20,
            participant: { id: 1 },
            event: { id: 20, organiserId: 2 }, // Organized by mockOrganizer
            // ... other fields
        };

        it('should allow ADMIN to get any registration', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistration);
            const result = await RegistrationService.getRegistrationById(101, mockAdmin);
            expect(prisma.registration.findUnique).toHaveBeenCalledWith({ where: { id: 101 }, include: expect.any(Object) });
            expect(result).toEqual(mockRegistration);
        });

        it('should allow OWNER to get their registration', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistration);
            const result = await RegistrationService.getRegistrationById(101, mockUser);
            expect(prisma.registration.findUnique).toHaveBeenCalledWith({ where: { id: 101 }, include: expect.any(Object) });
            expect(result).toEqual(mockRegistration);
        });

        it('should allow EVENT ORGANIZER to get registration for their event', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistration);
            const result = await RegistrationService.getRegistrationById(101, mockOrganizer);
            expect(prisma.registration.findUnique).toHaveBeenCalledWith({ where: { id: 101 }, include: expect.any(Object) });
            expect(result).toEqual(mockRegistration);
        });

        it('should throw ForbiddenError if non-owner/non-organizer/non-admin tries to access', async () => {
            const otherUser: JwtPayload = { userId: 99, role: UserRole.PARTICIPANT };
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistration);

            await expect(RegistrationService.getRegistrationById(101, otherUser))
                .rejects.toThrow(AppError);
            await expect(RegistrationService.getRegistrationById(101, otherUser))
                .rejects.toHaveProperty('statusCode', 403);
        });

        it('should throw NotFoundError if registration does not exist', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(RegistrationService.getRegistrationById(999, mockAdmin))
                .rejects.toThrow(AppError);
            await expect(RegistrationService.getRegistrationById(999, mockAdmin))
                .rejects.toHaveProperty('statusCode', 404);
        });
    });
});

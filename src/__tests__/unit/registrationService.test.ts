import { RegistrationService } from '../../services/registrationServices';
import { prisma } from '../../config/prisma';
import { AppError, ValidationError, AuthorizationError, NotFoundError } from '../../utils/errors'; 
import { RegistrationDto } from '../../types/registrationTypes';
import { JwtPayload } from '../../types/authTypes';
import { UserRole, RegistrationStatus } from '@prisma/client';

// Mock Prisma client
jest.mock('../../config/prisma', () => {
    const mockPrismaInside = {
        event: {
            findUnique: jest.fn(),
            count: jest.fn()
        },
        participant: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        registration: {
            create: jest.fn(),
            findUnique: jest.fn(),
            findUniqueOrThrow: jest.fn(), 
            findMany: jest.fn(),
            count: jest.fn(),
            update: jest.fn(),
        },
        ticket: {
            findUnique: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            deleteMany: jest.fn(),
            updateMany: jest.fn(),
        },
        purchase: {
            create: jest.fn(),
        },
        response: {
            create: jest.fn(),
        },
        eventQuestions: {},
        question: {},
        user: {
             findUnique: jest.fn(),
        },
        $transaction: jest.fn().mockImplementation(async (arg) => {
            if (typeof arg === 'function') {
                return arg(mockPrismaInside);
            } else if (Array.isArray(arg)) {
                const results = await Promise.all(arg.map(p => Promise.resolve(p)));
                return results;
            }
            throw new Error('Unsupported $transaction argument type');
        }),
    };
    return { prisma: mockPrismaInside };
});

// Mock ParticipantService
jest.mock('../../services/participantServices', () => ({
    ParticipantService: {
        findOrCreateParticipant: jest.fn() // Define the mock function here
    }
}));

// Import the mocked service to access the mock function if needed for setup
import { ParticipantService } from '../../services/participantServices';
const mockFindOrCreateParticipant = ParticipantService.findOrCreateParticipant as jest.Mock;


describe('RegistrationService', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        // Default mock implementation for findOrCreateParticipant
        mockFindOrCreateParticipant.mockResolvedValue({ id: 1, userId: null, email: 'test@example.com', firstName: 'Test', lastName: 'User' });
    });

    // --- Test Suite for registerForEvent ---
    describe('registerForEvent', () => {
        const mockFreeEvent = {
            id: 1, name: 'Free Picnic', capacity: 100, isFree: true, status: 'PUBLISHED',
            startDateTime: new Date('2025-07-01T12:00:00Z'), endDateTime: new Date('2025-07-01T15:00:00Z'),
            tickets: [],
            eventQuestions: [ { id: 1, eventId: 1, questionId: 101, isRequired: true, displayOrder: 1, question: { id: 101, questionText: 'Dietary Restrictions?' } } ]
        };
        const mockPaidEvent = {
            id: 2, name: 'Paid Workshop', capacity: 50, isFree: false, status: 'PUBLISHED',
            startDateTime: new Date('2025-08-01T09:00:00Z'), endDateTime: new Date('2025-08-01T17:00:00Z'),
            tickets: [ { id: 201, eventId: 2, name: 'Standard Ticket', price: { toNumber: () => 50.00 }, quantityTotal: 40, quantitySold: 10, salesStart: new Date(), salesEnd: new Date('2025-07-31T23:59:59Z'), status: 'ACTIVE' } ],
            eventQuestions: [ { id: 3, eventId: 2, questionId: 201, isRequired: true, displayOrder: 1, question: { id: 201, questionText: 'Company Name?' } } ]
        };
        const baseRegistrationData: Omit<RegistrationDto, 'eventId' | 'ticketId' | 'quantity'> = {
            participant: { email: 'test@example.com', firstName: 'Test', lastName: 'User' },
            responses: [ { questionId: 101, responseText: 'None' }, { questionId: 201, responseText: 'Test Corp' } ]
        };
        const mockParticipant = { id: 1, userId: null, ...baseRegistrationData.participant, createdAt: new Date(), updatedAt: new Date() };

        it('should register successfully for a FREE event and set status to CONFIRMED', async () => {
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockFreeEvent.id, responses: [{ questionId: 101, responseText: 'None' }] };
            const expectedRegistration = { id: 1, eventId: mockFreeEvent.id, participantId: mockParticipant.id, status: RegistrationStatus.CONFIRMED };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            (prisma.registration.create as jest.Mock).mockResolvedValue(expectedRegistration);
            (prisma.response.create as jest.Mock).mockResolvedValue({});
            (prisma.registration.findUniqueOrThrow as jest.Mock).mockResolvedValue({ ...expectedRegistration, participant: mockParticipant, event: mockFreeEvent, purchase: null, responses: [] });

            const result = await RegistrationService.registerForEvent(registrationInput);

            expect(mockFindOrCreateParticipant).toHaveBeenCalledWith(registrationInput.participant, prisma);
            // Corrected assertion to check within the 'data' object
            expect(prisma.registration.create).toHaveBeenCalledWith({
                 data: expect.objectContaining({ status: RegistrationStatus.CONFIRMED })
            });
            expect(prisma.purchase.create).not.toHaveBeenCalled();
            expect(prisma.ticket.update).not.toHaveBeenCalled();
            expect(result.status).toBe(RegistrationStatus.CONFIRMED);
        });

        it('should register successfully for a PAID event and set status to PENDING', async () => {
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockPaidEvent.id, ticketId: 201, quantity: 1, responses: [{ questionId: 201, responseText: 'Test Corp' }] };
            const expectedRegistration = { id: 2, eventId: mockPaidEvent.id, participantId: mockParticipant.id, status: RegistrationStatus.PENDING };
            const expectedPurchase = { id: 1, registrationId: 2, ticketId: 201, quantity: 1, unitPrice: mockPaidEvent.tickets[0].price, totalPrice: 50.00 };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent.tickets[0]);
            (prisma.registration.create as jest.Mock).mockResolvedValue(expectedRegistration);
            (prisma.purchase.create as jest.Mock).mockResolvedValue(expectedPurchase);
            (prisma.ticket.update as jest.Mock).mockResolvedValue({});
            (prisma.response.create as jest.Mock).mockResolvedValue({});
            (prisma.registration.findUniqueOrThrow as jest.Mock).mockResolvedValue({ ...expectedRegistration, participant: mockParticipant, event: mockPaidEvent, purchase: expectedPurchase, responses: [] });

            const result = await RegistrationService.registerForEvent(registrationInput);

            expect(mockFindOrCreateParticipant).toHaveBeenCalledWith(registrationInput.participant, prisma);
             // Corrected assertion to check within the 'data' object
            expect(prisma.registration.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ status: RegistrationStatus.PENDING })
            });
            expect(prisma.purchase.create).toHaveBeenCalled();
            expect(prisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({ data: { quantitySold: { increment: 1 } } }));
            expect(result.status).toBe(RegistrationStatus.PENDING);
        });

         it('should throw error if event is not found', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: 999, responses: [] };
            await expect(RegistrationService.registerForEvent(registrationInput)).rejects.toThrow(NotFoundError);
        });
         it('should throw error if event is full', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(mockFreeEvent.capacity);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockFreeEvent.id, responses: [{ questionId: 101, responseText: 'None' }] };
            await expect(RegistrationService.registerForEvent(registrationInput)).rejects.toThrow('Event is full');
        });
         it('should throw error for paid event if ticketId is missing', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockPaidEvent.id, quantity: 1, responses: [{ questionId: 201, responseText: 'Test Corp' }] };
            await expect(RegistrationService.registerForEvent(registrationInput)).rejects.toThrow('Ticket ID and quantity are required for paid events');
        });
         it('should throw error for paid event if ticket is not found in event data', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockPaidEvent.id, ticketId: 999, quantity: 1, responses: [{ questionId: 201, responseText: 'Test Corp' }] };
            await expect(RegistrationService.registerForEvent(registrationInput)).rejects.toThrow('Ticket not found');
        });
         it('should throw error for paid event if ticket quantity is not available', async () => {
            const soldOutTicketEvent = { ...mockPaidEvent, tickets: [{ ...mockPaidEvent.tickets[0], quantitySold: mockPaidEvent.tickets[0].quantityTotal }] };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(soldOutTicketEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockPaidEvent.id, ticketId: 201, quantity: 1, responses: [{ questionId: 201, responseText: 'Test Corp' }] };
            await expect(RegistrationService.registerForEvent(registrationInput)).rejects.toThrow('Selected ticket quantity not available');
        });
         it('should throw error if a required question response is missing', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockFreeEvent.id, responses: [] };
            await expect(RegistrationService.registerForEvent(registrationInput)).rejects.toThrow('Response required for question: "Dietary Restrictions?"');
        });
         it('should throw error if a required question response is empty', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockFreeEvent.id, responses: [{ questionId: 101, responseText: '  ' }] };
            await expect(RegistrationService.registerForEvent(registrationInput)).rejects.toThrow('Response cannot be empty for required question: "Dietary Restrictions?"');
        });
         it('should throw error if an invalid question ID is provided', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: RegistrationDto = { ...baseRegistrationData, eventId: mockFreeEvent.id, responses: [{ questionId: 101, responseText: 'None' }, { questionId: 999, responseText: 'Invalid' }] };
            await expect(RegistrationService.registerForEvent(registrationInput)).rejects.toThrow('Invalid question ID provided: 999');
        });
    });

    // --- Test Suite for getRegistrations ---
    describe('getRegistrations', () => {
        const mockUser: JwtPayload = { userId: 1, role: UserRole.PARTICIPANT };
        const mockOrganizer: JwtPayload = { userId: 2, role: UserRole.ORGANIZER };
        const mockAdmin: JwtPayload = { userId: 3, role: UserRole.ADMIN };
        const mockRegistrations = [ { id: 1, eventId: 10, userId: 1, participant: { id: 1 }, event: { id: 10, organiserId: 2 } }, { id: 2, eventId: 10, userId: 4, participant: { id: 4 }, event: { id: 10, organiserId: 2 } }, { id: 3, eventId: 11, userId: 1, participant: { id: 1 }, event: { id: 11, organiserId: 5 } } ];

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
            (prisma.event.findUnique as jest.Mock).mockResolvedValue({ organiserId: 5 });
            (prisma.registration.findMany as jest.Mock).mockResolvedValue([mockRegistrations[2]]);
            (prisma.registration.count as jest.Mock).mockResolvedValue(1);
            const result = await RegistrationService.getRegistrations({ page: 1, limit: 10, eventId: 11 }, mockUser);
            expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: 11 }, select: { organiserId: true } });
            expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: 11, userId: mockUser.userId } }));
            expect(result.registrations).toHaveLength(1);
        });
        it('should throw ForbiddenError if PARTICIPANT tries to filter by another userId', async () => {
            await expect(RegistrationService.getRegistrations({ page: 1, limit: 10, userId: 4 }, mockUser)).rejects.toThrow(AuthorizationError);
        });
    });

    // --- Test Suite for getRegistrationById ---
    describe('getRegistrationById', () => {
        const mockUser: JwtPayload = { userId: 1, role: UserRole.PARTICIPANT };
        const mockOrganizer: JwtPayload = { userId: 2, role: UserRole.ORGANIZER };
        const mockAdmin: JwtPayload = { userId: 3, role: UserRole.ADMIN };
        const mockRegistration = { id: 101, userId: 1, eventId: 20, participant: { id: 1, userId: 1 }, event: { id: 20, organiserId: 2 } };

        it('should allow ADMIN to get any registration', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistration);
            const result = await RegistrationService.getRegistrationById(101, mockAdmin);
            expect(result).toEqual(mockRegistration);
        });
        it('should allow OWNER to get their registration', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistration);
            const result = await RegistrationService.getRegistrationById(101, mockUser);
            expect(result).toEqual(mockRegistration);
        });
        it('should allow EVENT ORGANIZER to get registration for their event', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistration);
            const result = await RegistrationService.getRegistrationById(101, mockOrganizer);
            expect(result).toEqual(mockRegistration);
        });
        it('should throw ForbiddenError if non-owner/non-organizer/non-admin tries to access', async () => {
            const otherUser: JwtPayload = { userId: 99, role: UserRole.PARTICIPANT };
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistration);
            await expect(RegistrationService.getRegistrationById(101, otherUser)).rejects.toThrow(AuthorizationError);
        });
        it('should throw NotFoundError if registration does not exist', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(RegistrationService.getRegistrationById(999, mockAdmin)).rejects.toThrow(NotFoundError);
        });
    });

    // --- Test Suite for cancelRegistration ---
    describe('cancelRegistration', () => {
        const registrationId = 101;
        const participantUserId = 1;
        const adminUserId = 3;
        const otherUserId = 99;

        const mockUser: JwtPayload = { userId: participantUserId, role: UserRole.PARTICIPANT };
        const mockAdmin: JwtPayload = { userId: adminUserId, role: UserRole.ADMIN };
        const mockOtherUser: JwtPayload = { userId: otherUserId, role: UserRole.PARTICIPANT };

        const mockFreeRegistration = {
            id: registrationId,
            status: RegistrationStatus.CONFIRMED,
            userId: participantUserId, // Linked user
            participant: { userId: participantUserId },
            event: { id: 1, isFree: true },
            purchase: null,
            user: { id: participantUserId } // Added user relation mock
        };

        const mockPaidRegistration = {
            id: registrationId + 1,
            status: RegistrationStatus.PENDING,
            userId: participantUserId, // Linked user
            participant: { userId: participantUserId },
            event: { id: 2, isFree: false },
            purchase: { id: 5, ticketId: 201, quantity: 1, ticket: { id: 201, name: 'Paid Ticket' } },
            user: { id: participantUserId } // Added user relation mock
        };

         const mockCancelledRegistration = {
            ...mockFreeRegistration,
            status: RegistrationStatus.CANCELLED,
        };

        it('should allow owner to cancel their registration (free event)', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockFreeRegistration);
            const updatedReg = { ...mockFreeRegistration, status: RegistrationStatus.CANCELLED };
            (prisma.registration.update as jest.Mock).mockResolvedValue(updatedReg);

            const result = await RegistrationService.cancelRegistration(registrationId, mockUser);

            expect(prisma.registration.findUnique).toHaveBeenCalledWith({ where: { id: registrationId }, include: expect.any(Object) });
            expect(prisma.registration.update).toHaveBeenCalledWith({ where: { id: registrationId }, data: { status: RegistrationStatus.CANCELLED }, include: expect.any(Object) });
            expect(prisma.ticket.update).not.toHaveBeenCalled(); // No ticket decrement for free event
            expect(result.status).toBe(RegistrationStatus.CANCELLED);
        });

        it('should allow owner to cancel their registration (paid event) and decrement ticket count', async () => {
            const regId = mockPaidRegistration.id;
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockPaidRegistration);
            const updatedReg = { ...mockPaidRegistration, status: RegistrationStatus.CANCELLED };
            (prisma.registration.update as jest.Mock).mockResolvedValue(updatedReg);
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockPaidRegistration.purchase.ticket); // Mock ticket find for safety check
            (prisma.ticket.update as jest.Mock).mockResolvedValue({}); // Mock ticket decrement

            const result = await RegistrationService.cancelRegistration(regId, mockUser);

            expect(prisma.registration.findUnique).toHaveBeenCalledWith({ where: { id: regId }, include: expect.any(Object) });
            expect(prisma.registration.update).toHaveBeenCalledWith({ where: { id: regId }, data: { status: RegistrationStatus.CANCELLED }, include: expect.any(Object) });
            expect(prisma.ticket.update).toHaveBeenCalledWith({
                where: { id: mockPaidRegistration.purchase.ticketId },
                data: { quantitySold: { decrement: mockPaidRegistration.purchase.quantity } }
            });
            expect(result.status).toBe(RegistrationStatus.CANCELLED);
        });

         it('should allow admin to cancel any registration (paid event)', async () => {
            const regId = mockPaidRegistration.id;
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockPaidRegistration);
            const updatedReg = { ...mockPaidRegistration, status: RegistrationStatus.CANCELLED };
            (prisma.registration.update as jest.Mock).mockResolvedValue(updatedReg);
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockPaidRegistration.purchase.ticket);
            (prisma.ticket.update as jest.Mock).mockResolvedValue({});

            const result = await RegistrationService.cancelRegistration(regId, mockAdmin); // Admin user

            expect(prisma.registration.update).toHaveBeenCalledWith({ where: { id: regId }, data: { status: RegistrationStatus.CANCELLED }, include: expect.any(Object) });
            expect(prisma.ticket.update).toHaveBeenCalled(); // Ticket count decremented
            expect(result.status).toBe(RegistrationStatus.CANCELLED);
        });

        it('should throw AuthorizationError if user is not owner or admin', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockFreeRegistration); // Owned by user 1

            await expect(RegistrationService.cancelRegistration(registrationId, mockOtherUser)) // Attempted by user 99
                .rejects.toThrow(AuthorizationError);
             await expect(RegistrationService.cancelRegistration(registrationId, mockOtherUser))
                .rejects.toThrow('Forbidden: You do not have permission to cancel this registration.');
            expect(prisma.registration.update).not.toHaveBeenCalled();
        });

        it('should throw NotFoundError if registration does not exist', async () => {
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(RegistrationService.cancelRegistration(999, mockAdmin))
                .rejects.toThrow(NotFoundError);
        });

        it('should return current registration if already cancelled', async () => {
             (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockCancelledRegistration);

            const result = await RegistrationService.cancelRegistration(registrationId, mockUser);

            expect(prisma.registration.update).not.toHaveBeenCalled();
            expect(prisma.ticket.update).not.toHaveBeenCalled();
            expect(result.status).toBe(RegistrationStatus.CANCELLED);
        });

         it('should throw ValidationError if trying to cancel registration with invalid status', async () => {
            const mockCompletedRegistration = { ...mockFreeRegistration, status: 'COMPLETED' as any }; // Simulate an invalid status for cancellation
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockCompletedRegistration);

            await expect(RegistrationService.cancelRegistration(registrationId, mockUser))
                .rejects.toThrow(ValidationError);
             await expect(RegistrationService.cancelRegistration(registrationId, mockUser))
                .rejects.toThrow('Cannot cancel registration with status: COMPLETED');
        });

    });
    // --- End Test Suite for cancelRegistration ---

});

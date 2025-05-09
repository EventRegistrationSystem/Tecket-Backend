import { RegistrationService } from '../../services/registrationServices';
import { ParticipantService } from '../../services/participantServices';
import { prisma } from '../../config/prisma';
import { CreateRegistrationDto } from '../../types/registrationTypes';
import { AppError, ValidationError, NotFoundError } from '../../utils/errors';
import { RegistrationStatus, EventStatus, TicketStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// Mock Prisma client
jest.mock('../../config/prisma', () => {
    const mockPrismaSingleton = {
        event: { findUnique: jest.fn(), count: jest.fn() },
        registration: { create: jest.fn(), count: jest.fn() },
        purchase: { create: jest.fn(), update: jest.fn() },
        purchaseItem: { create: jest.fn() },
        ticket: { findMany: jest.fn(), update: jest.fn() },
        attendee: { create: jest.fn() },
        response: { create: jest.fn() },
        participant: { findUnique: jest.fn(), create: jest.fn() }, // Added for ParticipantService if it uses it directly
        eventQuestions: { findMany: jest.fn() }, // Added for fetching event questions
        // Add other models and methods as needed by RegistrationService
        $transaction: jest.fn().mockImplementation(async (callbackOrArray) => {
            if (typeof callbackOrArray === 'function') {
                return await callbackOrArray(mockPrismaSingleton); // Pass the mock prisma instance
            } else if (Array.isArray(callbackOrArray)) {
                return await Promise.all(callbackOrArray);
            }
            throw new Error('Invalid argument passed to $transaction mock');
        }),
    };
    return { prisma: mockPrismaSingleton };
});

// Mock ParticipantService
jest.mock('../../services/participantServices', () => ({
    ParticipantService: {
        findOrCreateParticipant: jest.fn(),
    },
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
    hash: jest.fn(),
}));

// Mock crypto for UUID
jest.mock('crypto', () => ({
    ...jest.requireActual('crypto'), // Keep original crypto functions if needed elsewhere
    randomUUID: jest.fn(),
}));


describe('RegistrationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createRegistration', () => {
        const mockEventId = 1;
        const mockTicketId1 = 101;
        const mockTicketId2 = 102;
        const mockUserId = 1;

        const baseParticipantInput = {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            responses: [{ eventQuestionId: 1, responseText: 'Answer 1' }],
        };

        const mockEventPublishedPaid = {
            id: mockEventId,
            status: EventStatus.PUBLISHED,
            isFree: false,
            capacity: 100,
            tickets: [
                { id: mockTicketId1, name: 'GA', price: new Decimal(50), status: TicketStatus.ACTIVE, salesStart: new Date(Date.now() - 86400000), salesEnd: new Date(Date.now() + 86400000), quantityTotal: 50, quantitySold: 0 },
                { id: mockTicketId2, name: 'VIP', price: new Decimal(100), status: TicketStatus.ACTIVE, salesStart: new Date(Date.now() - 86400000), salesEnd: new Date(Date.now() + 86400000), quantityTotal: 20, quantitySold: 0 },
            ],
            eventQuestions: [{ id: 1, questionId: 1, isRequired: true, question: { questionText: 'Q1' } }],
        };
        
        const mockParticipant = { id: 1, email: 'test@example.com', firstName: 'Test', lastName: 'User' };
        const mockRegistration = { id: 1, eventId: mockEventId, participantId: mockParticipant.id, userId: mockUserId, status: RegistrationStatus.PENDING };
        const mockPurchase = { id: 1, registrationId: mockRegistration.id, totalPrice: new Decimal(50) };
        const mockAttendee = { id: 1, registrationId: mockRegistration.id, participantId: mockParticipant.id };

        it('should successfully create a registration for a logged-in user for a paid event', async () => {
            const dto: CreateRegistrationDto = {
                eventId: mockEventId,
                tickets: [{ ticketId: mockTicketId1, quantity: 1 }],
                participants: [baseParticipantInput],
            };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEventPublishedPaid);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0); // No existing registrations
            (ParticipantService.findOrCreateParticipant as jest.Mock).mockResolvedValue(mockParticipant);
            (prisma.registration.create as jest.Mock).mockResolvedValue(mockRegistration);
            (prisma.purchase.create as jest.Mock).mockResolvedValue(mockPurchase);
            (prisma.purchaseItem.create as jest.Mock).mockResolvedValue({});
            (prisma.ticket.findMany as jest.Mock).mockResolvedValue(mockEventPublishedPaid.tickets); // For re-validation in transaction
            (prisma.ticket.update as jest.Mock).mockResolvedValue({});
            (prisma.attendee.create as jest.Mock).mockResolvedValue(mockAttendee);
            (prisma.response.create as jest.Mock).mockResolvedValue({});

            const result = await RegistrationService.createRegistration(dto, mockUserId);

            expect(result.message).toBe('Registration pending payment');
            expect(result.registrationId).toBe(mockRegistration.id);
            expect(result.paymentToken).toBeUndefined();
            expect(prisma.registration.create).toHaveBeenCalledWith(expect.objectContaining({ userId: mockUserId, status: RegistrationStatus.PENDING }));
            expect(prisma.purchase.create).toHaveBeenCalled();
            expect(bcrypt.hash).not.toHaveBeenCalled();
        });

        it('should successfully create a registration for a guest and return a paymentToken', async () => {
            const dto: CreateRegistrationDto = {
                eventId: mockEventId,
                tickets: [{ ticketId: mockTicketId1, quantity: 1 }],
                participants: [{ ...baseParticipantInput, email: 'guest@example.com' }],
            };
            const mockGuestParticipant = { ...mockParticipant, id: 2, email: 'guest@example.com' };
            const mockGuestRegistration = { ...mockRegistration, id: 2, participantId: mockGuestParticipant.id, userId: null };
            const mockGuestPurchase = { ...mockPurchase, id: 2, registrationId: mockGuestRegistration.id };
            const mockGuestAttendee = { ...mockAttendee, id: 2, registrationId: mockGuestRegistration.id, participantId: mockGuestParticipant.id };
            const mockUuid = 'test-uuid-123';
            const mockHashedToken = 'hashed-test-uuid-123';

            (crypto.randomUUID as jest.Mock).mockReturnValue(mockUuid);
            (bcrypt.hash as jest.Mock).mockResolvedValue(mockHashedToken);

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEventPublishedPaid);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            (ParticipantService.findOrCreateParticipant as jest.Mock).mockResolvedValue(mockGuestParticipant);
            (prisma.registration.create as jest.Mock).mockResolvedValue(mockGuestRegistration);
            (prisma.purchase.create as jest.Mock).mockResolvedValue(mockGuestPurchase);
            (prisma.purchaseItem.create as jest.Mock).mockResolvedValue({});
            (prisma.ticket.findMany as jest.Mock).mockResolvedValue(mockEventPublishedPaid.tickets);
            (prisma.ticket.update as jest.Mock).mockResolvedValue({});
            (prisma.purchase.update as jest.Mock).mockResolvedValue({}); // For payment token
            (prisma.attendee.create as jest.Mock).mockResolvedValue(mockGuestAttendee);
            (prisma.response.create as jest.Mock).mockResolvedValue({});


            const result = await RegistrationService.createRegistration(dto, undefined); // No userId for guest

            expect(result.message).toBe('Registration pending payment');
            expect(result.registrationId).toBe(mockGuestRegistration.id);
            expect(result.paymentToken).toBe(mockUuid);
            expect(prisma.registration.create).toHaveBeenCalledWith(expect.objectContaining({ userId: null, status: RegistrationStatus.PENDING }));
            expect(bcrypt.hash).toHaveBeenCalledWith(mockUuid, 10);
            expect(prisma.purchase.update).toHaveBeenCalledWith(expect.objectContaining({
                data: { paymentToken: mockHashedToken, paymentTokenExpiry: expect.any(Date) }
            }));
        });

        it('should throw ValidationError if number of participants does not match total ticket quantity', async () => {
            const dto: CreateRegistrationDto = {
                eventId: mockEventId,
                tickets: [{ ticketId: mockTicketId1, quantity: 1 }], // 1 ticket
                participants: [baseParticipantInput, { ...baseParticipantInput, email: 'p2@e.com' }], // 2 participants
            };
            await expect(RegistrationService.createRegistration(dto, mockUserId))
                .rejects.toThrow(new ValidationError('Number of participants must match the total quantity of tickets.'));
        });

        it('should throw NotFoundError if event not found', async () => {
            const dto: CreateRegistrationDto = { eventId: 999, tickets: [], participants: [] };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(RegistrationService.createRegistration(dto, mockUserId))
                .rejects.toThrow(new NotFoundError('Event not found'));
        });
        
        it('should throw ValidationError if event is not published', async () => {
            const dto: CreateRegistrationDto = { 
                eventId: mockEventId, 
                tickets: [{ ticketId: mockTicketId1, quantity: 1 }], 
                participants: [baseParticipantInput] 
            };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue({ ...mockEventPublishedPaid, status: EventStatus.DRAFT });
            await expect(RegistrationService.createRegistration(dto, mockUserId))
                .rejects.toThrow(new ValidationError('Event is not currently open for registration.'));
        });

        it('should throw ValidationError if event capacity is exceeded', async () => {
            const dto: CreateRegistrationDto = { 
                eventId: mockEventId, 
                tickets: [{ ticketId: mockTicketId1, quantity: 1 }], 
                participants: [baseParticipantInput] 
            };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue({ ...mockEventPublishedPaid, capacity: 0 }); // Capacity 0
            (prisma.registration.count as jest.Mock).mockResolvedValue(0); // 0 existing, 1 requested
            await expect(RegistrationService.createRegistration(dto, mockUserId))
                .rejects.toThrow(new ValidationError(`Event capacity (0) exceeded. Only 0 spots remaining.`));
        });

        it('should throw NotFoundError if a ticket is not found for the event', async () => {
            const dto: CreateRegistrationDto = { 
                eventId: mockEventId, 
                tickets: [{ ticketId: 999, quantity: 1 }], // Non-existent ticket
                participants: [baseParticipantInput] 
            };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEventPublishedPaid); // Event returns its own tickets
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            await expect(RegistrationService.createRegistration(dto, mockUserId))
                .rejects.toThrow(new NotFoundError('Ticket with ID 999 not found for this event.'));
        });
        
        it('should throw ValidationError if a required question is not answered', async () => {
            const dto: CreateRegistrationDto = {
                eventId: mockEventId,
                tickets: [{ ticketId: mockTicketId1, quantity: 1 }],
                participants: [{ ...baseParticipantInput, responses: [] }], // No responses
            };
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEventPublishedPaid);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            await expect(RegistrationService.createRegistration(dto, mockUserId))
                .rejects.toThrow(new ValidationError(`Response required for question "Q1" for participant Test User.`));
        });

        it('should create a registration for a free event as CONFIRMED', async () => {
            const mockEventFree = {
                ...mockEventPublishedPaid,
                isFree: true,
                tickets: [], // Free events might not have tickets in the same way
                eventQuestions: [{ id: 1, questionId: 1, isRequired: false, question: { questionText: 'Optional Q' } }] // Make question optional for simplicity
            };
            const dto: CreateRegistrationDto = {
                eventId: mockEventId,
                tickets: [], // No tickets for free event as per current service logic check
                participants: [{ ...baseParticipantInput, responses: [{eventQuestionId: 1, responseText: "Free answer"}] }],
            };
        
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEventFree);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            (ParticipantService.findOrCreateParticipant as jest.Mock).mockResolvedValue(mockParticipant);
            (prisma.registration.create as jest.Mock).mockResolvedValue({ ...mockRegistration, status: RegistrationStatus.CONFIRMED });
            (prisma.attendee.create as jest.Mock).mockResolvedValue(mockAttendee);
            (prisma.response.create as jest.Mock).mockResolvedValue({});
        
            const result = await RegistrationService.createRegistration(dto, mockUserId);
        
            expect(result.message).toBe('Registration confirmed');
            expect(prisma.registration.create).toHaveBeenCalledWith(expect.objectContaining({ status: RegistrationStatus.CONFIRMED }));
            expect(prisma.purchase.create).not.toHaveBeenCalled(); // No purchase for free event
        });

        it('should throw ValidationError if ticket quantity becomes unavailable during transaction', async () => {
            const dto: CreateRegistrationDto = {
                eventId: mockEventId,
                tickets: [{ ticketId: mockTicketId1, quantity: 1 }],
                participants: [baseParticipantInput],
            };
        
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEventPublishedPaid);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0); // Initial capacity check passes
            
            // Mock transaction part
            (ParticipantService.findOrCreateParticipant as jest.Mock).mockResolvedValue(mockParticipant);
            (prisma.registration.create as jest.Mock).mockResolvedValue(mockRegistration);
            // Simulate ticket becoming unavailable inside transaction
            (prisma.ticket.findMany as jest.Mock).mockResolvedValueOnce([
                { ...mockEventPublishedPaid.tickets[0], quantitySold: mockEventPublishedPaid.tickets[0].quantityTotal } // Ticket now sold out
            ]);
        
            await expect(RegistrationService.createRegistration(dto, mockUserId))
                .rejects.toThrow(new ValidationError(`Ticket "GA" quantity became unavailable during registration. Only 0 left.`));
        });

        // Add more tests for other validation paths:
        // - Ticket inactive, sales period checks
        // - Invalid eventQuestionId in responses
        // - Empty responseText for required questions
        // - Multiple participants and multiple ticket types combined
    });
});

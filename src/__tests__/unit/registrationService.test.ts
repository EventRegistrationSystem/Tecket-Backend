import { RegistrationService } from '../../services/registrationServices';
import { prisma } from '../../config/prisma';
import { AppError, ValidationError, AuthorizationError, NotFoundError } from '../../utils/errors';
import { CreateRegistrationDto, ParticipantInput } from '../../types/registrationTypes'; // Import correct DTO
import { JwtPayload } from '../../types/authTypes';
import { UserRole, RegistrationStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library'; // Import Decimal

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
            findUnique: jest.fn(), // Add findUnique if needed
            findMany: jest.fn(), // Add findMany if needed
        },
        purchaseItem: { // Add mock for PurchaseItem
            create: jest.fn(),
            findMany: jest.fn(),
        },
        attendee: { // Add mock for Attendee
            create: jest.fn(),
            findMany: jest.fn(),
        },
        response: {
            create: jest.fn(),
            findMany: jest.fn(), // Add findMany if needed
        },
        eventQuestions: {},
        question: {},
        user: {
             findUnique: jest.fn(),
        },
        $transaction: jest.fn().mockImplementation(async (arg) => {
            // Ensure the mock transaction client passed to the callback has the new models
            const mockTxClient = {
                ...mockPrismaInside,

                // Explicitly add mocks for models used within transactions
                event: mockPrismaInside.event,
                participant: mockPrismaInside.participant,
                registration: mockPrismaInside.registration,
                ticket: mockPrismaInside.ticket,
                purchase: mockPrismaInside.purchase,
                purchaseItem: mockPrismaInside.purchaseItem,
                attendee: mockPrismaInside.attendee,
                response: mockPrismaInside.response,

            };
            if (typeof arg === 'function') {
                // Pass the enhanced mock transaction client
                return arg(mockTxClient);
            } else if (Array.isArray(arg)) {
                // Handle array of promises if needed (though less common with the callback pattern)
                const results = await Promise.all(arg.map(p => Promise.resolve(p)));
                return results;
            }
            throw new Error('Unsupported $transaction argument type');
        }),
    };
    // Ensure the main prisma mock object also has the new models accessible
    mockPrismaInside.attendee = { create: jest.fn(), findMany: jest.fn() };
    mockPrismaInside.purchaseItem = { create: jest.fn(), findMany: jest.fn() };
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

    // --- Test Suite for createRegistration ---
    describe('createRegistration', () => {
        // --- Mock Data Setup ---

        // Mock Event Data
        const mockFreeEvent = {
            id: 1, name: 'Free Picnic', capacity: 100, isFree: true, status: 'PUBLISHED',
            startDateTime: new Date('2025-07-01T12:00:00Z'), endDateTime: new Date('2025-07-01T15:00:00Z'),
            tickets: [],
            eventQuestions: [ { id: 1, eventId: 1, questionId: 101, isRequired: true, displayOrder: 1, question: { id: 101, questionText: 'Dietary Restrictions?' } } ]
        };
        const mockPaidEvent = {
            id: 2, name: 'Paid Workshop', capacity: 50, isFree: false, status: 'PUBLISHED',
            startDateTime: new Date('2025-08-01T09:00:00Z'), endDateTime: new Date('2025-08-01T17:00:00Z'),
            // Mock multiple tickets for the event
            tickets: [
                { id: 201, eventId: 2, name: 'Standard Ticket', price: new Decimal(50.00), quantityTotal: 40, quantitySold: 10, salesStart: new Date(), salesEnd: new Date('2025-07-31T23:59:59Z'), status: 'ACTIVE' },
                { id: 202, eventId: 2, name: 'VIP Ticket', price: new Decimal(100.00), quantityTotal: 10, quantitySold: 2, salesStart: new Date(), salesEnd: new Date('2025-07-31T23:59:59Z'), status: 'ACTIVE' }
            ],
            eventQuestions: [ { id: 3, eventId: 2, questionId: 201, isRequired: true, displayOrder: 1, question: { id: 201, questionText: 'Company Name?' } } ]
        };

        // Mock Participant Input Data
        const mockParticipantInput1: ParticipantInput = {
            email: 'test1@example.com', firstName: 'Test', lastName: 'User1',
            responses: [ { eventQuestionId: 101, responseText: 'None' } ] // Assuming Q 101 is for event 1
        };
         const mockParticipantInput2: ParticipantInput = {
            email: 'test2@example.com', firstName: 'Test', lastName: 'User2',
            responses: [ { eventQuestionId: 201, responseText: 'Test Corp' } ] // Assuming Q 201 is for event 2
        };
        const mockParticipant1 = { id: 1, userId: null, ...mockParticipantInput1, createdAt: new Date(), updatedAt: new Date() };
        const mockParticipant2 = { id: 2, userId: null, ...mockParticipantInput2, createdAt: new Date(), updatedAt: new Date() };


        // --- Test Cases for createRegistration ---

        it('should register successfully for a FREE event (single participant) and set status to CONFIRMED', async () => {
            // Input DTO for free event (no tickets array needed per logic, 1 participant)
            const registrationInput: CreateRegistrationDto = {
                eventId: mockFreeEvent.id,
                tickets: [], // Free events might not require tickets array based on current logic
                participants: [mockParticipantInput1]
            };
            const expectedRegistration = { id: 1, eventId: mockFreeEvent.id, participantId: mockParticipant1.id, status: RegistrationStatus.CONFIRMED };
            const expectedAttendee = { id: 10, registrationId: 1, participantId: mockParticipant1.id };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0); // Assume space available
            mockFindOrCreateParticipant.mockResolvedValueOnce(mockParticipant1); // Mock finding/creating the participant
            (prisma.registration.create as jest.Mock).mockResolvedValue(expectedRegistration);
            (prisma.attendee.create as jest.Mock).mockResolvedValue(expectedAttendee); // Mock attendee creation
            (prisma.response.create as jest.Mock).mockResolvedValue({}); // Mock response creation

            // Call the method
            const result = await RegistrationService.createRegistration(registrationInput);

            expect(mockFindOrCreateParticipant).toHaveBeenCalledWith(mockParticipantInput1, expect.anything()); // Check primary participant
            expect(prisma.registration.create).toHaveBeenCalledWith({
                 data: expect.objectContaining({ status: RegistrationStatus.CONFIRMED })
            });
            expect(prisma.attendee.create).toHaveBeenCalledTimes(1); // One participant
            expect(prisma.response.create).toHaveBeenCalledTimes(1); // One response for that participant
            expect(prisma.purchase.create).not.toHaveBeenCalled();
            expect(prisma.purchaseItem.create).not.toHaveBeenCalled();
            expect(prisma.ticket.update).not.toHaveBeenCalled();
            expect(result.message).toBe("Registration confirmed");
            expect(result.registrationId).toBe(expectedRegistration.id);
        });

        it('should register successfully for a PAID event (multi-ticket, multi-participant) and set status to PENDING', async () => {
            const registrationInput: CreateRegistrationDto = {
                eventId: mockPaidEvent.id,
                tickets: [
                    { ticketId: 201, quantity: 1 }, // 1 Standard
                    { ticketId: 202, quantity: 1 }  // 1 VIP
                ],
                participants: [mockParticipantInput1, mockParticipantInput2] // 2 participants needed
            };
            // Define expected data within the test scope
            const expectedRegistration = { id: 2, eventId: mockPaidEvent.id, participantId: mockParticipant1.id, status: RegistrationStatus.PENDING };
            const expectedPurchase = { id: 10, registrationId: 2, totalPrice: new Decimal(150.00) }; // 50 + 100
            const expectedAttendee1 = { id: 11, registrationId: 2, participantId: mockParticipant1.id };
            const expectedAttendee2 = { id: 12, registrationId: 2, participantId: mockParticipant2.id };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0); // Assume space
            (prisma.ticket.findMany as jest.Mock).mockResolvedValue(mockPaidEvent.tickets); // Mock ticket re-validation
            mockFindOrCreateParticipant.mockResolvedValueOnce(mockParticipant1).mockResolvedValueOnce(mockParticipant2); // Mock participant creation/finding
            (prisma.registration.create as jest.Mock).mockResolvedValue(expectedRegistration);
            (prisma.purchase.create as jest.Mock).mockResolvedValue(expectedPurchase); // Mock purchase creation
            (prisma.purchaseItem.create as jest.Mock).mockResolvedValue({}); // Mock purchase item creation (called twice)
            (prisma.ticket.update as jest.Mock).mockResolvedValue({}); // Mock ticket update (called twice)
            (prisma.attendee.create as jest.Mock).mockResolvedValueOnce(expectedAttendee1).mockResolvedValueOnce(expectedAttendee2); // Mock attendee creation
            (prisma.response.create as jest.Mock).mockResolvedValue({}); // Mock response creation (called for each response)


            const result = await RegistrationService.createRegistration(registrationInput);

            expect(mockFindOrCreateParticipant).toHaveBeenCalledTimes(2);
            expect(prisma.registration.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ status: RegistrationStatus.PENDING })
            });
            expect(prisma.purchase.create).toHaveBeenCalledWith({
                data: { registrationId: expectedRegistration.id, totalPrice: new Decimal(150.00) } // Use imported Decimal
            });
            expect(prisma.purchaseItem.create).toHaveBeenCalledTimes(2);
            expect(prisma.purchaseItem.create).toHaveBeenCalledWith({
                data: { purchaseId: expectedPurchase.id, ticketId: 201, quantity: 1, unitPrice: new Decimal(50.00) } // Use imported Decimal
            });
             expect(prisma.purchaseItem.create).toHaveBeenCalledWith({
                data: { purchaseId: expectedPurchase.id, ticketId: 202, quantity: 1, unitPrice: new Decimal(100.00) } // Use imported Decimal
            });
            expect(prisma.ticket.update).toHaveBeenCalledTimes(2);
            expect(prisma.ticket.update).toHaveBeenCalledWith({ where: { id: 201 }, data: { quantitySold: { increment: 1 } } });
            expect(prisma.ticket.update).toHaveBeenCalledWith({ where: { id: 202 }, data: { quantitySold: { increment: 1 } } });
            expect(prisma.attendee.create).toHaveBeenCalledTimes(2);
            expect(prisma.response.create).toHaveBeenCalledTimes(mockParticipantInput1.responses.length + mockParticipantInput2.responses.length); // Total responses
            expect(result.message).toBe("Registration pending payment");
            expect(result.registrationId).toBe(expectedRegistration.id);
        });

        // --- Error Handling Tests ---

         it('should throw error if event is not found', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
            const registrationInput: CreateRegistrationDto = { eventId: 999, tickets: [{ticketId: 1, quantity: 1}], participants: [mockParticipantInput1] };
            await expect(RegistrationService.createRegistration(registrationInput)).rejects.toThrow(NotFoundError);
        });

         it('should throw error if event is full', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(mockFreeEvent.capacity); // Event is full
             const registrationInput: CreateRegistrationDto = { eventId: mockFreeEvent.id, tickets: [], participants: [mockParticipantInput1] };
            await expect(RegistrationService.createRegistration(registrationInput)).rejects.toThrow(`Event capacity (${mockFreeEvent.capacity}) exceeded.`);
        });

         it('should throw error if ticket quantity exceeds event capacity remaining', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(49); // Only 1 spot left
            const registrationInput: CreateRegistrationDto = {
                eventId: mockPaidEvent.id,
                tickets: [{ ticketId: 201, quantity: 2 }], // Requesting 2 tickets
                participants: [mockParticipantInput1, mockParticipantInput2]
            };
            await expect(RegistrationService.createRegistration(registrationInput)).rejects.toThrow(`Event capacity (${mockPaidEvent.capacity}) exceeded.`);
        });


         it('should throw error for paid event if ticket is not found in event data', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent); // Event only has tickets 201, 202
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: CreateRegistrationDto = {
                eventId: mockPaidEvent.id,
                tickets: [{ ticketId: 999, quantity: 1 }], // Invalid ticket ID
                participants: [mockParticipantInput1]
            };
            await expect(RegistrationService.createRegistration(registrationInput)).rejects.toThrow('Ticket with ID 999 not found for this event.');
        });

         it('should throw error for paid event if ticket quantity is not available (during transaction lock)', async () => {
            const nearlySoldOutTicket = { ...mockPaidEvent.tickets[0], quantitySold: 39 }; // Only 1 left
            const eventWithNearlySoldOut = { ...mockPaidEvent, tickets: [nearlySoldOutTicket] };

            (prisma.event.findUnique as jest.Mock).mockResolvedValue(eventWithNearlySoldOut);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            // Mock the findMany inside the transaction to return the nearly sold out ticket
            (prisma.ticket.findMany as jest.Mock).mockResolvedValue([nearlySoldOutTicket]);

            const registrationInput: CreateRegistrationDto = {
                eventId: mockPaidEvent.id,
                tickets: [{ ticketId: 201, quantity: 2 }], // Requesting 2, only 1 left
                participants: [mockParticipantInput1, mockParticipantInput2]
            };
            await expect(RegistrationService.createRegistration(registrationInput)).rejects.toThrow(`Ticket "Standard Ticket" quantity became unavailable`);
        });

         it('should throw error if a required question response is missing for any participant', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent); // Requires Q 101
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const participantWithMissingResponse = { ...mockParticipantInput1, responses: [] }; // No response provided
            const registrationInput: CreateRegistrationDto = { eventId: mockFreeEvent.id, tickets: [], participants: [participantWithMissingResponse] };
            await expect(RegistrationService.createRegistration(registrationInput)).rejects.toThrow('Response required for question "Dietary Restrictions?"');
        });

         it('should throw error if a required question response is empty for any participant', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent); // Requires Q 101
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const participantWithEmptyResponse = { ...mockParticipantInput1, responses: [{ eventQuestionId: 101, responseText: '  ' }] };
            const registrationInput: CreateRegistrationDto = { eventId: mockFreeEvent.id, tickets: [], participants: [participantWithEmptyResponse] };
            await expect(RegistrationService.createRegistration(registrationInput)).rejects.toThrow('Response cannot be empty for required question "Dietary Restrictions?"');
        });

         it('should throw error if an invalid question ID is provided for any participant', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockFreeEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
             const participantWithInvalidResponse = { ...mockParticipantInput1, responses: [{ eventQuestionId: 999, responseText: 'Invalid' }] };
            const registrationInput: CreateRegistrationDto = { eventId: mockFreeEvent.id, tickets: [], participants: [participantWithInvalidResponse] };
            await expect(RegistrationService.createRegistration(registrationInput)).rejects.toThrow('Invalid event question ID 999 provided');
        });

         it('should throw error if participant count does not match total ticket quantity', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockPaidEvent);
            (prisma.registration.count as jest.Mock).mockResolvedValue(0);
            const registrationInput: CreateRegistrationDto = {
                eventId: mockPaidEvent.id,
                tickets: [{ ticketId: 201, quantity: 2 }], // Requesting 2 tickets
                participants: [mockParticipantInput1] // Only providing 1 participant
            };
            // This validation happens *before* the transaction in the service layer
            await expect(RegistrationService.createRegistration(registrationInput)).rejects.toThrow('Number of participants must match the total quantity of tickets.');
        });

    }); // End describe('createRegistration')

    // --- Test Suite for getRegistrations ---
    describe('getRegistrations', () => {
        // ... existing tests ...
        // TODO: Update mockRegistrations data and assertions to reflect new includes (attendees, purchase.items)
    });

    // --- Test Suite for getRegistrationById ---
    describe('getRegistrationById', () => {
        // ... existing tests ...
        // TODO: Update mockRegistration data and assertions to reflect new includes (attendees, purchase.items, payment)
    });

    // --- Test Suite for cancelRegistration ---
    describe('cancelRegistration', () => {
        // ... existing tests ...
        // TODO: Update mockPaidRegistration to reflect new Purchase/PurchaseItem structure
        // TODO: Update assertions to check prisma.purchaseItem.findMany and prisma.ticket.updateMany calls
    });
    // --- End Test Suite for cancelRegistration ---

});

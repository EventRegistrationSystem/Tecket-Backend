import { TicketService } from '../../services/ticketServices';
import { prisma } from '../../config/prisma';
import { ValidationError, AuthorizationError } from '../../utils/errors'; // Import AuthorizationError

// Mock the Prisma client
jest.mock('../../config/prisma', () => {
    // Define the mock object *inside* the factory function
    const mockPrismaInside = {
        event: {
            findUnique: jest.fn(),
            count: jest.fn()
        },
        ticket: {
            create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findMany: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn()
        },
        // Add other necessary mocks if needed by other services/tests
        eventQuestions: { create: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn(), update: jest.fn() },
        question: { create: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
        registration: { count: jest.fn(), updateMany: jest.fn() },
        $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrismaInside)) // Use internal mock
    };
    return { prisma: mockPrismaInside };
});


describe('TicketService', () => {
    const organizerUserId = 1; // Assume this user owns the event
    const otherUserId = 2; // Assume this user does not own the event
    const validEventId = 1;
    const ticketId = 1;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Test suite for createTicket method
    describe('createTicket', () => {
        const validTicketData = {
            eventId: validEventId, // eventId is part of ticketData in controller, but service takes it separately
            name: 'Test Ticket',
            description: 'Test description',
            price: 25.00,
            quantityTotal: 100,
            salesStart: new Date('2025-01-01T00:00:00Z'),
            salesEnd: new Date('2025-04-01T00:00:00Z')
        };

        const mockEvent = {
            id: validEventId,
            organiserId: organizerUserId, // Event owned by user 1
            endDateTime: new Date('2025-05-02T00:00:00Z'),
        };

        const mockTicket = {
            id: 1,
            ...validTicketData,
            status: 'ACTIVE',
            quantitySold: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        it('should successfully create a ticket when user is the organizer', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent);
            (prisma.ticket.create as jest.Mock).mockResolvedValue(mockTicket);

            const result = await TicketService.createTicket(organizerUserId, validEventId, validTicketData);

            expect(prisma.event.findUnique).toHaveBeenCalledWith({
                where: { id: validEventId },
                select: { id: true, organiserId: true, endDateTime: true }
            });
            expect(prisma.ticket.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    eventId: validEventId,
                    name: validTicketData.name,
                })
            });
            expect(result).toEqual(mockTicket);
        });

        it('should throw AuthorizationError when user is not the organizer', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent); // Event owned by organizerUserId (1)

            await expect(TicketService.createTicket(otherUserId, validEventId, validTicketData)) // Attempted by otherUserId (2)
                .rejects
                .toThrow(AuthorizationError);
            await expect(TicketService.createTicket(otherUserId, validEventId, validTicketData))
                .rejects
                .toThrow('You are not authorized to add tickets to this event.');
            expect(prisma.ticket.create).not.toHaveBeenCalled();
        });


        it('should throw ValidationError when event is not found', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(TicketService.createTicket(organizerUserId, 999, validTicketData))
                .rejects.toThrow(ValidationError);
            await expect(TicketService.createTicket(organizerUserId, 999, validTicketData))
                .rejects.toThrow('Event not found');
        });

        // Keep other validation tests (dates, price, quantity) - they don't need userId
        it('should throw error when sales end date is before sales start date', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent);
            const invalidTicketData = { ...validTicketData, salesStart: new Date('2025-04-01T00:00:00Z'), salesEnd: new Date('2025-01-01T00:00:00Z') };
            await expect(TicketService.createTicket(organizerUserId, validEventId, invalidTicketData))
                .rejects.toThrow('Sales end date must be after sales start date');
        });
         it('should throw error when sales end date is after event end date', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent);
            const invalidTicketData = { ...validTicketData, salesEnd: new Date('2025-06-01T00:00:00Z') };
            await expect(TicketService.createTicket(organizerUserId, validEventId, invalidTicketData))
                .rejects.toThrow('Ticket sales cannot end after the event ends');
        });
         it('should throw error when ticket price is negative', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent);
            const invalidTicketData = { ...validTicketData, price: -10 };
            await expect(TicketService.createTicket(organizerUserId, validEventId, invalidTicketData))
                .rejects.toThrow('Ticket price cannot be negative');
        });
         it('should throw error when ticket quantity is not positive', async () => {
            (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent);
            const invalidTicketData = { ...validTicketData, quantityTotal: 0 };
            await expect(TicketService.createTicket(organizerUserId, validEventId, invalidTicketData))
                .rejects.toThrow('Ticket quantity must be positive');
        });
    });

    // Test suite for updateTicket method
    describe('updateTicket', () => {
        const updateData = { name: 'Updated Ticket', price: 30.00 };
        const mockTicketWithEvent = {
            id: ticketId,
            eventId: validEventId,
            name: 'Original Ticket',
            quantitySold: 10,
            salesStart: new Date('2025-01-01T00:00:00Z'),
            salesEnd: new Date('2025-04-01T00:00:00Z'),
            event: { // Included event data with organiserId
                organiserId: organizerUserId, // Owned by user 1
                endDateTime: new Date('2025-05-02T00:00:00Z')
            }
        };

        it('should successfully update a ticket when user is the organizer', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicketWithEvent);
            const updatedTicketResult = { ...mockTicketWithEvent, ...updateData };
            (prisma.ticket.update as jest.Mock).mockResolvedValue(updatedTicketResult);

            const result = await TicketService.updateTicket(organizerUserId, ticketId, updateData);

            expect(prisma.ticket.findUnique).toHaveBeenCalledWith({
                where: { id: ticketId },
                include: { event: { select: { organiserId: true, endDateTime: true } } }
            });
            expect(prisma.ticket.update).toHaveBeenCalledWith({
                where: { id: ticketId },
                data: expect.objectContaining(updateData)
            });
            expect(result).toEqual(updatedTicketResult);
        });

        it('should throw AuthorizationError when user is not the organizer', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicketWithEvent); // Ticket owned by user 1

            await expect(TicketService.updateTicket(otherUserId, ticketId, updateData)) // Attempted by user 2
                .rejects.toThrow(AuthorizationError);
             await expect(TicketService.updateTicket(otherUserId, ticketId, updateData))
                .rejects.toThrow('Permission denied to update this ticket.');
            expect(prisma.ticket.update).not.toHaveBeenCalled();
        });

        it('should throw ValidationError when ticket is not found', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(TicketService.updateTicket(organizerUserId, 999, updateData))
                .rejects.toThrow(ValidationError);
             await expect(TicketService.updateTicket(organizerUserId, 999, updateData))
                .rejects.toThrow('Ticket not found');
        });

        // Keep other validation tests (quantity, dates) - they need the userId now
        it('should throw error when reducing quantity below sold amount', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicketWithEvent);
            await expect(TicketService.updateTicket(organizerUserId, ticketId, { quantityTotal: 5 }))
                .rejects.toThrow('Cannot reduce quantity below the number of tickets already sold');
        });
        it('should throw error when updating with invalid sales dates', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicketWithEvent);
            await expect(TicketService.updateTicket(organizerUserId, ticketId, { salesStart: new Date('2025-05-01'), salesEnd: new Date('2025-04-01') }))
                .rejects.toThrow('Sales end date must be after sales start date');
        });
         it('should throw error when sales end date is after event end', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicketWithEvent);
            await expect(TicketService.updateTicket(organizerUserId, ticketId, { salesEnd: new Date('2025-06-01') }))
                .rejects.toThrow('Ticket sales cannot end after the event ends');
        });
    });

    // Test suite for deleteTicket method
    describe('deleteTicket', () => {
         const mockTicketWithEvent = {
            id: ticketId,
            quantitySold: 0, // No sales for successful deletion
            event: { organiserId: organizerUserId } // Owned by user 1
        };
         const mockSoldTicketWithEvent = {
            id: ticketId,
            quantitySold: 5, // Has sales
            event: { organiserId: organizerUserId } // Owned by user 1
        };

        it('should successfully delete a ticket with no sales when user is organizer', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicketWithEvent);
            (prisma.ticket.delete as jest.Mock).mockResolvedValue(undefined);

            await TicketService.deleteTicket(organizerUserId, ticketId);

            expect(prisma.ticket.findUnique).toHaveBeenCalledWith({
                where: { id: ticketId },
                 include: { event: { select: { organiserId: true } } }
            });
            expect(prisma.ticket.delete).toHaveBeenCalledWith({ where: { id: ticketId } });
        });

         it('should throw AuthorizationError when user is not the organizer', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicketWithEvent); // Ticket owned by user 1

            await expect(TicketService.deleteTicket(otherUserId, ticketId)) // Attempted by user 2
                .rejects.toThrow(AuthorizationError);
            await expect(TicketService.deleteTicket(otherUserId, ticketId))
                .rejects.toThrow('Permission denied to delete this ticket.');
            expect(prisma.ticket.delete).not.toHaveBeenCalled();
        });

        it('should throw ValidationError when ticket is not found', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(TicketService.deleteTicket(organizerUserId, 999))
                .rejects.toThrow(ValidationError);
             await expect(TicketService.deleteTicket(organizerUserId, 999))
                .rejects.toThrow('Ticket not found');
        });

        it('should throw ValidationError when ticket has been purchased', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockSoldTicketWithEvent);
            await expect(TicketService.deleteTicket(organizerUserId, ticketId))
                .rejects.toThrow(ValidationError);
            await expect(TicketService.deleteTicket(organizerUserId, ticketId))
                .rejects.toThrow('Cannot delete a ticket that has been purchased');
        });
    });

    // Test suite for getTicketsByEvent method
    describe('getTicketsByEvent', () => {
        it('should return tickets for an event', async () => {
            const mockTickets = [{ id: 1, name: 'GA' }, { id: 2, name: 'VIP' }];
            (prisma.event.count as jest.Mock).mockResolvedValue(1); // Event exists
            (prisma.ticket.findMany as jest.Mock).mockResolvedValue(mockTickets);

            const result = await TicketService.getTicketsByEvent(validEventId);

            expect(prisma.event.count).toHaveBeenCalledWith({ where: { id: validEventId } });
            expect(prisma.ticket.findMany).toHaveBeenCalledWith({
                where: { eventId: validEventId, status: 'ACTIVE' },
                orderBy: { price: 'asc' }
            });
            expect(result).toEqual(mockTickets);
        });

        it('should throw ValidationError when event is not found', async () => {
            (prisma.event.count as jest.Mock).mockResolvedValue(0); // Event does not exist
            await expect(TicketService.getTicketsByEvent(999))
                .rejects.toThrow(ValidationError);
            await expect(TicketService.getTicketsByEvent(999))
                .rejects.toThrow('Event not found');
        });
    });

     // Test suite for getTicketById method (No changes needed for auth)
    describe('getTicketById', () => {
         it('should return ticket details when found', async () => {
            const mockTicket = { id: ticketId, name: 'Test Ticket' };
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket);

            const result = await TicketService.getTicketById(ticketId);

            expect(result).toEqual(mockTicket);
            expect(prisma.ticket.findUnique).toHaveBeenCalledWith({ where: { id: ticketId } });
        });

         it('should throw ValidationError when ticket is not found', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(TicketService.getTicketById(999)).rejects.toThrow('Ticket not found');
        });
    });


    // Test suite for checkAvailability method (No changes needed for auth)
    describe('checkAvailability', () => {
        const now = new Date();
        const futureSalesStart = new Date(now.getTime() + 10 * 86400000); // 10 days from now
        const pastSalesEnd = new Date(now.getTime() - 1 * 86400000); // Yesterday

        it('should return available=true for available tickets', async () => {
            const mockTicket = {
                id: ticketId, status: 'ACTIVE', quantityTotal: 100, quantitySold: 50,
                salesStart: new Date(now.getTime() - 10 * 86400000), // Started 10 days ago
                salesEnd: new Date(now.getTime() + 20 * 86400000), // Ends in 20 days
                event: { status: 'PUBLISHED' }
            };
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket);
            const result = await TicketService.checkAvailability(ticketId);
            expect(result.available).toBe(true);
            expect(result.availableQuantity).toBe(50);
        });

        it('should return available=false for inactive tickets', async () => {
            const mockTicket = { id: ticketId, status: 'INACTIVE', quantityTotal: 100, quantitySold: 0, salesStart: null, salesEnd: null, event: { status: 'PUBLISHED' } };
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket);
            const result = await TicketService.checkAvailability(ticketId);
            expect(result.available).toBe(false);
            expect(result.reason).toContain('no longer available');
        });

         it('should return available=false for unpublished events', async () => {
            const mockTicket = { id: ticketId, status: 'ACTIVE', quantityTotal: 100, quantitySold: 0, salesStart: null, salesEnd: null, event: { status: 'DRAFT' } };
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket);
            const result = await TicketService.checkAvailability(ticketId);
            expect(result.available).toBe(false);
            expect(result.reason).toContain('not open for registration');
        });

        it('should return available=false when sales have not started', async () => {
             const mockTicket = { id: ticketId, status: 'ACTIVE', quantityTotal: 100, quantitySold: 0, salesStart: futureSalesStart, salesEnd: null, event: { status: 'PUBLISHED' } };
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket);
            const result = await TicketService.checkAvailability(ticketId);
            expect(result.available).toBe(false);
            expect(result.reason).toContain('not started yet');
        });

        it('should return available=false when sales have ended', async () => {
            const mockTicket = { id: ticketId, status: 'ACTIVE', quantityTotal: 100, quantitySold: 50, salesStart: null, salesEnd: pastSalesEnd, event: { status: 'PUBLISHED' } };
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket);
            const result = await TicketService.checkAvailability(ticketId);
            expect(result.available).toBe(false);
            expect(result.reason).toContain('have ended');
        });

        it('should return available=false when sold out', async () => {
            const mockTicket = { id: ticketId, status: 'ACTIVE', quantityTotal: 100, quantitySold: 100, salesStart: null, salesEnd: null, event: { status: 'PUBLISHED' } };
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket);
            const result = await TicketService.checkAvailability(ticketId);
            expect(result.available).toBe(false);
            expect(result.availableQuantity).toBe(0);
            expect(result.reason).toContain('Sold out');
        });

        it('should throw ValidationError when ticket is not found', async () => {
            (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(TicketService.checkAvailability(999)).rejects.toThrow('Ticket not found');
        });
    });
});

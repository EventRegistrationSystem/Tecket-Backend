import { createPaymentIntent, handleWebhookEvent } from '../../services/paymentServices';
// Import all exports from paymentServices to potentially spy on or test unexported functions if absolutely necessary,
// though it's better to test via public API.
import * as PaymentServiceInternal from '../../services/paymentServices'; 
import { prisma } from '../../config/prisma';
import Stripe from 'stripe';
import bcrypt from 'bcrypt';
import { CreatePaymentIntentDto, StripeWebhookEvent } from '../../types/paymentTypes';
import { JwtPayload } from '../../types/authTypes';
import { RegistrationStatus, PaymentStatus, UserRole, EventStatus, TicketStatus } from '@prisma/client';
import { AppError, AuthorizationError, NotFoundError } from '../../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';

// Mock Prisma client
jest.mock('../../config/prisma', () => {
    const mockPrismaSingleton = {
        registration: { findUnique: jest.fn() },
        purchase: { findUnique: jest.fn(), update: jest.fn() },
        payment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
        ticket: { update: jest.fn() }, // For updating quantitySold in webhook
        $transaction: jest.fn().mockImplementation(async (callbackOrArray) => {
            if (typeof callbackOrArray === 'function') {
                return await callbackOrArray(mockPrismaSingleton);
            } else if (Array.isArray(callbackOrArray)) {
                return await Promise.all(callbackOrArray);
            }
            throw new Error('Invalid argument passed to $transaction mock');
        }),
    };
    return { prisma: mockPrismaSingleton };
});

// Mock Stripe SDK
const mockStripePaymentIntentRetrieve = jest.fn();
const mockStripePaymentIntentCreate = jest.fn();
const mockStripePaymentIntentUpdate = jest.fn(); // If you implement update logic

jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => ({
        paymentIntents: {
            create: mockStripePaymentIntentCreate,
            retrieve: mockStripePaymentIntentRetrieve,
            update: mockStripePaymentIntentUpdate,
        },
        // webhooks.constructEvent is usually NOT mocked here if used in middleware,
        // but if service directly calls it, it would be.
        // For now, assuming middleware handles constructEvent.
    }));
});

// Mock bcrypt
jest.mock('bcrypt', () => ({
    compare: jest.fn(),
}));

describe('PaymentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset Stripe mock return values if necessary for each test
        mockStripePaymentIntentCreate.mockReset();
        mockStripePaymentIntentRetrieve.mockReset();
    });

    describe('createPaymentIntent', () => {
        const mockRegistrationId = 1;
        const mockPurchaseId = 10;
        const mockTotalPrice = new Decimal(75.50);
        const mockClientSecret = 'pi_123_secret_456';
        const mockPaymentIntentId = 'pi_123';
        const mockPaymentId = 100;

        const mockRegistrationBase = {
            id: mockRegistrationId,
            userId: 1, // For logged-in user tests
            status: RegistrationStatus.PENDING,
            event: { id: 1, isFree: false, status: EventStatus.PUBLISHED },
            purchase: {
                id: mockPurchaseId,
                registrationId: mockRegistrationId,
                totalPrice: mockTotalPrice,
                paymentToken: null, // Default for logged-in or to be set for guest
                paymentTokenExpiry: null,
            },
        };

        const authUserJwt: JwtPayload = { userId: 1, role: UserRole.PARTICIPANT, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };

        it('should create a payment intent for an authorized logged-in user', async () => {
            const dto: CreatePaymentIntentDto = { registrationId: mockRegistrationId };
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistrationBase);
            (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null); // No existing payment
            mockStripePaymentIntentCreate.mockResolvedValue({ id: mockPaymentIntentId, client_secret: mockClientSecret, status: 'requires_payment_method' });
            (prisma.payment.create as jest.Mock).mockResolvedValue({ id: mockPaymentId, stripePaymentIntentId: mockPaymentIntentId });

            const result = await createPaymentIntent(dto, authUserJwt);

            expect(result.clientSecret).toBe(mockClientSecret);
            expect(result.paymentId).toBe(mockPaymentId);
            expect(mockStripePaymentIntentCreate).toHaveBeenCalledWith({
                amount: 7550, // 75.50 * 100
                currency: 'aud',
                metadata: {
                    registrationId: mockRegistrationId.toString(),
                    purchaseId: mockPurchaseId.toString(),
                    eventId: mockRegistrationBase.event.id.toString(),
                },
            });
            expect(prisma.payment.create).toHaveBeenCalled();
        });

        it('should create a payment intent for an authorized guest with a valid paymentToken', async () => {
            const guestPaymentToken = 'guest-token-123';
            const hashedGuestPaymentToken = 'hashed-guest-token-123';
            const mockGuestRegistration = {
                ...mockRegistrationBase,
                userId: null, // Guest
                purchase: {
                    ...mockRegistrationBase.purchase,
                    paymentToken: hashedGuestPaymentToken,
                    paymentTokenExpiry: new Date(Date.now() + 3600 * 1000), // Expires in 1 hour
                }
            };
            const dto: CreatePaymentIntentDto = { registrationId: mockRegistrationId, paymentToken: guestPaymentToken };

            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockGuestRegistration);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true); // Token matches
            (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
            mockStripePaymentIntentCreate.mockResolvedValue({ id: mockPaymentIntentId, client_secret: mockClientSecret, status: 'requires_payment_method' });
            (prisma.payment.create as jest.Mock).mockResolvedValue({ id: mockPaymentId, stripePaymentIntentId: mockPaymentIntentId });

            const result = await createPaymentIntent(dto, null); // No authUser for guest

            expect(result.clientSecret).toBe(mockClientSecret);
            expect(bcrypt.compare).toHaveBeenCalledWith(guestPaymentToken, hashedGuestPaymentToken);
            expect(mockStripePaymentIntentCreate).toHaveBeenCalled();
        });
        
        it('should throw AuthorizationError if guest paymentToken is expired', async () => {
            const guestPaymentToken = 'guest-token-expired';
            const hashedGuestPaymentToken = 'hashed-guest-token-expired';
            const mockGuestRegistrationExpired = {
                ...mockRegistrationBase,
                userId: null,
                purchase: {
                    ...mockRegistrationBase.purchase,
                    paymentToken: hashedGuestPaymentToken,
                    paymentTokenExpiry: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
                }
            };
            const dto: CreatePaymentIntentDto = { registrationId: mockRegistrationId, paymentToken: guestPaymentToken };

            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockGuestRegistrationExpired);
            
            await expect(createPaymentIntent(dto, null))
                .rejects.toThrow(new AuthorizationError('Forbidden: You are not authorized to create a payment intent for this registration.'));
        });

        it('should throw AuthorizationError if guest paymentToken does not match', async () => {
            const guestPaymentToken = 'wrong-guest-token';
            const hashedGuestPaymentToken = 'correct-hashed-guest-token';
            const mockGuestRegistrationMismatch = {
                ...mockRegistrationBase,
                userId: null,
                purchase: {
                    ...mockRegistrationBase.purchase,
                    paymentToken: hashedGuestPaymentToken,
                    paymentTokenExpiry: new Date(Date.now() + 3600 * 1000),
                }
            };
            const dto: CreatePaymentIntentDto = { registrationId: mockRegistrationId, paymentToken: guestPaymentToken };

            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockGuestRegistrationMismatch);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false); // Token does not match
            
            await expect(createPaymentIntent(dto, null))
                .rejects.toThrow(new AuthorizationError('Forbidden: You are not authorized to create a payment intent for this registration.'));
        });

        it('should throw AuthorizationError for logged-in user not owning the registration and not admin', async () => {
            const nonOwnerJwt: JwtPayload = { ...authUserJwt, userId: 999 }; // Different userId
            const dto: CreatePaymentIntentDto = { registrationId: mockRegistrationId };
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistrationBase); // registration.userId is 1

            await expect(createPaymentIntent(dto, nonOwnerJwt))
                .rejects.toThrow(new AuthorizationError('Forbidden: You are not authorized to create a payment intent for this registration.'));
        });

        it('should throw AppError if registration not found', async () => {
            const dto: CreatePaymentIntentDto = { registrationId: 999 };
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(null);
            await expect(createPaymentIntent(dto, authUserJwt))
                .rejects.toThrow(new AppError(404, 'Registration not found'));
        });

        it('should throw AppError for a free event registration', async () => {
            const dto: CreatePaymentIntentDto = { registrationId: mockRegistrationId };
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue({
                ...mockRegistrationBase,
                event: { ...mockRegistrationBase.event, isFree: true }
            });
            await expect(createPaymentIntent(dto, authUserJwt))
                .rejects.toThrow(new AppError(400, 'Cannot create payment intent for a free event registration'));
        });

        it('should retrieve an existing payment intent if one exists and is not succeeded', async () => {
            const existingPayment = { id: mockPaymentId, purchaseId: mockPurchaseId, stripePaymentIntentId: mockPaymentIntentId, status: PaymentStatus.PENDING };
            const dto: CreatePaymentIntentDto = { registrationId: mockRegistrationId };
            
            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistrationBase);
            (prisma.payment.findUnique as jest.Mock).mockResolvedValue(existingPayment);
            mockStripePaymentIntentRetrieve.mockResolvedValue({ id: mockPaymentIntentId, client_secret: mockClientSecret, status: 'requires_payment_method' });

            const result = await createPaymentIntent(dto, authUserJwt);

            expect(result.clientSecret).toBe(mockClientSecret);
            expect(mockStripePaymentIntentRetrieve).toHaveBeenCalledWith(mockPaymentIntentId);
            expect(mockStripePaymentIntentCreate).not.toHaveBeenCalled();
        });

        it('should throw AppError if existing payment intent has already succeeded', async () => {
            const existingSucceededPayment = { id: mockPaymentId, purchaseId: mockPurchaseId, stripePaymentIntentId: mockPaymentIntentId, status: PaymentStatus.COMPLETED };
             const dto: CreatePaymentIntentDto = { registrationId: mockRegistrationId };

            (prisma.registration.findUnique as jest.Mock).mockResolvedValue(mockRegistrationBase);
            (prisma.payment.findUnique as jest.Mock).mockResolvedValue(existingSucceededPayment);
            mockStripePaymentIntentRetrieve.mockResolvedValue({ id: mockPaymentIntentId, client_secret: mockClientSecret, status: 'succeeded' });
            
            await expect(createPaymentIntent(dto, authUserJwt))
                .rejects.toThrow(new AppError(400, 'Payment has already succeeded for this registration.'));
        });

    });

    describe('handleWebhookEvent (and helpers)', () => {
        const mockStripePaymentIntentId = 'pi_webhook_123';
        const mockRegistrationId = 789;
        const mockPurchaseId = 456; // Corrected typo

        const mockPaymentIntentSucceededEvent = {
            id: 'evt_1',
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: mockStripePaymentIntentId,
                    metadata: { registrationId: mockRegistrationId.toString() },
                    // ... other PI fields
                }
            }
        } as unknown as Stripe.Event; // Cast for test

         const mockPaymentIntentFailedEvent = {
            id: 'evt_2',
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: mockStripePaymentIntentId,
                    metadata: { registrationId: mockRegistrationId.toString() },
                    last_payment_error: { message: 'Card declined' }
                }
            }
        } as unknown as Stripe.Event;

        it('processPaymentSuccess: should update payment and registration status', async () => {
            const mockPaymentRecord = { id: 1, purchaseId: mockPurchaseId, status: PaymentStatus.PENDING, purchase: { registrationId: mockRegistrationId } };
            (prisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPaymentRecord);
            (prisma.payment.update as jest.Mock).mockResolvedValue({ ...mockPaymentRecord, status: PaymentStatus.COMPLETED });
            (prisma.registration.update as jest.Mock).mockResolvedValue({});
            // (prisma.ticket.update as jest.Mock).mockResolvedValue({}); // Ticket update logic is commented out in service

            // Test through the public handleWebhookEvent
            (prisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPaymentRecord);
            (prisma.payment.update as jest.Mock).mockResolvedValue({ ...mockPaymentRecord, status: PaymentStatus.COMPLETED });
            (prisma.registration.update as jest.Mock).mockResolvedValue({});
            
            await handleWebhookEvent(mockPaymentIntentSucceededEvent, 'sig_test_success');

            expect(prisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: PaymentStatus.COMPLETED } }));
            expect(prisma.registration.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: RegistrationStatus.CONFIRMED } }));
        });
        
        it('handleWebhookEvent: should be idempotent for payment_intent.succeeded if payment already completed', async () => {
            const mockPaymentRecordCompleted = { id: 1, purchaseId: mockPurchaseId, status: PaymentStatus.COMPLETED, purchase: { registrationId: mockRegistrationId } };
            (prisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPaymentRecordCompleted); // Simulate payment already completed

            await handleWebhookEvent(mockPaymentIntentSucceededEvent, 'sig_test_idempotent');
            
            expect(prisma.payment.update).not.toHaveBeenCalled();
            expect(prisma.registration.update).not.toHaveBeenCalled();
        });

        it('handleWebhookEvent: should update payment status to FAILED for payment_intent.payment_failed', async () => {
            const mockPaymentRecord = { id: 1, purchaseId: mockPurchaseId, status: PaymentStatus.PENDING };
            (prisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPaymentRecord); // For processPaymentFailure
            (prisma.payment.update as jest.Mock).mockResolvedValue({ ...mockPaymentRecord, status: PaymentStatus.FAILED });

            await handleWebhookEvent(mockPaymentIntentFailedEvent, 'sig_test_failure');

            expect(prisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: PaymentStatus.FAILED } }));
        });

        it('handleWebhookEvent: should be idempotent for payment_intent.payment_failed if payment already failed or completed', async () => {
            const mockPaymentRecordFailed = { id: 1, purchaseId: mockPurchaseId, status: PaymentStatus.FAILED };
            (prisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPaymentRecordFailed);

            await handleWebhookEvent(mockPaymentIntentFailedEvent, 'sig_test_idempotent_fail');
            
            expect(prisma.payment.update).not.toHaveBeenCalled();
        });
    });
});

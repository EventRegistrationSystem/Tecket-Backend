import Stripe from 'stripe';
import { PrismaClient, Prisma, PaymentMethod, PaymentStatus, RegistrationStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { CreatePaymentIntentDto, CreatePaymentIntentResponse, StripeWebhookEvent } from '../types/paymentTypes';

// Initialize Stripe with the secret key from environment variables
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error('Stripe secret key not found in environment variables.');
}
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-03-31.basil', // Use the latest API version
  typescript: true,
});

/**
 * Creates a Stripe Payment Intent for a given registration.
 * @param data - Data containing the registration ID.
 * @returns The client secret for the Payment Intent and the internal payment ID.
 */
export const createPaymentIntent = async (data: CreatePaymentIntentDto): Promise<CreatePaymentIntentResponse> => {
  const { registrationId } = data;

  // 1. Fetch Registration and related Purchase/Ticket details
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      event: true,
      purchase: {
        include: {
          ticket: true,
        },
      },
    },
  });

  if (!registration) {
    throw new AppError(404, 'Registration not found');
  }
  if (registration.event.isFree) {
    throw new AppError(400, 'Cannot create payment intent for a free event registration');
  }
  if (!registration.purchase || !registration.purchase.ticket) {
    throw new AppError(404, 'Purchase or ticket details missing for this registration');
  }
  if (registration.status !== RegistrationStatus.PENDING) {
    // Or potentially allow retrying failed payments? Depends on requirements.
    throw new AppError(400, 'Registration is not in a pending state for payment');
  }

  // 2. Calculate amount (Stripe expects amount in the smallest currency unit, e.g., cents)
  // Prisma Decimal needs conversion. Ensure totalPrice is correctly calculated and stored.
  const amountInCents = Math.round(Number(registration.purchase.totalPrice) * 100);
  const currency = 'aud'; // TODO: Make currency dynamic if needed (e.g., based on event or user location)

  // 3. Check if a payment record already exists for this purchase
  let payment = await prisma.payment.findUnique({
    where: { purchaseId: registration.purchase.id },
  });

  let paymentIntent: Stripe.PaymentIntent;

  if (payment && payment.stripePaymentIntentId) {
    // If payment exists and has an intent ID, try to retrieve it
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
      // Optional: Check if paymentIntent status allows confirmation (e.g., requires_payment_method)
      // If already succeeded, maybe throw error or return existing success status?
      if (paymentIntent.status === 'succeeded') {
         throw new AppError(400, 'Payment has already succeeded for this registration.');
      }
      // If needs update (e.g. amount changed - less common for simple checkout)
      // paymentIntent = await stripe.paymentIntents.update(payment.stripePaymentIntentId, { amount: amountInCents });

    } catch (error: any) {
       console.error(`Failed to retrieve or update PaymentIntent ${payment.stripePaymentIntentId}:`, error);
       // Decide how to handle - maybe create a new one if retrieval fails badly?
       // For now, rethrow or handle specific Stripe errors
       throw new AppError(500, `Failed to process existing payment intent: ${error.message}`);
    }

  } else {
     // 4. Create a new Stripe Payment Intent
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency,
        // Add metadata to link back to your system
        metadata: {
          registrationId: registration.id.toString(),
          purchaseId: registration.purchase.id.toString(),
          eventId: registration.eventId.toString(),
        },
        // Consider adding payment_method_types if needed, e.g., ['card']
        // automatic_payment_methods: { enabled: true }, // Often simpler
      });

      // 5. Create or Update Payment Record in DB
      const paymentData = {
        purchaseId: registration.purchase.id,
        stripePaymentIntentId: paymentIntent.id,
        amount: registration.purchase.totalPrice, // Store original decimal amount
        currency: currency,
        status: PaymentStatus.PENDING, // Initial status
        paymentMethod: PaymentMethod.CREDIT_CARD, // Use Enum
      };

      if (payment) {
        // Update existing payment record if it existed but lacked stripe ID
        payment = await prisma.payment.update({
          where: { id: payment.id },
          data: paymentData,
        });
      } else {
        // Create new payment record
        payment = await prisma.payment.create({
          data: paymentData,
        });
      }

    } catch (error: any) {
      console.error('Stripe Payment Intent creation failed:', error);
      throw new AppError(500, `Failed to create payment intent: ${error.message}`);
    }
  }


  if (!paymentIntent.client_secret) {
     throw new AppError(500, 'Failed to get client secret from Stripe Payment Intent');
  }

  // 6. Return client secret and internal payment ID
  return {
    clientSecret: paymentIntent.client_secret,
    paymentId: payment.id,
  };
};

/**
 * Handles incoming Stripe webhook events.
 * @param event - The verified Stripe webhook event.
 * @param signature - The raw signature header from the request (for logging/debugging).
 */
export const handleWebhookEvent = async (event: Stripe.Event, signature: string | undefined): Promise<void> => {
  console.log(`Received Stripe webhook: Type=${event.type}, ID=${event.id}`);

  // Handle specific event types
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntentSucceeded = event.data.object as Stripe.PaymentIntent;
      console.log(`PaymentIntent succeeded: ${paymentIntentSucceeded.id}`);
      await processPaymentSuccess(paymentIntentSucceeded);
      break;

    case 'payment_intent.payment_failed':
      const paymentIntentFailed = event.data.object as Stripe.PaymentIntent;
      console.error(`PaymentIntent failed: ${paymentIntentFailed.id}`, paymentIntentFailed.last_payment_error);
      await processPaymentFailure(paymentIntentFailed);
      break;

    // Add other event types as needed (e.g., charge.refunded, checkout.session.completed)

    default:
      console.warn(`Unhandled Stripe event type: ${event.type}`);
  }

  // Acknowledge receipt to Stripe (the controller should send 200 OK)
};


// --- Helper Functions for Webhook Processing ---

const processPaymentSuccess = async (paymentIntent: Stripe.PaymentIntent): Promise<void> => {
  const paymentIntentId = paymentIntent.id;
  const registrationId = paymentIntent.metadata?.registrationId;

  if (!registrationId) {
     console.error(`Webhook Error: Missing registrationId in metadata for PaymentIntent ${paymentIntentId}`);
     // Potentially query Payment table by stripePaymentIntentId if metadata missing?
     return; // Acknowledge webhook but log error
  }

  try {
    // Use a transaction to ensure atomicity
    // Use the correct transaction client type from Prisma
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Find the Payment record
      const payment = await tx.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        include: { purchase: true } // Include purchase to get registrationId if needed
      });

      if (!payment) {
        console.error(`Webhook Error: Payment record not found for PaymentIntent ${paymentIntentId}`);
        // This shouldn't happen if createPaymentIntent worked correctly
        return; // Acknowledge webhook but log error
      }

      // Idempotency check: If already completed, do nothing further
      if (payment.status === PaymentStatus.COMPLETED) {
        console.log(`Webhook Info: Payment ${payment.id} already marked as COMPLETED. Skipping update.`);
        return;
      }

      // 2. Update Payment status
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.COMPLETED },
      });

      // 3. Update Registration status
      const registrationIdInt = parseInt(registrationId, 10); // Parse once
      // Ensure the registrationId from metadata matches the payment's linked registration
      if (payment.purchase?.registrationId !== registrationIdInt) {
         console.error(`Webhook Error: Metadata registrationId (${registrationId}) does not match payment's registrationId (${payment.purchase?.registrationId}) for PaymentIntent ${paymentIntentId}`);
         // Throw error to rollback transaction? Or just log?
         throw new Error("Registration ID mismatch in webhook processing.");
      }

      await tx.registration.update({
        where: { id: registrationIdInt }, // Use parsed int
        data: { status: RegistrationStatus.CONFIRMED },
      });

      // 4. Optional: Update Ticket quantitySold (if not handled elsewhere)
      // Consider potential race conditions if multiple updates happen concurrently.
      // It might be better to handle this via triggers or aggregate queries periodically.
      // await tx.ticket.update({
      //   where: { id: payment.purchase.ticketId },
      //   data: { quantitySold: { increment: payment.purchase.quantity } },
      // });

      console.log(`Successfully processed payment_intent.succeeded for Registration ${registrationId}`);
    });
  } catch (error) {
    console.error(`Webhook Error: Failed to process payment_intent.succeeded for PaymentIntent ${paymentIntentId}:`, error);
    // Consider sending alert or queuing for retry
    // Do NOT throw error here if you want Stripe to stop retrying the webhook
  }
};

const processPaymentFailure = async (paymentIntent: Stripe.PaymentIntent): Promise<void> => {
  const paymentIntentId = paymentIntent.id;

  try {
    // Find the payment record, including purchase data
    const payment = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { purchase: true } // Added include for purchase data
    });

    if (!payment) {
      console.error(`Webhook Error: Payment record not found for failed PaymentIntent ${paymentIntentId}`);
      return;
    }

    // Idempotency check: If already failed or completed, do nothing
    if (payment.status === PaymentStatus.FAILED || payment.status === PaymentStatus.COMPLETED) {
       console.log(`Webhook Info: Payment ${payment.id} already marked as ${payment.status}. Skipping failure update.`);
       return;
    }

    // Update Payment status
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });

    // Note: We typically DON'T change the Registration status back here.
    // It remains PENDING, allowing the user to potentially retry with a different card.
    // The frontend should inform the user of the failure based on the confirmCardPayment result.

    console.log(`Successfully processed payment_intent.payment_failed for PaymentIntent ${paymentIntentId}`);

  } catch (error) {
    console.error(`Webhook Error: Failed to process payment_intent.payment_failed for PaymentIntent ${paymentIntentId}:`, error);
  }
};

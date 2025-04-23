import { Payment, PaymentStatus } from '@prisma/client';

// Interface for data needed to create a payment intent
export interface CreatePaymentIntentDto {
  registrationId: number;
  
  // Add other relevant fields if needed, e.g., specific items being purchased
  // For now, we assume the amount is derived from the registration/purchase
}

// Interface for the response when creating a payment intent
export interface CreatePaymentIntentResponse {
  clientSecret: string; // The client secret from Stripe PaymentIntent
  paymentId: number;    // The ID of the payment record in our DB
}

// Interface for data received from Stripe webhook events (simplified)
// Might need more specific types based on the events 
export interface StripeWebhookEvent {
  id: string;
  type: string; // e.g., 'payment_intent.succeeded', 'payment_intent.payment_failed'
  data: {
    object: any; // The Stripe object related to the event (e.g., PaymentIntent)
  };
}

// Can extend the Payment type from Prisma if needed, but often it's sufficient
// export interface PaymentDetails extends Payment {}
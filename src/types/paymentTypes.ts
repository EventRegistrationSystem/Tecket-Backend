import { PaymentStatus } from "@prisma/client";

// DTO for the request body when creating a payment intent
export interface CreatePaymentIntentDto {
    registrationId: number;
    paymentToken?: string; // Optional token for guest payments
}

// DTO for the response after creating a payment intent
export interface CreatePaymentIntentResponse {
    clientSecret: string;
    paymentId: number; // Internal payment record ID
}

// DTO for handling Stripe webhook events (basic structure)
export interface StripeWebhookEvent {
    id: string;
    type: string;
    data: {
        object: any; // Can be more specific based on event type
    };
    // Add other relevant fields from Stripe event object 
}
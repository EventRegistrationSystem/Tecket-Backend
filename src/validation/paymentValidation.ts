import Joi from 'joi';

// Schema for validating the request body when creating a payment intent
export const createPaymentIntentSchema = Joi.object({
    registrationId: Joi.number().integer().positive().required().messages({
        'number.base': 'Registration ID must be a number',
        'number.integer': 'Registration ID must be an integer',
        'number.positive': 'Registration ID must be a positive number',
        'any.required': 'Registration ID is required to create a payment intent'
    }),
    paymentToken: Joi.string().guid({ version: 'uuidv4' }).optional().messages({ // Optional UUID token
        'string.guid': 'Payment token must be a valid UUID'
    }),
    // Add other fields if needed later, e.g., specific items, amounts if not derived solely from registration
});

// Schema for validating webhook events (basic structure) - can be enhanced later
export const stripeWebhookSchema = Joi.object({
    id: Joi.string().required(),
    type: Joi.string().required(),
    // Add other relevant fields from Stripe event object if needed for validation
}).unknown(true); // Allow unknown fields from Stripe

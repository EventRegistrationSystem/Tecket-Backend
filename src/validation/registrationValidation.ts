import Joi from 'joi';
// Import the new DTO and the nested ParticipantInput type
import { CreateRegistrationDto, ParticipantInput } from '../types/registrationTypes';
// Keep participantValidationSchema if it defines the fields within ParticipantInput
import { participantValidationSchema } from './participantValidation';

// Define Joi schema for the nested ParticipantInput responses
const participantResponseSchema = Joi.object({
    eventQuestionId: Joi.number().integer().positive().required().messages({
        'number.base': 'Event Question ID must be a number',
        'number.integer': 'Event Question ID must be an integer',
        'number.positive': 'Event Question ID must be a positive number',
        'any.required': 'Event Question ID is required for each response'
    }),
    responseText: Joi.string().required().allow('').messages({ // Allow empty strings for optional text questions
        'string.base': 'Response text must be a string',
        'any.required': 'Response text is required' // Consider if truly required or depends on question.isRequired
    })
});

// Define Joi schema for the ParticipantInput structure
const participantInputSchema = Joi.object<ParticipantInput>({
    // Reuse participantValidationSchema fields if appropriate, or define here
    email: Joi.string().email().required().messages({
        'string.email': 'Must be a valid email address',
        'any.required': 'Participant email is required'
    }),
    firstName: Joi.string().required().messages({
        'any.required': 'Participant first name is required'
    }),
    lastName: Joi.string().required().messages({
        'any.required': 'Participant last name is required'
    }),
    phoneNumber: Joi.string().optional().allow(''),
    dateOfBirth: Joi.alternatives().try(Joi.date(), Joi.string()).optional(), // Allow date object or string
    address: Joi.string().optional().allow(''),
    city: Joi.string().optional().allow(''),
    state: Joi.string().optional().allow(''),
    zipCode: Joi.string().optional().allow(''),
    country: Joi.string().optional().allow(''),
    responses: Joi.array().items(participantResponseSchema).required().messages({
        'array.base': 'Participant responses must be an array',
        'any.required': 'Participant responses are required'
    })
});


// Define Joi schema for the main CreateRegistrationDto
export const registrationValidationSchema = Joi.object<CreateRegistrationDto>({
    eventId: Joi.number().integer().positive().required().messages({
        'number.base': 'Event ID must be a number',
        'number.integer': 'Event ID must be an integer',
        'number.positive': 'Event ID must be a positive number',
        'any.required': 'Event ID is required'
    }),
    userId: Joi.number().integer().positive().optional(), // Optional user ID
    tickets: Joi.array().items(
        Joi.object({
            ticketId: Joi.number().integer().positive().required().messages({
                'number.base': 'Ticket ID must be a number',
                'number.integer': 'Ticket ID must be an integer',
                'number.positive': 'Ticket ID must be a positive number',
                'any.required': 'Ticket ID is required for each ticket entry'
            }),
            quantity: Joi.number().integer().min(1).required().messages({
                'number.base': 'Ticket quantity must be a number',
                'number.integer': 'Ticket quantity must be an integer',
                'number.min': 'Ticket quantity must be at least 1',
                'any.required': 'Ticket quantity is required'
            })
        })
    ).min(1).required().messages({
        'array.base': 'Tickets must be an array',
        'array.min': 'At least one ticket type must be selected',
        'any.required': 'Ticket selection is required'
    }),
    participants: Joi.array().items(participantInputSchema).min(1).required().messages({
        'array.base': 'Participants must be an array',
        'array.min': 'At least one participant is required',
        'any.required': 'Participant details are required'
    })
    // Making sure no. of participants matches total ticket quantity
    .custom((participants, helpers) => {
        const tickets = helpers.state.ancestors[0].tickets; // Access the tickets array from the parent object
        if (!tickets) {
            // This case should ideally not happen if 'tickets' is required, but as a safeguard
            return helpers.error('any.custom', { message: 'Tickets data is missing for participant count validation.' });
        }
        const totalTicketQuantity = tickets.reduce((sum: number, ticket: any) => sum + ticket.quantity, 0);
        if (participants.length !== totalTicketQuantity) {
            return helpers.error('any.custom', { message: `Number of participants (${participants.length}) must match the total quantity of tickets (${totalTicketQuantity}).` });
        }
        return participants; // Return the value if validation passes
    }).messages({
        'any.custom': 'Participant count does not match the total ticket quantity.'
    })
});

// Validation for retrieving registrations (e.g., by event or user)
export const getRegistrationsQuerySchema = Joi.object({
    eventId: Joi.number().integer().positive().optional(),
    userId: Joi.number().integer().positive().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
});

// Validation for getting a single registration by ID (path parameter)
export const getRegistrationParamsSchema = Joi.object({
    registrationId: Joi.number().integer().positive().required().messages({
        'number.base': 'Registration ID must be a number',
        'number.integer': 'Registration ID must be an integer',
        'number.positive': 'Registration ID must be a positive number',
        'any.required': 'Registration ID is required in path'
    }),
});

// Validation for cancelling a registration
export const cancelRegistrationParamsSchema = Joi.object({
    registrationId: Joi.number().integer().positive().required().messages({
        'number.base': 'Registration ID must be a number',
        'number.integer': 'Registration ID must be an integer',
        'number.positive': 'Registration ID must be a positive number',
        'any.required': 'Registration ID is required'
    }),
});

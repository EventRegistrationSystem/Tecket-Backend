import Joi from 'joi';
import { QuestionType } from '@prisma/client';

// Get QuestionType enum values for Joi validation
const questionTypeEnumValues = Object.values(QuestionType);

// Schema for AddEventQuestionLinkDTO
export const addEventQuestionLinkSchema = Joi.object({
  body: Joi.object({
    questionId: Joi.number().integer().positive().optional(),
    questionText: Joi.string().min(1).max(1000).optional(),
    questionType: Joi.string().valid(...questionTypeEnumValues).default('TEXT').optional(),
    category: Joi.string().max(100).allow(null, '').optional(),
    validationRules: Joi.any().optional(),
    options: Joi.array().items(
      Joi.object({
        id: Joi.number().integer().positive().optional(),
        optionText: Joi.string().min(1).max(255).required().messages({
          'string.base': '"optionText" should be a type of string',
          'string.empty': '"optionText" cannot be empty',
          'string.min': '"optionText" should have a minimum length of {#limit}',
          'string.max': '"optionText" should have a maximum length of {#limit}',
          'any.required': '"optionText" is a required field'
        }),
        displayOrder: Joi.number().integer().positive().optional()
      })
    ).when('questionType', {
      is: QuestionType.DROPDOWN, // Use the enum member for clarity
      then: Joi.array().min(1).required().messages({
        'array.min': 'At least one option is required for DROPDOWN questions.',
        'any.required': 'Options are required for DROPDOWN questions.'
      }),
      otherwise: Joi.array().optional()
    }),
    isRequired: Joi.boolean().required(),
    displayOrder: Joi.number().integer().positive().required(),
  }).or('questionId', 'questionText') // Ensures at least one of questionId or questionText is provided
    .messages({
      'object.missing': 'Either questionId or questionText must be provided for the question.',
    }),
});

// Schema for UpdateEventQuestionLinkDTO
export const updateEventQuestionLinkSchema = Joi.object({
  body: Joi.object({
    isRequired: Joi.boolean().optional(),
    displayOrder: Joi.number().integer().positive().optional(),
  }).min(1) // Ensures at least one key is present in the body for an update
    .messages({
      'object.min': 'At least one field (isRequired or displayOrder) must be provided for an update.',
    }),
});

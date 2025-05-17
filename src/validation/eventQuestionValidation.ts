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

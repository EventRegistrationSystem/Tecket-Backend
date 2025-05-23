import { QuestionType } from "@prisma/client";

export interface AddEventQuestionLinkDTO {
  questionId?: number;      // ID of an existing global question to link
  questionText?: string;    // If questionId is not provided, text for a new/existing global question
  questionType?: QuestionType; // Type for a new global question, defaults to TEXT
  category?: string;          // Category for a new global question
  validationRules?: any;      // Validation rules for a new global question (JSON type in Prisma)
  options?: Array<{ id?: number; optionText: string; displayOrder?: number }>; // Options for choice-based questions (e.g., DROPDOWN)
  isRequired: boolean;
  displayOrder: number;
}

export interface UpdateEventQuestionLinkDTO {
  isRequired?: boolean;
  displayOrder?: number;
}

// For responses, if needed, though often part of EventQuestion details
export interface EventQuestionWithQuestionDetails {
  id: number; // EventQuestions ID
  eventId: number;
  questionId: number;
  isRequired: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  question: { // Details from the linked Question record
    id: number;
    questionText: string;
    questionType: QuestionType;
    category?: string | null;
    validationRules?: any | null;
    options?: Array<{ id: number; optionText: string; displayOrder?: number | null }>; // Options for choice-based questions
  };
  _count?: { // Response count
    responses: number;
  };
}

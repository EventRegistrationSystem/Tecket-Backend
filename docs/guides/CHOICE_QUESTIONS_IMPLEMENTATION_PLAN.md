# Choice-Based Questions Feature: Detailed Implementation Plan

**Date:** 2025-05-21
**Last Updated:** 2025-05-25 (Backend for DROPDOWN and CHECKBOX complete; Frontend for DROPDOWN and CHECKBOX complete)

## 1. Goal

To extend the event registration system to support questions with pre-defined choices, such as multiple-choice (single answer) and multiple-choice (multiple answers), in addition to existing text-based questions.
**Status:** Backend implementation for single-choice (`DROPDOWN`) and multiple-choice (`CHECKBOX`) questions is complete. Frontend implementation for `DROPDOWN` and `CHECKBOX` types is complete.

## 2. Backend Implementation Steps

### 2.1. Prisma Schema Modifications (`prisma/schema.prisma`) [DONE for DROPDOWN & CHECKBOX support]

1.  **Update `QuestionType` Enum:** [DONE (Used existing `DROPDOWN` and `CHECKBOX`)]
    *   Used existing `DROPDOWN` type for single-choice questions and `CHECKBOX` for multiple-choice multiple answers.
    *   The `QuestionType` enum is `TEXT, CHECKBOX, DROPDOWN`.
    *   Backend support for `CHECKBOX` options and response validation is now implemented.
    *   *File:* `prisma/schema.prisma`
    *   *Action:* No schema changes were needed for `CHECKBOX` type itself as it existed. `QuestionOption` model is used for its options.

2.  **Create `QuestionOption` Model:** [DONE]
    *   Defined fields: `id` (Int, PK), `questionId` (Int, FK to `Question`), `optionText` (String), `displayOrder` (Int, optional).
    *   Established relation to `Question` model. Added `onDelete: Cascade`.
    *   Added unique constraint: `@@unique([questionId, optionText])`.
    *   *File:* `prisma/schema.prisma`
    *   *Action:* Added new model definition.

3.  **Update `Question` Model:** [DONE]
    *   Added a one-to-many relation to `QuestionOption` (`options QuestionOption[]`).
    *   *File:* `prisma/schema.prisma`
    *   *Action:* Added new field to the model.

4.  **Review `Response` Model:** [REVIEWED/CONFIRMED for DROPDOWN & CHECKBOX]
    *   Confirmed `responseText` (String) will store the selected option text for `DROPDOWN` questions.
    *   Confirmed `responseText` (String) will store a JSON string array of selected option texts for `CHECKBOX` questions.
    *   *File:* `prisma/schema.prisma`
    *   *Action:* Reviewed and confirmed usage for both types.

5.  **Run Prisma Migration:** [DONE]
    *   Executed `npx prisma migrate dev --name add_question_options` (after seed script fixes and db reset).
    *   Migration applied successfully.
    *   *Action:* CLI command executed.

### 2.2. DTO Updates (`src/types/`) [DONE for DROPDOWN & CHECKBOX support]

1.  **Update `QuestionInputDto` (`AddEventQuestionLinkDTO` in `src/types/questionTypes.ts` and used in `CreateEventDTO` in `src/types/eventTypes.ts`):** [DONE]
    *   Added `options?: Array<{ id?: number; optionText: string; displayOrder?: number }>` to `AddEventQuestionLinkDTO`.
    *   Updated `CreateEventDTO` to use `AddEventQuestionLinkDTO[]` for its `questions` field.
    *   *Files:* `src/types/questionTypes.ts`, `src/types/eventTypes.ts`.
    *   *Action:* Modified interfaces.

2.  **Update `QuestionResponseDto` (`EventQuestionWithQuestionDetails` in `src/types/questionTypes.ts`):** [DONE]
    *   Ensured `question.options: Array<{ id: number; optionText: string; displayOrder?: number | null }>` is included when returning question details.
    *   *File:* `src/types/questionTypes.ts`.
    *   *Action:* Modified interface.

3.  **Review `ParticipantInput.responses.responseText` (`src/types/registrationTypes.ts`):** [REVIEWED/CONFIRMED for DROPDOWN & CHECKBOX]
    *   `responseText` will store the selected option string for `DROPDOWN`.
    *   `responseText` will store a JSON string array of selected option texts for `CHECKBOX`.
    *   *Action:* Confirmed.

### 2.3. Service Layer Implementation (`src/services/`) [DONE for DROPDOWN & CHECKBOX support]

1.  **`EventQuestionService` (`addQuestionToEvent` method):** [DONE for new DROPDOWN & CHECKBOX questions]
    *   Modified `addQuestionToEvent` to accept `options` array from `AddEventQuestionLinkDTO`.
    *   If `questionType` is `DROPDOWN` or `CHECKBOX`, it creates `QuestionOption` records using a nested write when a new global `Question` is created.
    *   Full update/delete logic for options of *existing* global questions, or cleaning options if type changes, is not yet part of `addQuestionToEvent`.
    *   *File:* `src/services/eventQuestionService.ts`.
    *   *Action:* Modified method logic.
    *   Modified `getEventQuestions` to include `question.options` in the response.

2.  **`EventService.createEvent` and `EventService.updateEvent`:** [DONE]
    *   `createEvent` refactored to use `EventQuestionService.addQuestionToEvent`, passing `actorUserId`, `actorUserRole`, and full question DTO (including `questionType`, `options`).
    *   `updateEvent` updated to pass the full question DTO to `EventQuestionService.addQuestionToEvent`.
    *   `getEventWithDetails` updated to include `question.options`.
    *   *File:* `src/services/eventServices.ts`.
    *   *Action:* Modified method logic.

3.  **`RegistrationService.createRegistration`:** [DONE for DROPDOWN & CHECKBOX validation]
    *   **Enhance Response Validation Logic:**
        *   Updated to fetch `eventData` including `eventQuestions.question.options`.
        *   For `DROPDOWN` questions, validates `responseText` against `optionText` values.
        *   For `CHECKBOX` questions, parses `responseText` (JSON string array) and validates each selected `optionText`.
    *   *File:* `src/services/registrationServices.ts`.
    *   *Action:* Modified response validation logic.

### 2.4. Validation Schema Updates (`src/validation/`) [DONE for DROPDOWN & CHECKBOX support]

1.  **`eventQuestionValidationSchema` (`addEventQuestionLinkSchema` in `src/validation/eventQuestionValidation.ts`):** [DONE]
    *   Added validation for `options` array.
    *   Used `Joi.when('questionType', { is: Joi.string().valid(QuestionType.DROPDOWN, QuestionType.CHECKBOX), then: Joi.array().min(1).required(), otherwise: Joi.array().optional() })` to make `options` required for `DROPDOWN` or `CHECKBOX` type.
    *   *File:* `src/validation/eventQuestionValidation.ts`.
    *   *Action:* Modified Joi schema.

2.  **`registrationValidationSchema` (`src/validation/registrationValidation.ts`):** [REVIEWED/NO CHANGE NEEDED]
    *   For `responseText` within `participantInputSchema.responses`:
        *   Basic validation remains. Detailed choice validation occurs in `RegistrationService`.
    *   *Action:* Reviewed, no changes needed here.

### 2.5. Controller & Route Updates (`src/controllers/`, `src/routes/`) [PARTIALLY DONE]

1.  **`EventController` / `EventQuestionController`:** [DONE for `EventController.createEvent`]
    *   `EventController.createEvent` updated to pass new arguments (`actorUserId`, `actorUserRole`) to `EventService.createEvent` due to signature change.
    *   Other controller methods using DTOs that now include `options` (e.g., for updating events with questions) will implicitly handle them if they pass the DTOs through. Explicit checks/tests for these flows are pending.
    *   No new routes created.
    *   *File:* `src/controllers/eventController.ts`.
    *   *Action:* Updated `createEvent` method.

2.  **API Response for `GET /api/events/:id`:** [DONE]
    *   `EventService.getEventWithDetails` (which likely powers this route) now populates `eventQuestions.question.options`.
    *   *Action:* Verified service logic.

## 3. Frontend Implementation Steps

*(Assumes Vue.js with Pinia, adjust as per actual frontend stack)* [DONE for DROPDOWN & CHECKBOX types]

### 3.1. Event Creation/Management UI (Admin/Organizer) [DONE for DROPDOWN & CHECKBOX types]

1.  **Question Form Component (`src/views/admin/Event/EventFormView.vue`):** [DONE for DROPDOWN & CHECKBOX types]
    *   **Question Type Selector:** "Dropdown" (maps to frontend `select` type) and "Checkboxes" (maps to frontend `checkbox` type) are available.
    *   **Options Management UI:**
        *   Conditionally displays an "Options" section for `select` and `checkbox` types.
        *   Allows dynamic adding/removing of option text fields (stored as an array of strings locally).
        *   `displayOrder` is implicitly handled by array order during submission.
    *   **API Call:** When saving, `select` type is mapped to `DROPDOWN` and `checkbox` type is mapped to `CHECKBOX`. The local array of option strings is transformed into an array of `{optionText: string, displayOrder: number}` objects for the backend payload. Backend `DROPDOWN` and `CHECKBOX` options (array of objects) are mapped to an array of strings for UI display.

### 3.2. Registration Form UI (Participant) [DONE for DROPDOWN & CHECKBOX types]

1.  **Fetch Event Details:** [CONFIRMED, relies on `eventServices.fetchEventDetails` and `registrationStore.setEvent`]
    *   `EventDetailsView.vue` fetches event data, which includes `eventQuestions`. The `registrationStore` stores this.
    *   Backend `DROPDOWN` and `CHECKBOX` questions should include `question.question.options` as an array of objects.

2.  **Dynamic Question Rendering Component (`src/views/registration/QuestionnaireFormView.vue`):** [DONE for DROPDOWN & CHECKBOX types]
    *   Iterates through questions from the store.
    *   Renders an HTML `<select>` element for `question.question.questionType === 'DROPDOWN'`.
    *   Renders a group of HTML `<input type="checkbox">` elements for `question.question.questionType === 'CHECKBOX'`.
    *   Populates `<option>` elements or checkboxes from `question.question.options`, using `optionObj.optionText` for value and display.
    *   Includes `updateCheckboxResponse` function to manage multiple selections for `CHECKBOX` type.

3.  **Data Submission (`ReviewFormView.vue` or submission logic via `registrationStore.getRegistrationPayload`):** [CONFIRMED for DROPDOWN & CHECKBOX types]
    *   When constructing the `participants[n].responses` array for `POST /api/registrations`:
        *   For `DROPDOWN` (single-choice): `responseText` is the string value of the selected `optionText`.
        *   For `CHECKBOX` (multiple-choice multiple answers): `responseText` is a JSON string array of selected `optionText`s.
        *   For `TEXT` and other types: `responseText` remains a simple string.

### 3.3. Displaying Responses (Admin/Organizer Views & Participant Profile)

1.  **Registration Details View (`RegistrationDetailsView.vue`, User Profile):**
    *   When displaying responses for an attendee:
        *   Fetch the `questionType` for the question associated with the response.
        *   If `MULTIPLE_CHOICE_SINGLE` or `TEXT`: Display `responseText` directly.
        *   If `MULTIPLE_CHOICE_MULTIPLE`:
            *   Attempt to `JSON.parse(responseText)`.
            *   If successful and it's an array, display the array elements (e.g., join with ", " or as list items).
            *   If parsing fails or it's not an array, display the raw `responseText` as a fallback.

## 4. Testing Plan

1.  **Backend Unit Tests (Jest):**
    *   `EventQuestionService`: Test creation/update of questions with options, including edge cases (empty options, changing question type).
    *   `RegistrationService`: Test response validation for new question types (valid choices, required choices, invalid choices).
2.  **Backend Integration Tests (API level):**
    *   Test `POST /api/events` with choice-based questions and options.
    *   Test `GET /api/events/:id` to ensure questions and options are returned correctly.
    *   Test `POST /api/registrations` with responses to choice-based questions (single and multiple selections).
3.  **Frontend Manual Testing:**
    *   Organizer UI: Create/edit events with all question types, including managing options.
    *   Participant UI: Register for events, ensuring choice-based questions render and submit correctly.
    *   Admin/Organizer/Participant Views: Verify submitted responses for choice-based questions are displayed accurately.

## 5. Timeline & Phases (High-Level)

*   **Phase 1: Backend Core Logic** [DONE for DROPDOWN & CHECKBOX]
    *   Prisma schema changes & migration. [DONE]
    *   DTO updates. [DONE]
    *   Service layer updates for question & option management (CRUD for new DROPDOWN & CHECKBOX questions). [DONE]
    *   Basic validation schema updates. [DONE]
*   **Phase 2: Backend Registration Logic & API Polish** [DONE for DROPDOWN & CHECKBOX]
    *   `RegistrationService` updates for response validation (for DROPDOWN & CHECKBOX). [DONE]
    *   Ensure `GET /api/events/:id` returns options correctly. [DONE]
    *   Controller and route checks (initial updates for `EventController.createEvent` done). [PARTIALLY DONE]
*   **Phase 3: Frontend - Organizer UI** [COMPLETED for DROPDOWN & CHECKBOX types]
    *   Implemented question type selector updates and options management for `DROPDOWN` and `CHECKBOX` types in `EventFormView.vue`.
*   **Phase 4: Frontend - Participant Registration UI** [COMPLETED for DROPDOWN & CHECKBOX types]
    *   Implemented dynamic rendering of `DROPDOWN` and `CHECKBOX` questions in `QuestionnaireFormView.vue`.
    *   Confirmed correct data submission format for `DROPDOWN` and `CHECKBOX` responses via `registrationStore`.
*   **Phase 5: Frontend - Displaying Responses & Testing** [PENDING for DROPDOWN display, PENDING for CHECKBOX display, PENDING for Frontend Testing, Backend Testing also pending]
    *   Update views that display registration responses.
    *   Comprehensive testing (unit, integration, manual).

This detailed plan should provide a solid roadmap for implementing the choice-based questions feature.

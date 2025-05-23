# Choice-Based Questions Feature: Detailed Implementation Plan

**Date:** 2025-05-21

## 1. Goal

To extend the event registration system to support questions with pre-defined choices, such as multiple-choice (single answer) and multiple-choice (multiple answers), in addition to existing text-based questions.

## 2. Backend Implementation Steps

### 2.1. Prisma Schema Modifications (`prisma/schema.prisma`)

1.  **Update `QuestionType` Enum:**
    *   Add `MULTIPLE_CHOICE_SINGLE` (for radio buttons/dropdown).
    *   Add `MULTIPLE_CHOICE_MULTIPLE` (for checkboxes).
    *   Consider adding `TEXTAREA` for longer text inputs if not already present.
    *   *File:* `prisma/schema.prisma`
    *   *Action:* Modify the enum definition.

2.  **Create `QuestionOption` Model:**
    *   Define fields: `id` (Int, PK), `questionId` (Int, FK to `Question`), `optionText` (String), `displayOrder` (Int, optional).
    *   Establish a relation to the `Question` model (`question Question @relation(...)`).
    *   Add a unique constraint: `@@unique([questionId, optionText])`.
    *   *File:* `prisma/schema.prisma`
    *   *Action:* Add new model definition.

3.  **Update `Question` Model:**
    *   Add a one-to-many relation to `QuestionOption` (`options QuestionOption[]`).
    *   *File:* `prisma/schema.prisma`
    *   *Action:* Add new field to the model.

4.  **Review `Response` Model:**
    *   Confirm `responseText` (String) will store the selected option text for `MULTIPLE_CHOICE_SINGLE`.
    *   Confirm `responseText` (String) will store a JSON string array of selected option texts for `MULTIPLE_CHOICE_MULTIPLE`.
    *   No schema changes strictly needed here if `responseText` is used, but ensure services handle the (de)serialization.
    *   *File:* `prisma/schema.prisma`
    *   *Action:* Review and confirm usage.

5.  **Run Prisma Migration:**
    *   Execute `npx prisma migrate dev --name add_choice_question_support`.
    *   Verify migration file is generated correctly.
    *   *Action:* CLI command.

### 2.2. DTO Updates (`src/types/`)

1.  **Update `QuestionInputDto` (`src/types/questionTypes.ts` or `eventTypes.ts`):**
    *   Add `options?: Array<{ optionText: string; displayOrder?: number; id?: number }>`. `id` is for updating existing options.
    *   *File:* Relevant type definition file.
    *   *Action:* Modify interface.

2.  **Update `QuestionResponseDto` (or equivalent, e.g., in `EventQuestionResponseDto`):**
    *   Ensure it includes `options: Array<{ id: number; optionText: string; displayOrder?: number }>` when returning question details.
    *   *File:* Relevant type definition file.
    *   *Action:* Modify interface.

3.  **Review `ParticipantInput.responses.responseText` (`src/types/registrationTypes.ts`):**
    *   No DTO change, but document that `responseText` will now handle single strings or JSON string arrays based on `questionType`.
    *   *Action:* Add comment/documentation if needed.

### 2.3. Service Layer Implementation (`src/services/`)

1.  **`EventQuestionService` (or `QuestionService` if global questions are managed separately):**
    *   **Modify `createOrUpdateQuestion` (or similar method):**
        *   Accept `options` array in the input DTO.
        *   If `questionType` is choice-based:
            *   Within a Prisma transaction (`tx`):
                *   Create/update the `Question` record.
                *   Manage `QuestionOption` records:
                    *   **Identify options to delete:** Compare incoming options with existing options for the question. Delete any existing options not present in the incoming `options` array (by `id` if provided, or by `optionText` if managing by text).
                    *   **Identify options to update:** If incoming options have `id`s, update their `optionText` or `displayOrder`.
                    *   **Identify options to add:** For incoming options without an `id` (or if `id` doesn't match an existing one), create new `QuestionOption` records linked to the question.
        *   If `questionType` is not choice-based, ensure any existing options for that question are deleted (in case type changed from choice to non-choice).
    *   *File:* `src/services/eventQuestionService.ts` (or equivalent).
    *   *Action:* Implement/modify method logic.

2.  **`EventService.createEvent` and `EventService.updateEvent`:**
    *   Ensure these methods correctly pass the `options` data from the event DTO to the `EventQuestionService` when creating/linking questions.
    *   *File:* `src/services/eventServices.ts`.
    *   *Action:* Modify method logic if questions are created/managed through `EventService`.

3.  **`RegistrationService.createRegistration`:**
    *   **Enhance Response Validation Logic:**
        *   After fetching `eventData` (which includes `eventQuestions` with their `questionType` and `options`):
        *   For each response in `participant.responses`:
            *   Retrieve the corresponding `EventQuestion` and its `Question` details (including `questionType` and `options`).
            *   If `questionType` is `MULTIPLE_CHOICE_SINGLE`:
                *   If question is required, ensure `responseText` is not empty.
                *   Ensure `responseText` matches one of the `optionText` values from the question's `options`.
            *   If `questionType` is `MULTIPLE_CHOICE_MULTIPLE`:
                *   Attempt to parse `responseText` as a JSON array of strings.
                *   If question is required and array is empty, throw validation error.
                *   For each string in the parsed array, ensure it matches one of the `optionText` values from the question's `options`. If any don't match, throw validation error.
    *   *File:* `src/services/registrationServices.ts`.
    *   *Action:* Modify response validation logic.

### 2.4. Validation Schema Updates (`src/validation/`)

1.  **`eventQuestionValidationSchema` (or equivalent for question input):**
    *   Add validation for `options` array:
        *   `Joi.array().items(Joi.object({ id: Joi.number().integer().positive().optional(), optionText: Joi.string().required(), displayOrder: Joi.number().integer().optional() })).optional()`.
    *   Use `Joi.when('questionType', { is: Joi.string().valid('MULTIPLE_CHOICE_SINGLE', 'MULTIPLE_CHOICE_MULTIPLE'), then: Joi.array().min(1).required(), otherwise: Joi.array().optional() })` to make `options` required and non-empty for choice types.
    *   *File:* `src/validation/eventQuestionValidation.ts` (or equivalent).
    *   *Action:* Modify Joi schema.

2.  **`registrationValidationSchema` (`src/validation/registrationValidation.ts`):**
    *   For `responseText` within `participantInputSchema.responses`:
        *   Keep basic validation (e.g., `Joi.string().required().allow('')`).
        *   Detailed choice validation will occur in the service layer as it requires fetched question data.
    *   *Action:* Review, likely no major changes here if service-layer validation is preferred for choice specifics.

### 2.5. Controller & Route Updates (`src/controllers/`, `src/routes/`)

1.  **`EventController` / `EventQuestionController`:**
    *   Ensure controllers pass the new DTO fields (including `options` for questions) to the respective services.
    *   No new routes are strictly needed for this if existing event/question CRUD endpoints are modified.
    *   *File:* `src/controllers/eventController.ts`, `src/controllers/eventQuestionController.ts`.
    *   *Action:* Update controller methods if necessary.

2.  **API Response for `GET /api/events/:id`:**
    *   Ensure the `EventQuestionService` (or `EventService`) populates `eventQuestions.question.options` in the response.
    *   *Action:* Verify service logic populates this for the controller.

## 3. Frontend Implementation Steps

*(Assumes Vue.js with Pinia, adjust as per actual frontend stack)*

### 3.1. Event Creation/Management UI (Admin/Organizer)

1.  **Question Form Component:**
    *   **Question Type Selector:** Update dropdown to include "Multiple Choice - Single Answer", "Multiple Choice - Multiple Answers".
    *   **Options Management UI:**
        *   Conditionally display an "Options" section when a choice-based `questionType` is selected.
        *   Allow dynamic adding/removing of option text fields.
        *   Allow setting `displayOrder` for options (e.g., drag-and-drop or input fields).
        *   Store options in local component state (e.g., an array of objects: `{ optionText: '...', displayOrder: 1 }`).
    *   **API Call:** When saving the question (as part of event creation/update or standalone question management), include the `questionType` and the `options` array in the payload to the backend.

### 3.2. Registration Form UI (Participant)

1.  **Fetch Event Details:**
    *   When `EventDetailsView.vue` (or similar) fetches event data, ensure the API response includes `eventQuestions` with their `question.questionType` and `question.options`.
    *   Store this data in Pinia store (`registrationStore.js` or `eventStore.js`).

2.  **Dynamic Question Rendering Component (`QuestionnaireFormView.vue` or similar):**
    *   Iterate through questions from the store.
    *   Use a `v-if`/`v-else-if` or a dynamic component (`<component :is="...">`) to render the appropriate input based on `question.questionType`:
        *   `TEXT`: `<input type="text">`
        *   `MULTIPLE_CHOICE_SINGLE`: Render as a group of `<input type="radio">` or a `<select>` element. Bind to a model that stores the selected `optionText`.
        *   `MULTIPLE_CHOICE_MULTIPLE`: Render as a group of `<input type="checkbox">`. Bind to a model that stores an array of selected `optionText`s.
    *   Populate radio buttons, select options, or checkboxes from `question.options`.

3.  **Data Submission (`ReviewFormView.vue` or submission logic):**
    *   When constructing the `participants[n].responses` array for `POST /api/registrations`:
        *   For `MULTIPLE_CHOICE_SINGLE`: `responseText` should be the string value of the selected option.
        *   For `MULTIPLE_CHOICE_MULTIPLE`: `responseText` should be `JSON.stringify(arrayOfSelectedOptionTexts)`.
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

*   **Phase 1: Backend Core Logic**
    *   Prisma schema changes & migration.
    *   DTO updates.
    *   Service layer updates for question & option management (CRUD).
    *   Basic validation schema updates.
*   **Phase 2: Backend Registration Logic & API Polish**
    *   `RegistrationService` updates for response validation.
    *   Ensure `GET /api/events/:id` returns options correctly.
    *   Controller and route checks.
*   **Phase 3: Frontend - Organizer UI**
    *   Implement question type selector and options management in event creation/editing forms.
*   **Phase 4: Frontend - Participant Registration UI**
    *   Implement dynamic rendering of choice-based questions.
    *   Implement correct data submission format for responses.
*   **Phase 5: Frontend - Displaying Responses & Testing**
    *   Update views that display registration responses.
    *   Comprehensive testing (unit, integration, manual).

This detailed plan should provide a solid roadmap for implementing the choice-based questions feature.

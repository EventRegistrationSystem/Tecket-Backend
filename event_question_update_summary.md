# Event Service - Question Update Logic Summary

This document summarizes the work done to implement and test the logic for handling updates to questions associated with an event within the `EventService.updateEvent` method.

## 1. Goal

The objective was to replace the previous simplistic question handling logic in `updateEvent` (which deleted all unanswered questions and created new ones) with a more robust approach that allows for adding, updating, and removing questions correctly, while preserving questions that have already received responses.

## 2. Analysis & Design Decisions

1.  **Initial Review:** Examined the existing `updateEvent` method in `src/services/eventServices.ts` and identified the `// TODO:` comment regarding question update logic.
2.  **Schema Review:** Inspected `prisma/schema.prisma` to understand the `Question` and `EventQuestions` models and their relationships/constraints.
    *   **Key Finding 1:** The `Question` model does **not** have a unique constraint on `questionText`. This means we cannot reliably use `prisma.question.upsert` with `questionText` as the unique identifier, as slight variations in text would create duplicate `Question` records.
    *   **Key Finding 2:** The `EventQuestions` model (linking Events and Questions) does **not** have a unique constraint on the combination of `eventId` and `questionId`. This prevents using `prisma.eventQuestions.upsert` based on the event-question relationship.
3.  **Chosen Logic:** Based on the schema limitations, the following manual approach was chosen for implementation within the `updateEvent` database transaction:
    *   Fetch all existing `EventQuestions` links for the specific event, including their `id`, `questionId`, and a count of associated `responses`. Store these in a map for easy lookup (`questionId` -> `EventQuestions` record).
    *   Initialize a set to track the `EventQuestions` link IDs (`id`) that should remain after the update.
    *   Iterate through the `questions` array provided in the update request (`eventData.questions`). This array represents the desired *final* state of questions for the event.
    *   For each `incomingQuestion`:
        *   Attempt to find an existing `Question` record matching the exact `incomingQuestion.questionText`.
        *   If found, use its `questionId`.
        *   If not found, create a new `Question` record and use the new `questionId`.
        *   Check if an `EventQuestions` link already exists for this `eventId` and `questionId` (using the map created earlier).
        *   If a link exists:
            *   Compare `isRequired` and `displayOrder`. If they differ, update the existing `EventQuestions` record using its `id`.
            *   Add the `EventQuestions` link's `id` to the tracking set (it should remain).
        *   If no link exists:
            *   Create a new `EventQuestions` record linking the `eventId` and `questionId`, setting `isRequired` and `displayOrder`.
            *   Add the new link's `id` to the tracking set.
    *   After processing all incoming questions, determine which *original* `EventQuestions` links need to be deleted: Filter the initially fetched `existingEventQuestions` to find those whose `id` is *not* in the tracking set AND whose `_count.responses` is 0.
    *   Perform a `deleteMany` on `EventQuestions` using the IDs of the links identified for deletion.
    *   Handle the case where `eventData.questions` is provided but is an empty array (should remove all unanswered questions).
    *   Handle the case where `eventData.questions` is `undefined` (should not modify questions at all).

## 3. Implementation Steps

1.  **Applied Logic:** Replaced the previous question handling block within the `prisma.$transaction` in `EventService.updateEvent` (`src/services/eventServices.ts`) with the logic described above using `replace_in_file`.
2.  **Corrected `upsert` Error:** Initially attempted to use `prisma.question.upsert` based on `questionText`, which failed due to the lack of a unique constraint. Corrected the logic to use `findFirst` and `create` instead.

## 4. Testing Steps

1.  **Reviewed Existing Tests:** Examined `src/__tests__/unit/eventService.test.ts` and found no existing tests specifically covering the question update logic within `updateEvent`.
2.  **Updated Mocks:** Added necessary mocks for `prisma.question.findFirst`, `prisma.question.create`, and `prisma.eventQuestions.update` to the `jest.mock` setup.
3.  **Added New Test Cases:** Added several new test cases within the `describe('updateEvent', ...)` block to cover:
    *   Adding a new question.
    *   Updating `isRequired`/`displayOrder` of an existing linked question.
    *   Removing an unanswered question link.
    *   *Not* removing a question link that has responses.
    *   Removing all unanswered questions when an empty array `[]` is provided.
    *   Not modifying questions when the `questions` property is `undefined`.
4.  **Executed Tests:** Ran `npx jest src/__tests__/unit/eventService.test.ts`.

## 5. Final Result

After implementing the revised logic and adding comprehensive unit tests, the command `npx jest src/__tests__/unit/eventService.test.ts` was executed, and **all tests passed**.

This confirms that the `updateEvent` method now handles event question updates more robustly according to the defined logic and requirements.

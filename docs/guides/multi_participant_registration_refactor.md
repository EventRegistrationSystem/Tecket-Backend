# Multi-Participant Registration Refactor Summary

**Date:** 2025-05-01

This document details the changes implemented in the backend (`Capstone-Backend`) to refactor the registration system to support multiple participants (attendees) being registered within a single transaction, aligning with the frontend workflow where details are collected for each ticket purchased.

## 1. Goal

The primary goal was to modify the system to accurately store details and questionnaire responses for each individual attendee when multiple tickets are bought in one registration, rather than linking everything only to the primary registrant.

## 2. Database Schema Changes (`prisma/schema.prisma`)

*   **New `Attendee` Model:**
    *   Created to explicitly link a `Registration` record with a `Participant` record. Each `Attendee` record represents one individual attending under a specific registration.
    *   Fields: `id`, `registrationId`, `participantId`, `createdAt`, `updatedAt`.
    *   Relations: Belongs to `Registration`, belongs to `Participant`, has many `Response` records.
*   **`Registration` Model Updates:**
    *   Added `attendees Attendee[]` relation (one-to-many).
    *   Removed the direct `responses Response[]` relation (responses are now linked via `Attendee`).
    *   Kept the `participantId` field to identify the primary registrant easily.
*   **`Participant` Model Updates:**
    *   Added `attendees Attendee[]` relation (one-to-many).
*   **`Response` Model Updates:**
    *   Removed `registrationId` field and its relation.
    *   Added `attendeeId` field and `attendee Attendee` relation (many-to-one), linking each answer to a specific `Attendee`.
*   **`Purchase` Model Refactor:**
    *   Removed `ticketId`, `quantity`, `unitPrice` fields.
    *   Removed direct relation to `Ticket`.
    *   Added `items PurchaseItem[]` relation (one-to-many).
*   **New `PurchaseItem` Model:**
    *   Created to store details for each type of ticket bought within a single `Purchase`.
    *   Fields: `id`, `purchaseId`, `ticketId`, `quantity`, `unitPrice`.
    *   Relations: Belongs to `Purchase`, belongs to `Ticket`.
*   **`Ticket` Model Updates:**
    *   Removed direct `purchases Purchase[]` relation.
    *   Added `purchaseItems PurchaseItem[]` relation.
*   **Migrations:** Applied `20250501092344_add_attendee_handling` and `20250503063731_refactor_purchase_for_multi_ticket_types` migrations.
*   **Prisma Client:** Regenerated using `npx prisma generate`.

## 3. API DTO Changes (`src/types/registrationTypes.ts`)

*   **`ParticipantInput` Interface:** Created to define the expected structure for each participant's data within the main registration request. Includes standard participant fields (name, email, etc.) and a nested `responses` array (`{ eventQuestionId, responseText }`) for answers specific to that participant.
*   **`CreateRegistrationDto` Interface:** Replaced the previous DTO. Defines the payload for `POST /api/registrations`:
    *   `eventId` (number)
    *   `userId` (number, optional)
    *   `tickets` (array of `{ ticketId, quantity }`)
    *   `participants` (array of `ParticipantInput`) - This array holds details for *all* attendees.
*   **`CreateRegistrationResponse` Interface:** Defines the success response structure (`{ message, registrationId }`).

## 4. Service Logic Refactor (`src/services/registrationServices.ts`)

*   **`createRegistration` Method:**
    *   Replaced the previous `registerForEvent` method.
    *   Accepts the new `CreateRegistrationDto`.
    *   Performs pre-transaction validations (input structure, event status/capacity, ticket validity, basic response validation per participant).
    *   Executes core logic within a `prisma.$transaction`:
        1.  Locks and re-validates ticket quantities (for paid events).
        2.  Finds/creates the primary `Participant` (based on the first entry in the `participants` array).
        3.  Creates the main `Registration` record, linked to the primary participant and the `userId` (if provided).
        4.  **Creates `Purchase` and `PurchaseItem` Records (if not free):**
            *   Creates a single `Purchase` record linked to the `Registration`, storing only the `totalPrice`.
            *   Loops through the `tickets` array from the DTO.
            *   For each item, creates a `PurchaseItem` record linking the `Purchase`, the specific `Ticket`, and storing the `quantity` and `unitPrice` for that ticket type.
        5.  **Updates `Ticket` Quantities Sold:** Loops through the `tickets` array and increments `quantitySold` on each corresponding `Ticket` record.
        6.  **Loops through the `participants` array from the DTO:**
            *   Finds/creates the `Participant` record for the current individual.
            *   Creates an `Attendee` record linking the `Registration` and the current `Participant`.
            *   **Loops through the `responses` array within the current participant's data:** Creates `Response` records, linking each to the newly created `Attendee` ID and the relevant `eventQuestionId`.
    *   Returns the `registrationId`.
*   **`cancelRegistration` Method:**
    *   Updated to fetch associated `PurchaseItem` records when a registration is cancelled.
    *   Loops through the `PurchaseItem`s to correctly decrement the `quantitySold` for each corresponding `Ticket`.

## 5. Controller Update (`src/controllers/registrationController.ts`)

*   The `createRegistration` handler was updated to:
    *   Accept the `CreateRegistrationDto` structure (currently directly from `req.body`, bypassing Joi validation temporarily).
    *   Pass the `userId` from the authenticated user (`req.user`) to the service, if available.
    *   Call the refactored `RegistrationService.createRegistration` method.
    *   Return the `CreateRegistrationResponse` from the service.

## 6. Validation Schema Update (`src/validation/registrationValidation.ts`)

*   The `registrationValidationSchema` (Joi) was updated to validate the structure of the new `CreateRegistrationDto`, including the nested `participants` array and their individual `responses` arrays.
*   (Note: The controller currently bypasses this updated validation; it needs to be re-enabled).

## 7. Shortcomings & TODOs (Post-Refactor)

*   **Validation Re-enabling:** The updated Joi schema needs to be re-enabled in the controller. Custom validation might be needed (e.g., ensuring participant count matches total ticket quantity).
*   **Testing:** The refactored `createRegistration` and `cancelRegistration` service logic requires comprehensive unit and integration testing, covering multi-participant and multi-ticket-type scenarios.
*   **Other Service Methods:** `getRegistrations` and `getRegistrationById` need updating to fetch/process data correctly using the new `Attendee` and `PurchaseItem` relationships (e.g., updating `include` statements).
*   **Free Events:** The flow for handling multiple participants for free events (where the `tickets` array might be empty) needs clarification and potential code adjustments.
*   **Refund Logic:** The `cancelRegistration` method has a `// TODO` comment for implementing refund logic, which is crucial for paid events.

This refactor provides the necessary backend structure to store data for individual attendees and handle purchases involving multiple ticket types within a single registration, aligning better with the described frontend workflow.

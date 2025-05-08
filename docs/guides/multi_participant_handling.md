# Multi-Participant Registration Handling

**Last Updated:** 01/05/2025

## Issue Description

There is a discrepancy between the intended frontend registration workflow and the current backend database schema's ability to handle multiple participants within a single registration.

**Frontend Workflow:**
*   Allows users to purchase multiple tickets (e.g., 3 tickets) for an event in one transaction.
*   Generates separate forms/tabs for the user to enter personal details for each individual ticket holder.
*   Potentially collects questionnaire answers specific to each individual ticket holder.

**Current Backend Schema Limitation (`prisma/schema.prisma` as of 01/05/2025):**
*   The `Registration` table links to only *one* primary `Participant` via `participantId`.
*   The `Purchase` table tracks the *quantity* of a specific ticket type bought within that registration but doesn't represent individual ticket instances assigned to people.
*   The `Response` table links questionnaire answers only to the overall `Registration`, not to specific individuals within that registration group.

**Consequence:** While the frontend collects details for each attendee, the current backend structure cannot store this information relationally. Details for secondary participants (attendees beyond the primary registrant) and their specific questionnaire answers are not directly linked to the registration or purchase in a way that identifies them individually.

## Proposed Solution (Backend Changes)

To fully support the frontend design and accurately store data for each attendee, the following backend changes are recommended:

1.  **Schema Modification:**
    *   Introduce a new table, potentially named `Attendee` or `TicketHolder`.
    *   This table should link `Registration` and `Participant` (many-to-many relationship mediated by `Attendee`, or `Attendee` having foreign keys to both).
    *   Each record in `Attendee` would represent one specific person attending under that registration.
    *   Consider adding fields like `ticketId` (if different ticket types are assigned to specific attendees) or a unique `ticketCode` to this new table.
    *   Modify the `Response` table to link to the `Attendee` table's ID instead of (or in addition to) the `Registration` ID, allowing answers to be associated with specific individuals.
2.  **Service Logic Update (`registrationService.createRegistration`):**
    *   Modify the service to accept an array of participant details in the request payload.
    *   Loop through the submitted participant details:
        *   Find or create `Participant` records for each individual.
        *   Create records in the new `Attendee` table, linking the `Registration` and the corresponding `Participant`.
    *   Update the logic for creating `Response` records to link them to the appropriate `Attendee` ID.
3.  **API Payload Update (`POST /api/registrations`):**
    *   Adjust the expected request body structure to clearly accept the array of participant details and potentially structured responses per participant.

## Prioritization Recommendation

Addressing this multi-participant handling discrepancy involves significant changes to the core registration data model and logic.

**Recommendation:** It is generally advisable to implement these backend schema and service changes **before or in parallel with completing the payment integration**.

**Reasoning:**
*   **Data Integrity:** Ensures that the registration data captured accurately reflects the frontend input *before* payment is finalized.
*   **Cleaner Integration:** The payment process (`createPaymentIntent`) relies on a stable `registrationId` and associated data (like `Purchase`). Modifying the registration structure *after* implementing payments could require refactoring the payment logic to accommodate the new data model.
*   **Dependencies:** Features like generating individual tickets/QR codes, check-in processes, or detailed reporting often depend on having distinct records for each attendee. Implementing this structure earlier facilitates these future features.

**Trade-off:** Implementing this change adds complexity and time to the registration feature development *before* payments can be fully tested end-to-end. However, deferring it might lead to more complex refactoring later or storing secondary participant data in a less structured, less useful way.

Therefore, tackling the multi-participant backend structure is recommended as a high-priority task, ideally preceding the final testing and frontend integration phase of the payment module.

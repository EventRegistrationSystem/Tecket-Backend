# Event Update Workflow Refactor

## 1. Problem Statement

The current event update workflow (`PUT /events/:id`) in the backend (`EventService.updateEvent`) employs a monolithic "delete all, then create all" strategy for managing associated tickets and event questions. This approach has critical flaws:

*   **Ticket Deletion Failure**: The `TicketService.deleteTicket` method correctly prevents the deletion of tickets that have already been sold (`quantitySold > 0`).
*   **Question Deletion Failure**: Similarly, `EventQuestionService.deleteEventQuestionLink` prevents unlinking questions that have received responses.

When an event organizer attempts to update an event that has sold tickets or has answered questions, the "delete all" part of the strategy fails due to these protections. This causes the entire update transaction to roll back, preventing any modifications to the event, even simple ones like changing the description. The frontend currently sends the entire event object, including all tickets and questions, in a single `PUT` request, triggering this problematic backend logic.

## 2. Current State of Backend APIs

Upon further inspection, the backend already possesses dedicated, granular API endpoints for managing tickets and event questions independently:

*   **Ticket Routes (`../Capstone-Backend/src/routes/ticketRoutes.ts`):**
    *   `GET /events/:eventId/tickets`
    *   `GET /events/:eventId/tickets/:ticketId`
    *   `POST /events/:eventId/tickets`
    *   `PUT /events/:eventId/tickets/:ticketId`
    *   `DELETE /events/:eventId/tickets/:ticketId`

*   **Event Question Routes (`../Capstone-Backend/src/routes/eventQuestionRoutes.ts`):**
    *   `GET /events/:eventId/questions`
    *   `POST /events/:eventId/questions`
    *   `PUT /events/:eventId/questions/:eventQuestionId`
    *   `DELETE /events/:eventId/questions/:eventQuestionId`

These existing endpoints are well-suited for a more robust and reliable update process.

## 3. Recommended Solution

The recommended solution involves refactoring both the backend's main event update service and the frontend's event form handling to leverage these existing granular APIs.

### 3.1. Backend Changes

*   **File**: `../Capstone-Backend/src/services/eventServices.ts`
*   **Function**: `EventService.updateEvent`
*   **Modification**:
    *   Remove the sections responsible for "Ticket Synchronization" and "Question Synchronization."
    *   This function will now **only** update the core properties of the `Event` entity itself (e.g., name, description, dates, location, capacity, `isFree`). It will no longer accept or process `tickets` or `questions` arrays in its payload for create/delete operations.

### 3.2. Frontend Changes

*   **File**: `src/views/admin/Event/EventFormView.vue` (Frontend: `/Users/minhphan/src/Capstone/Capstone-Frontend`)
*   **Method**: `saveEvent()`
*   **Modifications**:
    1.  **Update Core Event Details**: The method will first make a `PUT` request to `/events/:id` (backend) with only the basic event information.
    2.  **Synchronize Tickets**:
        *   Compare the current list of tickets in the form (`ticketTypes.value`) with the original list fetched when the form loaded (`originalTicketTypes.value`).
        *   For **new** tickets (those without an `id` in the form's list), call the `POST /events/:eventId/tickets` backend endpoint.
        *   For **modified** tickets (those with an `id` whose properties have changed), call the `PUT /events/:eventId/tickets/:ticketId` backend endpoint.
        *   For **deleted** tickets (those present in the original list but not in the current form's list), call the `DELETE /events/:eventId/tickets/:ticketId` backend endpoint.
    3.  **Synchronize Questions**:
        *   Apply the same logic as tickets, using the corresponding `POST`, `PUT`, and `DELETE` endpoints for `/events/:eventId/questions`.
    4.  **API Service Calls**: Ensure that frontend API service files (`src/api/ticketServices.js`, `src/api/questionServices.js`) correctly implement and export functions to call these dedicated backend endpoints.
    5.  **UI Enhancements**:
        *   Disable delete buttons for tickets that have `quantitySold > 0`.
        *   Disable delete buttons for questions that have existing responses.
        *   Provide clear tooltips or messages explaining why deletion is not possible in these cases.

## 4. Benefits of the Recommended Solution

*   **Bug Resolution**: Directly fixes the inability to update events with sold tickets or answered questions.
*   **Leverages Existing Infrastructure**: Utilizes the already implemented granular backend APIs, minimizing backend development effort.
*   **Improved User Experience**: Provides more specific feedback and prevents users from attempting invalid operations.
*   **Maintainability and Scalability**: Results in a more modular and understandable codebase.
*   **Data Integrity**: Ensures that business rules (like not deleting sold tickets) are respected.

## 5. Alternative: Fixing the Monolithic Approach

It is technically possible to make the existing monolithic `EventService.updateEvent` function smarter, but it comes with significant trade-offs.

### 5.1. How It Would Work

Instead of "delete all, create all," the service would need to perform a detailed comparison (a "diff") between the incoming tickets/questions and the ones in the database.

1.  **Fetch Existing Data**: Get all current tickets and questions for the event.
2.  **Categorize Incoming Data**:
    *   Items with an ID already exist.
    *   Items without an ID are new.
3.  **Process Changes**:
    *   **Create**: For new items, call the `create` service method.
    *   **Update**: For existing items, compare their properties with the incoming data. If there are changes, call the `update` service method.
    *   **Delete**: Identify items that are in the database but not in the incoming payload and call the `delete` service method.

### 5.2. Comparison of Solutions

| Aspect                  | Granular API Approach (Recommended)                                                              | "Smarter" Monolithic Approach                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Complexity**          | Moves complexity to the frontend, which is better equipped to track user-driven changes.           | Concentrates complex synchronization logic on the backend, making the service hard to read/debug. |
| **Performance**         | Multiple, small, fast HTTP requests. Can feel more responsive on the frontend.                     | A single, large, and potentially slow HTTP request that does many things.                     |
| **Atomicity**           | Each operation (e.g., deleting one ticket) is a single transaction. A failure doesn't block others. | A single transaction for the entire update. If one part fails (e.g., deleting one ticket), everything rolls back. |
| **Error Handling**      | The frontend knows exactly which operation failed (e.g., "Could not delete ticket X") and can react. | The frontend gets a single generic failure message, making it hard to provide good user feedback. |
| **Scalability**         | Highly scalable. Follows standard REST principles, making the API easy for others to use.          | Poorly scalable. The `updateEvent` function becomes a bottleneck and a maintenance nightmare. |
| **Frontend Experience** | Enables a much richer UI (e.g., disabling specific buttons, showing per-item status).             | Limits the UI to a single "Save" button with generic success/failure feedback.                |

### 5.3. Conclusion

While the monolithic approach *can* be fixed, it leads to a more complex, less performant, and less maintainable backend. The **Granular API Approach** is the industry-standard, RESTful way to handle related resources. It results in a cleaner separation of concerns, a more robust system, and a significantly better user experience. Given that the granular APIs already exist, leveraging them is the clear and correct path forward.

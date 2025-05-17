# Event Authorization Logic Refactoring Summary (17/05/2025)

This document summarizes the changes made to the event management authorization logic to align it more closely with the defined business rules.

## Key Changes Implemented:

1.  **Restricted Event Creation:**
    *   **File Modified:** `src/routes/eventRoutes.ts`
    *   **Change:** Added `authorize('ORGANIZER', 'ADMIN')` middleware to the `POST /events` route.
    *   **Impact:** Only users with the 'ORGANIZER' or 'ADMIN' role can now create new events. Previously, any authenticated user could create an event.

2.  **Removal of `adminView` Toggle for Listing Events:**
    *   **Files Modified:**
        *   `src/controllers/eventController.ts` (in `getAllEvents`)
        *   `src/services/eventServices.ts` (in `getAllEvents`)
    *   **Change:** The `adminView` query parameter and its associated logic were removed. The `filters.isAdmin` flag (set in the controller if `req.user.role === 'ADMIN'`) is now solely used by the service.
    *   **Impact:** Administrators (`ADMIN` role) now see all events in all statuses by default when calling `GET /events`, without needing to specify an extra query parameter. Other filters (search, date, etc.) still apply.

3.  **Standardized Ownership Checks in Service Layer:**
    *   **Files Modified:**
        *   `src/controllers/eventController.ts` (methods: `updateEvent`, `updateEventStatus`, `deleteEvent`)
        *   `src/services/eventServices.ts` (methods: `updateEvent`, `updateEventStatus`, `deleteEvent`)
    *   **Change:**
        *   Ownership verification logic (ensuring an 'ORGANIZER' can only modify/delete their own events) was removed from the controller methods.
        *   Controller methods now pass `requestingUserId` and `requestingUserRole` to the corresponding service methods.
        *   Service methods (`updateEvent`, `updateEventStatus`, `deleteEvent`) now perform the ownership check: if the `requestingUserRole` is not 'ADMIN', they verify that `existingEvent.organiserId === requestingUserId`.
    *   **Impact:** Authorization logic for these modifications is now centralized in the service layer, ensuring consistency and better separation of concerns. Admins continue to bypass the direct ownership check.

4.  **Enhanced Visibility Control for `getEventWithDetails` (GET /events/:id):**
    *   **Files Modified:**
        *   `src/controllers/eventController.ts` (method: `getEventById`)
        *   `src/services/eventServices.ts` (method: `getEventWithDetails`)
    *   **Change:**
        *   `EventController.getEventById` now passes the `req.user` object (which can be undefined for unauthenticated requests) to `EventService.getEventWithDetails`.
        *   `EventService.getEventWithDetails` now includes a visibility check:
            *   If the event's status is not 'PUBLISHED':
                *   Unauthenticated users are denied access.
                *   Users with the 'PARTICIPANT' role are denied access.
                *   Users with the 'ORGANIZER' role are denied access if they are not the event's organizer.
            *   'ADMIN' users can view events regardless of status.
            *   'PUBLISHED' events remain accessible to all.
    *   **Impact:** Prevents unauthorized users (including participants and other organizers) from accessing details of non-published (e.g., 'DRAFT', 'CANCELLED') events via direct ID lookup, unless they are the event owner or an admin.

These modifications ensure that the application's event management endpoints adhere more strictly to the intended role-based access control and data visibility rules.

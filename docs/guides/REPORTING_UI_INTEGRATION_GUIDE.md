# Frontend Integration Guide: Event Reporting Module

**Last Updated:** 2025-05-31

## 1. Introduction

This guide provides frontend developers with the necessary information to integrate with the backend API for generating and displaying event reports. The reporting feature allows authorized users (Organizers and Admins) to view a comprehensive summary of an event, including sales data, attendance figures, and responses to event-specific questionnaires.

## 2. API Endpoint Details

To fetch an event report, use the following API endpoint:

*   **Method:** `GET`
*   **URL:** `/api/events/{eventId}/report`
*   **Path Parameter:**
    *   `eventId` (integer, required): The unique identifier of the event for which the report is to be generated.

## 3. Authentication & Authorization

*   **Authentication:** This endpoint requires JWT-based authentication. The frontend client must include a valid JWT access token in the `Authorization` header of the request, prefixed with `Bearer `.
    ```
    Authorization: Bearer <your_jwt_access_token>
    ```
*   **Authorization:** The authenticated user must have either the `ORGANIZER` or `ADMIN` role to access this endpoint.
    *   If the user is an `ORGANIZER`, they must also be the organizer of the specified `eventId` (unless ADMIN privileges override this, which they typically do).
    *   Failure to meet these requirements will result in a `401 Unauthorized` or `403 Forbidden` error.

## 4. Requesting the Report

To request an event report, make a `GET` request to the endpoint, replacing `{eventId}` with the actual ID of the event.

**Example using JavaScript `fetch` API:**

```javascript
async function fetchEventReport(eventId, accessToken) {
  const apiUrl = `/api/events/${eventId}/report`; // Adjust if your API base URL is different

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      // Handle HTTP errors (e.g., 401, 403, 404, 500)
      const errorData = await response.json();
      console.error(`Error fetching report: ${response.status}`, errorData);
      // Throw an error or return a specific error object for UI handling
      throw new Error(errorData.message || `HTTP error ${response.status}`);
    }

    const reportData = await response.json();
    // The reportData will be the 'Report' object described below
    console.log('Event Report:', reportData);
    return reportData; // This should be reportData.data if your backend wraps responses
                      // Assuming the controller returns the report directly as per previous analysis.
                      // If it's { success: true, data: Report }, then return reportData.data
  } catch (error) {
    console.error('Failed to fetch event report:', error);
    // Handle network errors or other issues
    throw error;
  }
}

// Usage:
// const eventId = 123;
// const token = /* get user's access token */;
// fetchEventReport(eventId, token)
//   .then(report => { /* Process and display the report */ })
//   .catch(error => { /* Display error to the user */ });
```
*Self-correction: The controller `res.status(200).json(report);` sends the report object directly, not wrapped in a `data` property. If it were wrapped like `{ success: true, data: report }`, the access would be `reportData.data`.*

## 5. Understanding the Report Response Data

The API will respond with a JSON object representing the `Report`. The structure is defined in `src/types/reportTypes.ts`.

```typescript
// Main Report Structure
interface Report {
    eventName: string;                            // Name of the event.
    eventDescription: string;                     // Description of the event.
    start: Date;                                  // Start date and time of the event (ISO string format).
    end: Date;                                    // End date and time of the event (ISO string format).
    sales: SalesSection;                          // Section detailing ticket sales figures.
    remaining: RemainingSection;                  // Section detailing remaining ticket availability.
    participants: ParticipantSection[];           // Array of all participants/attendees with their details.
    questions: Record<string, QuestionAggregate>; // Aggregated responses for event questions.
}

// Sales Details
interface SalesSection {
  totalTickets: number;             // Total number of tickets sold.
  revenue: number;                  // Total monetary revenue (e.g., 7500.75).
  soldByTickets: TicketAggregate[]; // Units sold per ticket type.
  revenueByTickets: TicketAggregate[];// Revenue per ticket type.
}

// Remaining Ticket Details
interface RemainingSection {
  remainingTickets: number;           // Total number of tickets still available.
  remainingByTicket: TicketAggregate[]; // Unsold tickets per ticket type.
}

// Aggregation for Tickets (used in SalesSection and RemainingSection)
interface TicketAggregate {
  name: string;   // Name of the ticket type (e.g., “VIP Pass”).
  total: number;  // Count or monetary value (e.g., 50 tickets or 1200.50 currency units).
}

// Participant Details
interface ParticipantSection {
  name: string;                             // Full name (e.g., "John Doe").
  email: string;                            // Email address.
  ticket: string;                           // Name of the ticket type held (e.g., "Early Bird").
  questionnairreResponses: QuestionnaireResponse[]; // Array of their answers.
}

// Individual Questionnaire Response
interface QuestionnaireResponse {
  question: string; // The text of the question.
  response: string; // The participant's answer. For CHECKBOX type, this is a JSON string array.
}

// Aggregated Answers for a Single Question
// This is a Record where keys are option texts and values are counts.
// Example: { "Yes": 15, "No": 5, "Maybe": 2 }
interface QuestionAggregate {
  [option: string]: number;
}
```

**Example Snippet of a `Report` JSON Response:**

```json
{
  "eventName": "Annual Tech Conference 2025",
  "eventDescription": "A conference about the future of technology.",
  "start": "2025-10-20T09:00:00.000Z",
  "end": "2025-10-22T17:00:00.000Z",
  "sales": {
    "totalTickets": 150,
    "revenue": 7500.75,
    "soldByTickets": [
      { "name": "Early Bird", "total": 100 },
      { "name": "Standard", "total": 50 }
    ],
    "revenueByTickets": [
      { "name": "Early Bird", "total": 4500.00 },
      { "name": "Standard", "total": 3000.75 }
    ]
  },
  "remaining": {
    "remainingTickets": 50,
    "remainingByTicket": [
      { "name": "Standard", "total": 50 }
    ]
  },
  "participants": [
    {
      "name": "Alice Wonderland",
      "email": "alice@example.com",
      "ticket": "Early Bird",
      "questionnairreResponses": [
        { "question": "Dietary Preference?", "response": "Vegetarian" },
        { "question": "T-Shirt Size?", "response": "M" }
      ]
    },
    {
      "name": "Bob The Builder",
      "email": "bob@example.com",
      "ticket": "Standard",
      "questionnairreResponses": [
        { "question": "Dietary Preference?", "response": "None" },
        { "question": "T-Shirt Size?", "response": "L" },
        { "question": "Interests (Checkbox)?", "response": "[\"AI\",\"Cloud\"]" }
      ]
    }
  ],
  "questions": {
    "Dietary Preference?": {
      "Vegetarian": 1,
      "None": 1
    },
    "T-Shirt Size?": {
      "M": 1,
      "L": 1
    },
    "Interests (Checkbox)?": {
        "AI": 1,
        "Cloud": 1,
        "DevOps": 0 
    }
  }
}
```
*Note on `QuestionnaireResponse.response` for `CHECKBOX` type questions: The backend stores this as a JSON string array (e.g., `"[\"AI\",\"Cloud\"]"`). The frontend will need to parse this string (`JSON.parse()`) to get an actual array of selected options if it needs to display them individually.*

## 6. UI Display Suggestions

Here are some ideas for presenting the report data in a user-friendly manner:

*   **Overall Event Information:**
    *   Display `eventName`, `eventDescription`, `start`, and `end` dates prominently. Format dates for readability.
*   **Sales Section:**
    *   **Key Metrics:** Show `totalTickets` sold and total `revenue` clearly (e.g., in stat cards).
    *   **Breakdowns:**
        *   Use tables or bar charts to display `soldByTickets` (units sold per ticket type).
        *   Use tables or bar charts for `revenueByTickets` (revenue per ticket type).
*   **Remaining Tickets Section:**
    *   **Key Metrics:** Show `remainingTickets` total.
    *   **Breakdowns:** Use a table or list for `remainingByTicket`.
*   **Participants Section:**
    *   Display participants in a paginated and sortable table.
    *   Columns could include: Name, Email, Ticket Type.
    *   Consider an expandable row or a modal/detail view to show individual `questionnairreResponses` for each participant.
*   **Aggregated Questions Section (`questions`):**
    *   Iterate through the `questions` object (where each key is a question text).
    *   For each question:
        *   Display the question text.
        *   Display the `QuestionAggregate` (options and their counts). This can be done using:
            *   A simple list: "Option A: 10, Option B: 25".
            *   A bar chart or pie chart for visual representation of option distribution.
            *   A table listing options and their selection counts.

## 7. Error Handling

The API will use standard HTTP status codes to indicate the outcome of the request.

*   **`200 OK`:** Report generated successfully. The response body contains the `Report` object.
*   **`400 Bad Request`:** The `eventId` provided in the URL is invalid (e.g., not a number).
    *   Response body: `{ "success": false, "message": "Invalid event ID" }`
*   **`401 Unauthorized`:** No JWT token provided, or the token is invalid/expired.
    *   Response body: `{ "success": false, "message": "Authentication required" }` or similar.
*   **`403 Forbidden`:** The authenticated user does not have the required 'ORGANIZER' or 'ADMIN' role, or is an organizer but does not own the event.
    *   Response body: `{ "success": false, "message": "You are not authorized to perform this action" }` or similar.
*   **`404 Not Found`:** The event with the specified `eventId` does not exist.
    *   Response body: `{ "success": false, "message": "Event not found" }`
*   **`500 Internal Server Error`:** An unexpected error occurred on the server while generating the report.
    *   Response body: `{ "success": false, "message": "An unexpected error occurred while generating the report." }`

The frontend should handle these responses appropriately, displaying informative messages to the user.

## 8. Example Workflow (Frontend Perspective)

1.  **Navigation:** An Organizer or Admin user navigates to a specific event's detail or management page in the frontend application.
2.  **Trigger:** The user clicks a "View Report" or "Generate Report" button/link associated with that event.
3.  **API Call:**
    *   The frontend retrieves the `eventId` for the current event.
    *   It retrieves the user's JWT `accessToken` from local storage, Vuex/Pinia store, or HttpOnly cookie (if accessible, though typically not directly for HttpOnly).
    *   It makes a `GET` request to `/api/events/{eventId}/report` with the `Authorization: Bearer <accessToken>` header.
4.  **Response Handling:**
    *   **On Success (200 OK):**
        *   The frontend receives the `Report` JSON object.
        *   It parses this data.
        *   It renders the data in a dedicated report view or section, using the UI suggestions outlined above.
    *   **On Error (4xx/5xx):**
        *   The frontend receives an error response (likely JSON with `success: false` and a `message`).
        *   It displays an appropriate error message to the user (e.g., "Report could not be generated: Event not found," or "You are not authorized to view this report.").
        *   It might log more detailed error information to the console for debugging.

This guide should provide a solid starting point for implementing the frontend UI for the event reporting module.

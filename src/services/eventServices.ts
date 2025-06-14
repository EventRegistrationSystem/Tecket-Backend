import { prisma } from "../config/prisma";
import {
  CreateEventDTO,
  EventFilters,
  EventResponse,
  TicketResponse,
} from "../types/eventTypes";
import { TicketService } from "./ticketServices";
import { EventQuestionService } from "./eventQuestionService";
import { JwtPayload } from "../types/authTypes";
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  EventError,
} from "../utils/errors";
import { UserRole } from "@prisma/client";

export class EventService {

  private static async verifyAdminOrEventOrganizer(
    userId: number,
    userRole: UserRole,
    eventId: number
  ): Promise<void> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organiserId: true },
    });

    if (!event) {
      throw new NotFoundError("Event not found");
    }

    if (userRole !== UserRole.ADMIN && event.organiserId !== userId) {
      throw new AuthorizationError(
        "You are not authorized to perform this action on this event."
      );
    }
  }

  /**
   * 01 - Create a new event
   * @param organiserId
   * @param eventData
   * @param actorUserId The ID of the user performing the creation (Organizer or Admin)
   * @param actorUserRole The role of the user performing the creation
   * @returns
   */
  static async createEvent(
    organiserId: number,
    eventData: CreateEventDTO,
    actorUserId: number,
    actorUserRole: UserRole
  ) {
    // Event end date > Start date
    if (new Date(eventData.endDateTime) < new Date(eventData.startDateTime)) {
      throw new ValidationError("Event end date must be after the start date");
    }

    //  Event is not in the past
    if (new Date(eventData.startDateTime) < new Date()) {
      throw new ValidationError("Event start date must be in the future");
    }

    // Validate tickets only for paid events
    if (!eventData.isFree) {
      if (!eventData.tickets || eventData.tickets.length === 0) {
        throw new ValidationError(
          "At least one ticket type is required for paid events"
        );
      }

      // Check ticket dates
      for (const ticket of eventData.tickets) {
        if (new Date(ticket.salesEnd) <= new Date(ticket.salesStart)) {
          throw new ValidationError(
            "Ticket sales end date must be after sales start date"
          );
        }

        if (new Date(ticket.salesEnd) > new Date(eventData.endDateTime)) {
          throw new ValidationError(
            "Ticket sales cannot end after the event ends"
          );
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      // 1 - Create the event
      const event = await tx.event.create({
        data: {
          organiserId: organiserId,
          name: eventData.name,
          description: eventData.description,
          location: eventData.location,
          capacity: eventData.capacity,
          imageUrl: eventData.imageUrl,
          eventType: eventData.eventType,
          isFree: eventData.isFree,
          startDateTime: new Date(eventData.startDateTime),
          endDateTime: new Date(eventData.endDateTime),
          status: "DRAFT",
        },
      });

      // 2 - Create the tickets and link them to the event (paid events only)
      let eventTickets: TicketResponse[] = [];
      if (
        !eventData.isFree &&
        eventData.tickets &&
        eventData.tickets.length > 0
      ) {
        eventTickets = await Promise.all(
          eventData.tickets.map(async (ticket) => {
            return tx.ticket.create({
              data: {
                eventId: event.id,
                name: ticket.name,
                description: ticket.description,
                price: ticket.price,
                quantityTotal: ticket.quantityTotal,
                quantitySold: 0,
                salesStart: new Date(ticket.salesStart),
                salesEnd: new Date(ticket.salesEnd),
              },
            });
          })
        );
      }

      // 3 - Create the questions and link them to the event using EventQuestionService
      const createdEventQuestions = [];
      if (eventData.questions && eventData.questions.length > 0) {
        for (const q of eventData.questions) {
          const eventQuestionLink =
            await EventQuestionService.addQuestionToEvent(
              actorUserId, // User performing the action
              actorUserRole, // Role of the user performing theaction
              event.id, // The newly created event's ID
              q, // The question data (AddEventQuestionLinkDTO from CreateEventDTO)
              tx // The Prisma transaction client
            );
          createdEventQuestions.push(eventQuestionLink);
        }
      }

      // 4 - Return the created events with its questions
      return {
        ...event,
        tickets: eventTickets,
        questions: createdEventQuestions, // Use the result from EventQuestionService
      };
    });
  }

  /**
   * 02 - Get all events with pagination and filters
   * @param param0
   * @returns
   */
  static async getAllEvents({
    page = 1,
    limit = 10,
    filters = {} as EventFilters,
  }) {
    // 1. Calculate the number of items to skip
    const skip = (page - 1) * limit;

    // 2. Build the where condition object
    const where: any = {};

    // 2.1. Apply organiserId filter if it's an organizer
    if (filters.isOrganiser && filters.organiserId) {
      where.organiserId = filters.organiserId;
      console.log(`Filtering by organiserId: ${filters.organiserId}`);
    }

    // 2.2. Determine status filter based on role and explicit filter
    if (filters.status) {
      // If a status filter is explicitly provided by any role.
      // For Admin and Organizer (their own events due to organiserId filter above), this status is applied.
      // For Public, if they try to filter by DRAFT/CANCELLED, they will get no results if those events aren't PUBLISHED.
      where.status = filters.status;
      console.log(`Applying explicit status filter: ${filters.status}`);
    } else {
      // No explicit status filter provided in the query.
      if (filters.isAdmin) {
        // Admin: Show all statuses (do not add a status filter to 'where')
        console.log(
          "Admin view: No status filter provided, showing all event statuses."
        );
      } else if (filters.isOrganiser && filters.organiserId) {
        // Organizer (implicitly their own events due to organiserId filter): Show all their event statuses
        console.log(
          "Organizer view (own events): No status filter provided, showing all their event statuses."
        );
      } else {
        // Public/Default: Only show PUBLISHED events
        console.log(
          "Public/Default view: No status filter provided, defaulting to PUBLISHED events."
        );
        where.status = "PUBLISHED";
      }
    }

    // 2.3. Text search filter
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { description: { contains: filters.search } },
      ];
    }

    // 2.3. Event type filter
    if (filters.eventType) {
      where.eventType = filters.eventType;
    }

    // 2.4. Location filter
    if (filters.location) {
      where.location = { contains: filters.location };
    }

    // 2.5. Date filters
    if (filters.startDate) {
      where.startDateTime = { gte: filters.startDate };
    }

    if (filters.endDate) {
      where.endDateTime = { lte: filters.endDate };
    }

    //2.6 - Free event filter
    if (filters.isFree !== undefined) {
      where.isFree = filters.isFree;
    }

    console.log("Final where filters:", where);

    //3. Get the events with the filters and pagination
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          startDateTime: "asc", // Show upcoming events first
        },
        include: {
          organizer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          tickets: {
            where: { status: "ACTIVE" },
          },
          _count: {
            select: {
              registrations: true, // Count number of registrations
            },
          },
        },
      }),
      prisma.event.count({ where }), // Count the total number of events
    ]);

    const eventsWithStats = events.map(event => {
      const ticketsSold = event.tickets.reduce((acc, ticket) => acc + ticket.quantitySold, 0);
      const revenue = event.tickets.reduce((acc, ticket) => acc + (Number(ticket.price) * ticket.quantitySold), 0);
      return {
        ...event,
        ticketsSold,
        revenue,
      };
    });

    // 4. Return the events and total count with pagination
    return {
      events: eventsWithStats,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 04 - Get event with details
   * @param eventId
   * @param requestingUser
   * @returns
   */
  static async getEventWithDetails(
    eventId: number,
    requestingUser?: JwtPayload
  ) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organizer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        tickets: {
          where: { status: "ACTIVE" },
        },
        eventQuestions: {
          include: {
            question: {
              // Include the details of the linked global Question
              include: {
                options: true, // Also include the options for that question
              },
            },
          },
          orderBy: {
            displayOrder: "asc",
          },
        },
        _count: {
          select: {
            registrations: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundError("Event not found");
    }

    // Visibility Check
    if (event.status !== "PUBLISHED") {
      if (!requestingUser) {
        // Unauthenticated
        throw new AuthorizationError("Access denied to this event"); // Or NotFoundError to not reveal its existence
      }
      if (requestingUser.role === "PARTICIPANT") {
        throw new AuthorizationError("Access denied to this event");
      }
      if (
        requestingUser.role === "ORGANIZER" &&
        event.organiserId !== requestingUser.userId
      ) {
        throw new AuthorizationError("Access denied to this event");
      }
      // ADMINs can see any status, so no explicit check needed here for them.
    }

    const ticketsSold = event.tickets.reduce((acc, ticket) => acc + ticket.quantitySold, 0);
    const revenue = event.tickets.reduce((acc, ticket) => acc + (Number(ticket.price) * ticket.quantitySold), 0);

    return {
      ...event,
      ticketsSold,
      revenue,
    };
  }

  /**
   * 05 - Update event
   * @param eventId
   * @param eventData
   * @param requestingUserId
   * @param requestingUserRole
   * @returns
   */
  static async updateEvent(
    eventId: number,
    eventData: Partial<CreateEventDTO>,
    requestingUserId: number,
    requestingUserRole: UserRole // Changed to UserRole
  ) {
    await EventService.verifyAdminOrEventOrganizer(
      requestingUserId,
      requestingUserRole,
      eventId
    );

    // Verify that event exists (already done by helper if not ADMIN, but good for status check)
    const existingEvent = await prisma.event.findUnique({
      // Fetch again for other properties if needed, or pass from helper
      where: { id: eventId },
      // Select other fields needed for validation, e.g., status, isFree
      select: {
        status: true,
        isFree: true,
        endDateTime: true,
        startDateTime: true,
      },
    });

    if (!existingEvent) {
      // This case should ideally be caught by _ensureAdminOrEventOrganizer if it fetches the event
      // but as a safeguard or if helper only returns organiserId.
      throw new NotFoundError("Event not found");
    }

    // Make sure the event is not completed
    if (existingEvent.status === "COMPLETED") {
      throw new ValidationError("Cannot update a completed event");
    }

    // Handle date validation if provided
    if (eventData.startDateTime && eventData.endDateTime) {
      if (new Date(eventData.endDateTime) < new Date(eventData.startDateTime)) {
        throw new ValidationError(
          "Event end date must be after the start date"
        );
      }
    } else if (eventData.startDateTime && existingEvent.endDateTime) {
      if (
        new Date(existingEvent.endDateTime) < new Date(eventData.startDateTime)
      ) {
        throw new ValidationError(
          "Event end date must be after the start date"
        );
      }
    } else if (eventData.endDateTime && existingEvent.startDateTime) {
      if (
        new Date(eventData.endDateTime) < new Date(existingEvent.startDateTime)
      ) {
        throw new ValidationError(
          "Event end date must be after the start date"
        );
      }
    }

    // Check if changing from free to paid
    if (
      eventData.isFree !== undefined &&
      eventData.isFree !== existingEvent.isFree
    ) {
      // If changing from free to paid, tickets must be provided
      if (
        eventData.isFree === false &&
        (!eventData.tickets || eventData.tickets.length === 0)
      ) {
        throw new ValidationError(
          "At least one ticket type is required for paid events"
        );
      }

      // If changing from paid to free and there are registrations, reject
      // Otherwise, deactivate all tickets
      if (eventData.isFree === true) {
        const registrationCount = await prisma.registration.count({
          where: { eventId },
        });

        if (registrationCount > 0) {
          throw new ValidationError(
            "Cannot change a paid event to free when registrations exist"
          );
        } else {
          // Deactivate tickets
          await prisma.ticket.updateMany({
            where: { eventId },
            data: { status: "INACTIVE" },
          });
        }
      }

      // Add more validation here
    }

    // Update the event
    return prisma.$transaction(async (tx) => {
      // 01 - Update the event basic information
      const updatedEvent = await tx.event.update({
        where: { id: eventId },
        data: {
          name: eventData.name,
          description: eventData.description,
          location: eventData.location,
          capacity: eventData.capacity,
          imageUrl: eventData.imageUrl,
          eventType: eventData.eventType,
          isFree: eventData.isFree,
          startDateTime: eventData.startDateTime
            ? new Date(eventData.startDateTime)
            : undefined,
          endDateTime: eventData.endDateTime
            ? new Date(eventData.endDateTime)
            : undefined,
        },
      });

      // Pass requestingUser to getEventWithDetails for visibility checks
      const finalRequestingUser: JwtPayload = {
        userId: requestingUserId,
        role: requestingUserRole,
        iat: 0,
        exp: 0,
      };
      return this.getEventWithDetails(eventId, finalRequestingUser);
    });
  }

  /**
   * 05 - Update event status
   * @param eventId
   * @param status
   * @param requestingUserId
   * @param requestingUserRole
   */
  static async updateEventStatus(
    eventId: number,
    status: "DRAFT" | "PUBLISHED" | "CANCELLED",
    requestingUserId: number,
    requestingUserRole: UserRole // Changed to UserRole
  ) {
    await EventService.verifyAdminOrEventOrganizer(
      requestingUserId,
      requestingUserRole,
      eventId
    );

    // Fetch event again if other properties like isFree or current status are needed for validation logic
    // The verifyAdminOrEventOrganizer only confirms existence and ownership/admin role.
    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, isFree: true, organiserId: true }, // Ensure all needed fields are here
    });

    if (!existingEvent) {
      // Should be caught by verifyAdminOrEventOrganizer if it checks existence properly for ADMINs too
      throw new NotFoundError("Event not found after authorization check.");
    }

    // Validate status transition
    if (existingEvent.status === "COMPLETED") {
      throw new ValidationError("Cannot change status of a completed event");
    }

    if (existingEvent.status === "CANCELLED" && status !== "DRAFT") {
      throw new ValidationError(
        "Cancelled events can only be restored to draft status"
      );
    }

    // 01 - For publishing, verify the event has questions and tickets (if paid)
    if (status === "PUBLISHED") {
      // Get question count
      const questionCount = await prisma.eventQuestions.count({
        where: { eventId },
      });
      if (questionCount === 0) {
        throw new ValidationError(
          "Events must have at least one question before publishing"
        );
      }

      // For paid events, verify tickets exist
      if (!existingEvent.isFree) {
        const ticketCount = await prisma.ticket.count({
          where: { eventId },
        });

        if (ticketCount === 0) {
          throw new ValidationError(
            "Paid events must have at least one ticket type before publishing"
          );
        }
      }
    }

    // 02 - For cancellation, handle existing registrations
    if (status === "CANCELLED" && existingEvent.status === "PUBLISHED") {
      const registrationCount = await prisma.registration.count({
        where: { eventId },
      });

      if (registrationCount > 0) {
        // TODO: Implement: send cancellation notifications here and process refunds for paid events

        // Update all registrations to cancelled
        await prisma.registration.updateMany({
          where: {
            eventId,
            status: {
              in: ["CONFIRMED", "PENDING"],
            },
          },
          data: { status: "CANCELLED" },
        });
      }
    }
    // Update the event status
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: { status },
    });

    return updatedEvent;
  }

  /**
     * 05 - Get total attendee count for a specific event
     * @param eventId - ID of the event
     */
  static async getRegistrationParticipantCount(eventId: number): Promise<number> {
    // Ensure event exists
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundError('Event not found');
    // Count registration participants for this event via registration relation
    return prisma.registrationParticipant.count({ where: { registration: { eventId } } });
  }

  /**
   * 06 - Delete an event
   * @param eventId
   * @param requestingUserId
   * @param requestingUserRole
   * @returns
   */
  static async deleteEvent(
    eventId: number,
    requestingUserId: number,
    requestingUserRole: UserRole // Changed to UserRole
  ) {
    await EventService.verifyAdminOrEventOrganizer(
      requestingUserId,
      requestingUserRole,
      eventId
    );

    // No need to fetch existingEvent again if verifyAdminOrEventOrganizer confirms existence
    // However, the original deleteEvent used getEventById which might fetch more than just organiserId
    // For deletion, only existence and authorization matter, which the helper covers.

    // Check for registrations, if any, reject and suggest cancellation
    const registrationCount = await prisma.registration.count({
      where: { eventId },
    });

    if (registrationCount > 0) {
      throw new ValidationError(
        "Cannot delete an event with registrations. Please cancel the event instead."
      );
    }

    // Delete the event
    return prisma.$transaction(async (tx) => {
      // Delete related records
      await tx.eventQuestions.deleteMany({
        where: { eventId },
      });

      // Delete tickets
      await tx.ticket.deleteMany({
        where: { eventId },
      });

      // Delete the event
      return tx.event.delete({
        where: { id: eventId },
      });
    });
  }
}

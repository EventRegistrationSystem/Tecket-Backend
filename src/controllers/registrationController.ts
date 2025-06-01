import { Request, Response, NextFunction } from 'express';
import { RegistrationService } from '../services/registrationServices';
import {
    registrationValidationSchema,
    getRegistrationsQuerySchema,
    getRegistrationParamsSchema,
    updateRegistrationStatusSchema // Import the new schema
} from '../validation/registrationValidation';
// Use the new DTOs and Query Types
import {
    CreateRegistrationDto,
    CreateRegistrationResponse,
    GetAdminAllRegistrationsQuery, // Import the new query type
    UpdateRegistrationStatusDto
} from '../types/registrationTypes';
import { AppError, AuthorizationError, ValidationError } from '../utils/errors';
import { RegistrationStatus } from '@prisma/client'; // Added for status validation/typing

export class RegistrationController {
    /**
     * Handle POST /registrations
     * Creates a new registration for an event, handling multiple participants.
     */
    static async createRegistration(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // TODO: Update registrationValidationSchema to match CreateRegistrationDto structure
            // For now, assume basic validation or skip for initial refactor

            // const { error, value } = registrationValidationSchema.validate(req.body);
            // if (error) {
            //     throw new ValidationError(`Validation failed: ${error.details.map(x => x.message).join(', ')}`);
            // }
            // const registrationData: CreateRegistrationDto = value;

            // Directly use req.body for now, assuming it matches CreateRegistrationDto
            const registrationDataFromRequest: CreateRegistrationDto = req.body;
            let finalUserId: number | undefined = undefined;

            // Add userId from authenticated user if available
            if (req.user && req.user.userId) {
                finalUserId = req.user.userId;
            }
            // If req.user is not present, finalUserId remains undefined (guest)
            // Any userId potentially in registrationDataFromRequest for a guest is ignored.

            // Prepare the DTO for the service. userId is no longer part of CreateRegistrationDto.
            const serviceDto: CreateRegistrationDto = {
                eventId: registrationDataFromRequest.eventId,
                tickets: registrationDataFromRequest.tickets,
                participants: registrationDataFromRequest.participants,
            };

            // 2. Call the updated service method, passing finalUserId as a separate argument
            const result: CreateRegistrationResponse = await RegistrationService.createRegistration(serviceDto, finalUserId);

            // 3. Send response (contains message and registrationId)
            res.status(201).json(result);

        } catch (err) {
            // Pass errors to the global error handler
            next(err);
        }
    }

    /**
     * Handle GET /registrations
     * Retrieves a list of registrations based on query filters.
     * Requires authentication.
     */
    static async getRegistrations(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // 1. Validate query parameters
            const { error: queryError, value: queryValue } = getRegistrationsQuerySchema.validate(req.query);
            if (queryError) {
                throw new ValidationError(`Invalid query parameters: ${queryError.details.map(x => x.message).join(', ')}`);
            }

            // Ensure req.user is populated by authentication middleware
            if (!req.user) {
                // This should ideally be caught by middleware, but double-check
                throw new AppError(401, 'Authentication required');
            }

            // 2. Call service method
            const { registrations, totalCount } = await RegistrationService.getRegistrations(queryValue, req.user);

            // 3. Send response with pagination metadata
            res.status(200).json({
                message: 'Registrations retrieved successfully',
                data: registrations,
                pagination: {
                    page: queryValue.page,
                    limit: queryValue.limit,
                    totalCount: totalCount,
                    totalPages: Math.ceil(totalCount / queryValue.limit)
                }
            });

        } catch (err) {
            next(err);
        }
    }

    /**
     * Handle GET /registrations/:registrationId
     * Retrieves a single registration by its ID.
     * Requires authentication.
     */
    static async getRegistrationById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // 1. Validate path parameter
            const { error: paramsError, value: paramsValue } = getRegistrationParamsSchema.validate(req.params);
            if (paramsError) {
                throw new ValidationError(`Invalid registration ID: ${paramsError.details.map(x => x.message).join(', ')}`);
            }

            // Ensure req.user is populated
            if (!req.user) {
                throw new AppError(401, 'Authentication required');
            }

            const { registrationId } = paramsValue;

            // 2. Call service method
            const registration = await RegistrationService.getRegistrationById(registrationId, req.user);

            // 3. Send response
            res.status(200).json({
                message: 'Registration retrieved successfully',
                data: registration
            });

        } catch (err) {
            next(err);
        }
    }

    /**
     * Handle PATCH /registrations/:registrationId
     * Cancels a specific registration.
     */
    static async cancelRegistration(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // 1. Validate path parameter
            const { error: paramsError, value: paramsValue } = getRegistrationParamsSchema.validate(req.params);
            if (paramsError) {
                throw new ValidationError(`Invalid registration ID: ${paramsError.details.map(x => x.message).join(', ')}`);
            }
            const { registrationId } = paramsValue;

            // 2. Validate request body (ensure status is 'CANCELLED')
            const status = req.body.status;
            if (status !== 'CANCELLED') {
                throw new ValidationError("Invalid status update. Only 'CANCELLED' is allowed via this endpoint.");
            }


            // 3. Ensure user is authenticated
            if (!req.user) {
                throw new AppError(401, 'Authentication required');
            }

            // 4. Call the service method, passing the user object for authorization checks
            const updatedRegistration = await RegistrationService.cancelRegistration(registrationId, req.user);

            // 5. Send response
            res.status(200).json({
                message: 'Registration cancelled successfully',
                data: updatedRegistration
            });

        } catch (err) {
            next(err); // Pass error to global handler
        }
    }

    /**
     * Handle GET /api/events/:eventId/registrations
     * Retrieves a list of registration summaries for a specific event.
     * Requires authentication (Admin or Event Organizer).
     */
    static async getRegistrationsForEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // 1. Validate and parse eventId from path parameters
            const eventId = parseInt(req.params.eventId, 10);
            if (isNaN(eventId)) {
                throw new ValidationError('Invalid event ID format.');
            }

            // 2. Ensure user is authenticated
            if (!req.user) {
                throw new AppError(401, 'Authentication required.');
            }

            // 3. Parse and prepare query parameters for the service
            // TODO: Implement Joi validation for these query parameters
            const { page, limit, search, status, ticketId } = req.query;

            const queryParams: {
                page?: number;
                limit?: number;
                search?: string;
                status?: RegistrationStatus;
                ticketId?: number;
            } = {};

            if (page) queryParams.page = parseInt(page as string, 10);
            if (limit) queryParams.limit = parseInt(limit as string, 10);
            if (search) queryParams.search = search as string;
            if (status) {
                // Basic validation for status enum
                if (Object.values(RegistrationStatus).includes(status as RegistrationStatus)) {
                    queryParams.status = status as RegistrationStatus;
                } else {
                    throw new ValidationError(`Invalid status value. Must be one of: ${Object.values(RegistrationStatus).join(', ')}`);
                }
            }
            if (ticketId) queryParams.ticketId = parseInt(ticketId as string, 10);

            // Default values for page and limit are handled by the service if not provided

            // 4. Call service method
            // The service method `getRegistrationsForEvent` expects query parameters as its second argument.
            // We need to ensure the structure matches `GetRegistrationsForEventQuery` from the service.
            // The service method signature is: getRegistrationsForEvent(eventId: number, query: GetRegistrationsForEventQuery, authUser: JwtPayload)

            const result = await RegistrationService.getRegistrationsForEvent(
                eventId,
                { // Construct the query object matching GetRegistrationsForEventQuery
                    page: queryParams.page, // Will be undefined if not provided, service handles default
                    limit: queryParams.limit, // Will be undefined if not provided, service handles default
                    search: queryParams.search,
                    status: queryParams.status,
                    ticketId: queryParams.ticketId
                },
                req.user
            );

            // 5. Send response
            res.status(200).json({
                message: `Registrations for event ${eventId} retrieved successfully`,
                ...result // result contains data and pagination
            });

        } catch (err) {
            next(err);
        }
    }

    /**
     * Handle GET /api/admin/registrations
     * Retrieves a list of all registration summaries for administrators.
     * Requires ADMIN role.
     */
    static async getAdminAllRegistrations(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // 1. Ensure user is authenticated (service layer will check for ADMIN role)
            if (!req.user) {
                throw new AppError(401, 'Authentication required.');
            }

            // 2. Parse and prepare query parameters for the service
            // TODO: Implement Joi validation for these query parameters
            const {
                page, limit, search, status, ticketId,
                eventId, userId, participantId
            } = req.query;

            const queryParams: GetAdminAllRegistrationsQuery = {}; // Use the imported type

            if (page) queryParams.page = parseInt(page as string, 10);
            if (limit) queryParams.limit = parseInt(limit as string, 10);
            if (search) queryParams.search = search as string;
            if (status) {
                if (Object.values(RegistrationStatus).includes(status as RegistrationStatus)) {
                    queryParams.status = status as RegistrationStatus;
                } else {
                    throw new ValidationError(`Invalid status value. Must be one of: ${Object.values(RegistrationStatus).join(', ')}`);
                }
            }
            if (ticketId) queryParams.ticketId = parseInt(ticketId as string, 10);
            if (eventId) queryParams.eventId = parseInt(eventId as string, 10);
            if (userId) queryParams.userId = parseInt(userId as string, 10);
            if (participantId) queryParams.participantId = parseInt(participantId as string, 10);

            // Default values for page and limit are handled by the service if not provided

            // 3. Call service method
            const result = await RegistrationService.getAdminAllRegistrations(
                queryParams,
                req.user
            );

            // 4. Send response
            res.status(200).json({
                message: `All registrations retrieved successfully for admin view`,
                ...result // result contains data and pagination
            });

        } catch (err) {
            next(err);
        }
    }

    static async updateRegistrationStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { registrationId } = req.params;
            const { status } = req.body as UpdateRegistrationStatusDto;

            if (!req.user) {
                // This should ideally be caught by authentication middleware
                throw new AppError(401, 'Authentication required');
            }

            // The validation middleware should have already validated params and body
            // based on getRegistrationParamsSchema and updateRegistrationStatusSchema

            const updatedRegistration = await RegistrationService.updateRegistrationStatus(
                parseInt(registrationId, 10),
                { status },
                req.user
            );

            res.status(200).json({
                message: 'Registration status updated successfully',
                data: updatedRegistration
            });

        } catch (err) {
            next(err);
        }
    }
}

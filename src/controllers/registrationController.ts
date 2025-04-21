import { Request, Response, NextFunction } from 'express';
import { RegistrationService } from '../services/registrationServices';
import {
    registrationValidationSchema,
    getRegistrationsQuerySchema,
    getRegistrationParamsSchema
} from '../validation/registrationValidation';
import { RegistrationDto } from '../types/registrationTypes';
import { AppError, AuthorizationError, ValidationError } from '../utils/errors'; // Import AuthorizationError and ValidationError

export class RegistrationController {
    /**
     * Handle POST /registrations
     * Creates a new registration for an event.
     */
    static async createRegistration(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // 1. Validate request body
            const { error, value } = registrationValidationSchema.validate(req.body);
            if (error) {
                // Use status 400 for validation errors
                throw new ValidationError(`Validation failed: ${error.details.map(x => x.message).join(', ')}`);
            }

            const registrationData: RegistrationDto = value;

            // 2. Call the service to create the registration
            const newRegistration = await RegistrationService.registerForEvent(registrationData);

            // 3. Send response
            res.status(201).json({
                message: 'Registration successful',
                data: newRegistration
            });

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

        } catch(err) {
            next(err); // Pass error to global handler
        }
    }
}

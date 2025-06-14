import {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError, ValidationError } from '../utils/errors';
import { JwtPayload } from '../types/authTypes';
import { Schema } from 'joi';

// Middleware to authenticate (must be logged in)
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            throw new AuthenticationError('Access token is required');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
        console.log('Decoded token payload:', decoded); // See what's in the token

        req.user = decoded;
        console.log('User from token:', req.user); // Check if user is set correctly

        // Ensure the decoded token has the expected structure
        if (!decoded.userId) {
            throw new AuthenticationError('Invalid token format');
        }
        next();
    }
    catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            next(new AuthenticationError('Invalid token'));
        } else {
            next(error);
        }
    }
}

export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            // No token provided, continue as public access
            console.log('No token provided, continuing as public access');
            next();
            return;
        }

        // Token provided, try to verify it
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
            req.user = decoded;
            console.log('User authenticated:', req.user);
            next();
        } catch (tokenError: any) { 
            // If a token was provided but it's invalid (e.g., expired, malformed)
            // it should result in a 401 to allow the client to attempt a refresh.
            // Only truly unauthenticated (no token at all) should proceed as public.
            console.error('Token verification failed:', tokenError.name, '-', tokenError.message);
            // Pass an AuthenticationError to trigger a 401 response
            next(new AuthenticationError('Invalid or expired token.')); 
        }
    }
    catch (error: any) { // Catch other unexpected errors during initial token processing (e.g., header parsing)
        console.error('Unexpected authentication middleware error:', error.message);
        console.log('Continuing as public access due to unexpected authentication error.');
        next();
    }
}

// Middleware to authorize user roles (only certain roles can access)
export const authorize = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {

        if (!req.user) {
            return next(new AuthenticationError('Authentication required'));
        }

        if (!roles.includes(req.user.role)) {
            return next(new AuthenticationError('Insufficient permissions'));
        }

        next();
    }
}

// Middleware to validate request body
export const validateRequest = (schema: Schema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const { error } = schema.validate(req.body, { abortEarly: false }); // Abort early false to get all errors

        if (error) {
            const validationErrors = error.details.map(detail => ({
                message: detail.message,
                path: detail.path,
                context: detail.context,
            }));
            
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                details: validationErrors,
            });
            return;
        }

        next();
    }
}

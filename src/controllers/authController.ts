import { Request, Response } from 'express';
import { AuthService } from '../services/authServices';
import { RegisterDto, LoginDto } from '../types/authTypes';
import { AppError, AuthenticationError, ValidationError } from '../utils/errors'; // Import ValidationError

export class AuthController {

    private static readonly REFRESH_TOKEN_COOKIE_OPTIONS = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'strict' as const,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'  // Cookie is available for all paths
    }; 

    //01 - Register a new user
    static async registerUser(req: Request<{}, {}, RegisterDto>, res: Response) {
        try {
            const authData = await AuthService.registerUser(req.body);

            // Set refresh token as an HTTP-only cookie
            res.cookie('refreshToken', authData.refreshToken, AuthController.REFRESH_TOKEN_COOKIE_OPTIONS);

            res.status(201).json({
                success: true,
                data: {
                    user: authData.user,
                    accessToken: authData.accessToken
                }
            });
        } catch (error) {
            console.error('Registration error:', error);

            if (error instanceof ValidationError) {
                // Specific handling for validation errors (e.g., email already exists)

                res.status(error.statusCode).json({
                    success: false,
                    message: error.message,
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            } else if (error instanceof AppError) {
                 // Handle other known application errors
                res.status(error.statusCode).json({
                    success: false,
                    message: error.message,
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            }
            else {
                // Handle unexpected errors
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred during registration.',
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            }
        }
    }

    //02 - Login
    static async loginUser(req: Request<{}, {}, LoginDto>, res: Response) {
        try {
           const authData = await AuthService.loginUser(req.body);

            // Set refresh token as an HTTP-only cookie
            res.cookie('refreshToken', authData.refreshToken, AuthController.REFRESH_TOKEN_COOKIE_OPTIONS);

            res.status(200).json({
                success: true,
                data: {
                    user: authData.user,
                    accessToken: authData.accessToken
                }
            });
        } catch (error) {
            console.error('Login error:', error);

            if (error instanceof AuthenticationError) {
                res.status(error.statusCode).json({ // 401
                    success: false,
                    message: error.message, // e.g., "Invalid credentials"
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            } else if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    success: false,
                    message: error.message,
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            } else {
                // Handle other unexpected errors
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred during login.',
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            }
        }
    }

    // 03 - Refresh token
    static async refreshToken(req: Request, res: Response) {
        try {
            // Make sure to handle potential TypeError if req.cookies is undefined or refreshToken is not present
            const refreshToken = req.cookies?.refreshToken;
            if (!refreshToken) {
                // Send 401 directly if cookie is missing, no need to throw
                 return res.status(401).json({
                    success: false,
                    message: 'No refresh token provided'
                 });
            }

            const tokens = await AuthService.refreshToken(refreshToken);

            // Set new refresh token as an HTTP-only cookie
            res.cookie('refreshToken', tokens.refreshToken, AuthController.REFRESH_TOKEN_COOKIE_OPTIONS);

            res.status(200).json({
                success: true,
                data: {
                    accessToken: tokens.accessToken
                }
            });
        } catch (error) {
            console.error('Error refreshing token:', error);

            if (error instanceof AuthenticationError) {
                res.status(error.statusCode).json({ // 401
                    success: false,
                    message: error.message, // e.g., "Invalid refresh token"
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            } else if (error instanceof AppError) {
                 res.status(error.statusCode).json({
                    success: false,
                    message: error.message,
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            }
            else {
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred while refreshing the token.',
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            }
        }
    }

    //04 - Logout
    static async logout(req: Request, res: Response) {
        try {
            // Clear the refresh token cookie
            res.clearCookie('refreshToken', {path: '/'});

            res.status(200).json({
                success: true,
                message: 'Logged out successfully'
            });

        } catch (error) {
            console.error('Logout error:', error);

             if (error instanceof AppError) {
                 res.status(error.statusCode).json({
                    success: false,
                    message: error.message,
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred during logout.',
                    error: process.env.NODE_ENV !== 'production' ? String(error) : undefined
                });
            }
        }
    }
}

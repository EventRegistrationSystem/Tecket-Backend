// Custom error classes
export class AppError extends Error {
    constructor(
        public statusCode: number,
        message: string
    ) {
        super(message);
        this.name = 'AppError';
    }
}

// Authentication error class for invalid credentials
export class AuthenticationError extends AppError {
    constructor(message: string) {
        super(401, message);
        this.name = 'AuthenticationError';
    }
}

// Validation error class for invalid data
export class ValidationError extends AppError {
    constructor(message: string) {
        super(400, message);
        this.name = 'ValidationError';
    }
}

// Authorization error class for permission denied
export class AuthorizationError extends AppError {
    constructor(message: string = 'Permission denied') {
        super(403, message); // 403 Forbidden
        this.name = 'AuthorizationError';
    }
}

// Event error class for invalid event data
export class EventError extends AppError {
    constructor(message: string) {
        super(400, message);
        this.name = 'EventError';
    }
}

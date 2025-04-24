import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors'; // Import cors middleware

// Importing routes
import authRoutes from './routes/authRoutes';
import eventRoutes from './routes/eventRoutes';
import userRoutes from './routes/userRoutes';
import ticketRoutes from './routes/ticketRoutes';
import registrationRoutes from './routes/registrationRoutes';
import paymentRoutes from './routes/paymentRoutes'; // Import payment routes
import { handleStripeWebhook } from './controllers/paymentController'; // Import specific handler for webhook

import swaggerUi from 'swagger-ui-express';
import specs from './config/swagger';

// Importing middlewares
const app = express();

// Define Stripe webhook route BEFORE global express.json()
// Apply raw body parser specifically for this route
app.post(
    '/api/payments/webhook/stripe',
    express.raw({ type: 'application/json' }),
    handleStripeWebhook // Use the imported handler directly
);

// Apply global middlewares AFTER the raw webhook endpoint
app.use(express.json());  // Middleware to parse JSON body for all other routes
app.use(cookieParser());  // Middleware to parse cookies

// Enable CORS for all routes
app.use(cors({
    origin: '*', // Allow all origins (for development purposes only)
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// Swagger UI route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/user', userRoutes);
app.use('/api', ticketRoutes); // Note: Consider changing base path to /api/tickets
app.use('/api/registrations', registrationRoutes);
// Mount the rest of the payment routes (e.g., /create-intent) AFTER express.json()
app.use('/api/payments', paymentRoutes);


export default app;

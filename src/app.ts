import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors'; // Import cors middleware

// Importing routes
import authRoutes from './routes/authRoutes';
import eventRoutes from './routes/eventRoutes';
import userRoutes from './routes/userRoutes';
import ticketRoutes from './routes/ticketRoutes';

import swaggerUi from 'swagger-ui-express';
import specs from './config/swagger';

// Importing middlewares
const app = express();

// Define Stripe webhook route BEFORE global express.json()
// Apply raw body parser specifically for this route
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
// Mount the rest of the payment routes (e.g., /create-intent) AFTER express.json()


export default app;

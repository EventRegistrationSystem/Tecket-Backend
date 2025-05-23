import express from 'express'; // Reverted import
import cookieParser from 'cookie-parser';
import cors from 'cors';

// Importing routes
import authRoutes from './routes/authRoutes';
import eventRoutes from './routes/eventRoutes';
import userRoutes from './routes/userRoutes';
import ticketRoutes from './routes/ticketRoutes';
import registrationRoutes from './routes/registrationRoutes';
import paymentRoutes from './routes/paymentRoutes';

import swaggerUi from 'swagger-ui-express';
import specs from './config/swagger';
import emailRoutes from './routes/emailRoutes';

// Importing middlewares
const app = express();

// Stripe webhook route needs raw body parser for signature verification
app.use('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }));

// Apply global middlewares
app.use(express.json());  // Middleware to parse JSON body for all other routes
app.use(cookieParser());  // Middleware to parse cookies

// Enable CORS for all routes
app.use(cors({
    origin: '*', // Allow all origins (for development purposes only)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

// Swagger UI route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Use routes
app.use('/api', emailRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/user', userRoutes);
app.use('/api/registrations', registrationRoutes);
// app.use('/api/payments', paymentRoutes);

app.use('/api', ticketRoutes);

export default app;

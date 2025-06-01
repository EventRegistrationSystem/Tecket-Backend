
import express from 'express'; 
import cookieParser from 'cookie-parser';
import cors from 'cors';

// Importing routes
import authRoutes from "./routes/authRoutes";
import eventRoutes from "./routes/eventRoutes";
import userRoutes from "./routes/userRoutes";
import ticketRoutes from "./routes/ticketRoutes";
import registrationRoutes from "./routes/registrationRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import emailRoutes from "./routes/emailRoutes";
import imageRoutes from "./routes/imageRoutes";

import swaggerUi from "swagger-ui-express";
import specs from "./config/swagger";
import bodyParser from "body-parser";

// Importing middlewares
const app = express();

// Stripe webhook route needs raw body parser for signature verification
app.use(
  "/api/payments/webhook/stripe",
  express.raw({ type: "application/json" })
);

// Enable CORS for all routes
app.use(
  cors({
    origin: "*", // Allow all origins (for development purposes only)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);

app.use("/api", imageRoutes);

// Apply global middlewares
app.use(express.json({ limit: "50mb" })); // Middleware to parse JSON body for all other routes
app.use(cookieParser()); // Middleware to parse cookies
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Swagger UI route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// Use routes
app.use("/api", emailRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/user", userRoutes);
app.use("/api/registrations", registrationRoutes);
// app.use('/api/payments', paymentRoutes);

app.use("/api", ticketRoutes);

export default app;

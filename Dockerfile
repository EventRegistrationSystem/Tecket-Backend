# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies
# Copy package.json and package-lock.json (or yarn.lock or pnpm-lock.yaml)
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the application source code
COPY . .

# Build the TypeScript application
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy built application from builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/prisma ./prisma

# Expose the port the app runs on
# Ensure this matches the PORT environment variable your application uses (defaulting to 3000)
EXPOSE 3000

# Command to run the application
# The prisma migrate deploy command will be handled by docker-compose
CMD ["node", "dist/server.js"]

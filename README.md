# Event Registration System Backend

## Overview
This project provides the backend API for an event management system that allows organizers to create events, manage tickets, create custom questionnaires, and process payments. Participants can browse events, register, purchase tickets, and complete event-specific questionnaires.

## Prerequisites
Before setting up the project, ensure you have the following installed:

- **Node.js:** v16.x or higher. It's recommended to use a Node Version Manager like [nvm](https://github.com/nvm-sh/nvm) to easily manage Node versions.
- **MySQL Server:**
    - **macOS:** Use [Homebrew](https://brew.sh/) (`brew install mysql`).
    - **Linux (Debian/Ubuntu):** `sudo apt update && sudo apt install mysql-server`.
    - **Windows:** Download the official installer from [MySQL Downloads](https://dev.mysql.com/downloads/installer/).
- **npm** (usually comes with Node.js) or **yarn**.

## Development Environment Setup
### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Capstone-Backend.git
cd Capstone-Backend
```

### 2. Install Dependencies

Use npm to install the required dependencies:

```bash
npm install
```

### 3. Configure Environment Variables

- Copy the example environment file:

```bash
cp .env.example .env
```

- Update the .env file with your database credentials and other settings:

```
# Database Configuration
DATABASE_URL="mysql://username:password@localhost:3306/event_management_dev"

# Server Configuration
PORT=3000
NODE_ENV=development

# Authentication
JWT_SECRET="your-secret-jwt-key"
REFRESH_TOKEN_SECRET="your-secret-refresh-token-key"

# Stripe Configuration (Required for Payment Processing)
STRIPE_SECRET_KEY="sk_test_..." # Your Stripe Secret Key
STRIPE_PUBLISHABLE_KEY="pk_test_..." # Your Stripe Publishable Key
STRIPE_WEBHOOK_SECRET="whsec_..." # Your Stripe Webhook Signing Secret (for handling webhook events)

# Seeding Configuration (Optional - for initial admin user)
SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="Admin123!"
```

### 4. Initial Project Setup (Install Dependencies & Configure Database)

Run the following command to install project dependencies and set up the database:

```bash
npm run setup:dev
```

This command performs two main actions:
1.  `npm install`: Installs all necessary Node.js packages defined in `package.json`.
2.  `npm run db:setup`: Configures the database by:
    - Generating the Prisma Client (`prisma generate`).
    - Applying database migrations (`prisma migrate deploy`).
    - Seeding the database with initial data (`npm run db:seed`).

Ensure your MySQL server is running before executing this command.

### 5. Start the Server

Once everything is set up, you can start the server using the following command:

```bash
npm run dev
```

If everything is configured correctly, you should see:

```
Connected to the MySQL database.
Server is running on http://localhost:3000
```

## API Documentation
This project uses Swagger for API documentation. Once the server is running, you can access the interactive API documentation in your browser:

[http://localhost:3000/api-docs](http://localhost:3000/api-docs)

This interface allows you to explore all available API endpoints, view their parameters, and test them directly.

## Sample data


## Switching to a new development environment
When switching to a new development environment or after pulling updates, to ensure seamless integration, perform the steps below:
### 1. Update dependencies

``` bash
npm install
```

### 2. Sync Database Schema and Seed Data

Ensure your database schema is up-to-date with the latest migrations and re-seed if necessary:

```bash
npm run db:setup
```
This command runs `prisma generate`, `prisma migrate deploy`, and `npm run db:seed`.

### Reseting the database
If somehow you need to reset the database to a clean state, run
```bash 
npm run db:reset
```
This will drop all tables, reapply migrations, and reseed the database.

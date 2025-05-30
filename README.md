# Event Registration System Backend

## Overview
This project provides the backend API for an event management system that allows organizers to create events, manage tickets, create custom questionnaires, and process payments. Participants can browse events, register, purchase tickets, and complete event-specific questionnaires.

## Prerequisites
Before setting up the project, ensure you have the following installed:

*   **Git**
*   **Node.js:** v16.x or higher. It's recommended to use a Node Version Manager like [nvm](https://github.com/nvm-sh/nvm) to easily manage Node versions.
*   **npm** (usually comes with Node.js) or **yarn**.
*   **Docker Desktop:** For running containers locally (includes Docker Engine and Docker Compose). Download from [Docker Official Website](https://www.docker.com/products/docker-desktop/).
*   **MySQL Server:** (Only required if you choose to run the database directly on your host machine instead of via Docker)
    *   **macOS:** Use [Homebrew](https://brew.sh/) (`brew install mysql`).
    *   **Linux (Debian/Ubuntu):** `sudo apt update && sudo apt install mysql-server`.
    *   **Windows:** Download the official installer from [MySQL Downloads](https://dev.mysql.com/downloads/installer/).

## Local Development Setup

This section outlines how to get the backend running on your local machine. You have two primary options: using Docker Compose (recommended for consistency) or running directly on your host.

### Option 1: Using Docker Compose (Recommended)

This method uses Docker to containerize both the backend application and the MySQL database, providing a consistent and isolated development environment.

#### 1. Clone the Repository

```bash
git clone https://github.com/EventRegistrationSystem/Tecket-Backend.git
cd Tecket-Backend
```

#### 2. Configure Environment Variables

-   Copy the example environment file to create your local `.env` file:

    ```bash
    cp .env.example .env
    ```

-   Open the newly created `.env` file and update the placeholder values. For Docker Compose, the `DATABASE_URL` should point to the `db` service:

    ```
    # Server configuration
    NODE_ENV=development
    PORT=3000

    # Database Configuration (for Docker Compose, 'db' is the service name)
    DATABASE_URL="mysql://username:password@db:3306/db_name"

    # MySQL Database Credentials (used by the 'db' service in docker-compose.yml)
    MYSQL_ROOT_PASSWORD="your_mysql_root_password"
    MYSQL_DATABASE="your_database_name"
    MYSQL_USER="your_database_user"
    MYSQL_PASSWORD="your_database_password"

    # Authentication
    JWT_SECRET="your-secret-jwt-key"
    JWT_REFRESH_SECRET="your-secret-refresh-token-key"

    # Stripe configuration
    STRIPE_SECRET_KEY="your_secret_key_here"
    STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret_here"

    # Email Configuration (for Nodemailer SMTP)
    SMTP_USER="your_smtp_username@example.com"
    SMTP_PASS="your_smtp_password_or_app_password"
    ```
    **Important:** Ensure `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD` in your `.env` match the values you intend to use for the Dockerized MySQL database.

#### 3. Build and Run Containers

Navigate to the `Tecket-Backend` directory and run Docker Compose. This will build your backend application image, pull the MySQL image, and start both services.

```bash
sudo docker-compose up -d --build
```

-   To check if containers are running:
    ```bash
    sudo docker-compose ps
    ```
-   To view application logs (useful for debugging):
    ```bash
    sudo docker-compose logs -f app
    ```
    (Press `Ctrl+C` to exit logs)

#### 4. Run Database Migrations and Seed Data

Once the containers are up, apply your Prisma migrations and seed the database:

```bash
sudo docker-compose exec app npx prisma migrate deploy
sudo docker-compose exec app npx prisma db seed
```

#### 5. Access the API

Your backend API should now be running and accessible at `http://localhost:3000`.

#### 6. Stop Containers

When you are done with development, stop the containers:

```bash
sudo docker-compose down
```

### Option 2: Without Docker

This method runs the backend application directly on your host machine, requiring a locally installed MySQL server.

#### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Tecket-Backend.git
cd Tecket-Backend
```

#### 2. Install Dependencies

Use npm to install the required dependencies:

```bash
npm install
```

#### 3. Configure Environment Variables

-   Copy the example environment file:

    ```bash
    cp .env.example .env
    ```

-   Update the `.env` file with your database credentials and other settings. For this option, `DATABASE_URL` should point to your local MySQL server (e.g., `localhost`):

    ```
    # Database Configuration
    DATABASE_URL="mysql://username:password@localhost:3306/event_management_dev"

    # Server Configuration
    PORT=3000
    NODE_ENV=development

    # Authentication
    JWT_SECRET="your-secret-jwt-key"
    JWT_REFRESH_SECRET="your-secret-refresh-token-key"

    # Stripe Configuration (Required for Payment Processing)
    STRIPE_SECRET_KEY="sk_test_..." # Your Stripe Secret Key
    STRIPE_WEBHOOK_SECRET="whsec_..." # Your Stripe Webhook Signing Secret (for handling webhook events)

    # Email Configuration (for Nodemailer SMTP)
    SMTP_USER="your_smtp_username@example.com"
    SMTP_PASS="your_smtp_password_or_app_password"
    ```
    **Important:** Ensure your local MySQL server is running and accessible with the credentials provided in `DATABASE_URL`.

#### 4. Initial Project Setup (Install Dependencies & Configure Database)

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

#### 5. Start the Server

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


## Switching to a New Development Environment or Pulling Updates

When switching to a new development environment (e.g., from host-based to Docker Compose) or after pulling the latest updates from the repository, ensure seamless integration by following the relevant steps below:

### For Docker Compose Setup:

1.  **Pull Latest Code:**
    ```bash
    git pull origin main # Or your relevant branch
    ```
2.  **Rebuild and Restart Containers:**
    If there are changes to `package.json`, `Dockerfile`, or other core dependencies, it's best to rebuild your Docker images.
    ```bash
    sudo docker-compose up -d --build
    ```
3.  **Apply Database Migrations and Seed Data:**
    Always ensure your database schema is up-to-date with the latest migrations and re-seed if necessary.
    ```bash
    sudo docker-compose exec app npx prisma migrate deploy
    sudo docker-compose exec app npx prisma db seed
    ```

### For Without Docker Setup:

1.  **Pull Latest Code:**
    ```bash
    git pull origin main # Or your relevant branch
    ```
2.  **Update Dependencies:**
    ```bash
    npm install
    ```
3.  **Sync Database Schema and Seed Data:**
    Ensure your database schema is up-to-date with the latest migrations and and re-seed if necessary.
    ```bash
    npm run db:setup
    ```
    This command runs `prisma generate`, `prisma migrate deploy`, and `npm run db:seed`.

## Resetting the Database

If you need to reset the database to a clean state (e.g., for fresh development or testing), you can do so based on your setup:

### For Docker Compose Setup:

This will stop and remove your database container and its associated volume, then recreate it and apply migrations/seed data. **This will permanently delete all data in the `mysql_data` volume.**

```bash
sudo docker-compose down -v db && sudo docker-compose up -d --build db && sudo docker-compose exec app npx prisma migrate deploy && sudo docker-compose exec app npx prisma db seed
```

### For Without Docker Setup:

This will drop all tables, reapply migrations, and reseed the database on your local MySQL server.

```bash
npm run db:reset
```

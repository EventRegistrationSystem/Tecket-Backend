# Dockerization Plan for Capstone Project

This document outlines the plan to containerize the backend, frontend, and MySQL database for the Capstone project using Docker and Docker Compose.

## Overall Structure

*   A `docker-compose.yml` file will be created in the parent directory `d:/src/uni/Capstone/`. This will manage all three services (backend, frontend, database) and reference the projects using relative paths (`./Capstone-Backend` and `./capstone-frontend`).
*   A `Dockerfile` will be placed in `d:/src/uni/Capstone/Capstone-Backend/` for the backend.
*   A `Dockerfile` will be placed in `d:/src/uni/Capstone/capstone-frontend/` for the frontend.
*   A `.dockerignore` file will be created in both backend and frontend project directories.

## Phase 1: Backend Dockerization (`d:/src/uni/Capstone/Capstone-Backend/`)

1.  **Create `d:/src/uni/Capstone/Capstone-Backend/.dockerignore`**:
    *   To exclude `node_modules`, `.env` files, `dist`, `*.log`, `coverage`, etc., from the Docker image.
2.  **Create `d:/src/uni/Capstone/Capstone-Backend/Dockerfile`**:
    *   **Base Image**: Use a Node.js image (e.g., `node:18-alpine` or `node:20-alpine`).
    *   **Working Directory**: Set to `/usr/src/app`.
    *   **Install Dependencies**:
        *   Copy `package.json` and `package-lock.json`.
        *   Run `npm ci --only=production` (or `npm install --omit=dev`).
    *   **Prisma Setup**:
        *   Copy the `prisma` directory.
        *   Run `npx prisma generate`.
    *   **Copy Source Code**: Copy the `src` directory and `tsconfig.json`.
    *   **Build**: Run `npm run build` (executes `tsc`).
    *   **Expose Port**: Expose the backend's listening port (e.g., `3000`).
    *   **Start Command**: `CMD ["node", "dist/server.js"]`.
    *   **Migrations Note**: Database migrations (`npx prisma migrate deploy`) will be handled by an entrypoint script in `docker-compose.yml` or directly in its command to ensure the database service is available.

## Phase 2: Frontend Dockerization (`d:/src/uni/Capstone/capstone-frontend/`)

1.  **Create `d:/src/uni/Capstone/capstone-frontend/.dockerignore`**:
    *   To exclude `node_modules`, `.env` files, `dist`, `*.log`, etc.
2.  **Create `d:/src/uni/Capstone/capstone-frontend/Dockerfile` (Multi-stage build)**:
    *   **Build Stage (`builder`)**:
        *   **Base Image**: Use a Node.js image (e.g., `node:18-alpine` or `node:20-alpine`).
        *   **Working Directory**: Set to `/app`.
        *   **Install Dependencies**:
            *   Copy `package.json` and `package-lock.json`.
            *   Run `npm install`.
        *   **Copy Source Code**: Copy all frontend source files.
        *   **Build**: Run `npm run build` (executes `vite build`). This creates a `dist` folder.
    *   **Serve Stage**:
        *   **Base Image**: Use a lightweight Nginx image (e.g., `nginx:alpine`).
        *   **Copy Assets**: `COPY --from=builder /app/dist /usr/share/nginx/html`.
        *   **Nginx Configuration**:
            *   Create/Copy `nginx.conf` to serve the Vue SPA and proxy API requests.
            *   Listen on port 80.
            *   Serve static files from `/usr/share/nginx/html`.
            *   Include `try_files $uri $uri/ /index.html;` for SPA routing.
            *   Include a `location /api/` block to `proxy_pass http://backend:3000/api/;` (assuming backend service is named `backend` and runs on port 3000).
        *   **Expose Port**: Expose port 80.

## Phase 3: Database Setup (MySQL via Docker Compose)

*   Defined directly in `docker-compose.yml`.
*   **Image**: `mysql:8.0` (or preferred version).
*   **Environment Variables**: `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` (sourced from a `.env` file).
*   **Volume**: Use a Docker named volume (e.g., `mysql_data`) for persistence at `/var/lib/mysql`.

## Phase 4: Orchestration with Docker Compose (`d:/src/uni/Capstone/docker-compose.yml`)

1.  **Create `d:/src/uni/Capstone/docker-compose.yml`**:
    *   **Version**: `version: '3.8'` (or similar).
    *   **Services**:
        *   **`db` (MySQL)**:
            *   `image: mysql:8.0`
            *   `container_name: capstone_db`
            *   `restart: unless-stopped`
            *   `environment`: Sourced from `d:/src/uni/Capstone/.env`.
            *   `ports`: `3306:3306` (map to host for optional direct access).
            *   `volumes`: `mysql_data:/var/lib/mysql`.
            *   `networks`: `capstone_net`.
        *   **`backend`**:
            *   `build`:
                *   `context: ./Capstone-Backend`
                *   `dockerfile: Dockerfile`
            *   `container_name: capstone_backend`
            *   `restart: unless-stopped`
            *   `ports`: `BACKEND_HOST_PORT:BACKEND_CONTAINER_PORT` (e.g., `3000:3000`).
            *   `environment`: Sourced from `d:/src/uni/Capstone/.env` (e.g., `DATABASE_URL`, `JWT_SECRET`, `STRIPE_KEYS`, `PORT`).
            *   `depends_on`: `db`.
            *   `command`: `sh -c "npx prisma migrate deploy && npm start"` (to run migrations before starting).
            *   `networks`: `capstone_net`.
            *   `volumes` (for development, optional for client demo):
                *   `./Capstone-Backend:/usr/src/app`
                *   `/usr/src/app/node_modules`
        *   **`frontend`**:
            *   `build`:
                *   `context: ./capstone-frontend`
                *   `dockerfile: Dockerfile`
            *   `container_name: capstone_frontend`
            *   `restart: unless-stopped`
            *   `ports`: `FRONTEND_HOST_PORT:80` (e.g., `8080:80`).
            *   `environment`: `VITE_API_BASE_URL=/api` (if Nginx proxy is configured for `/api`).
            *   `depends_on`: `backend`.
            *   `networks`: `capstone_net`.
            *   `volumes` (for development, optional for client demo):
                *   `./capstone-frontend:/app`
                *   `/app/node_modules`
    *   **Volumes**:
        *   `mysql_data: {}` (declares the named volume).
    *   **Networks**:
        *   `capstone_net: {}` (declares the custom bridge network).

2.  **Create `d:/src/uni/Capstone/.env.example` (for Docker Compose)**:
    *   This file will serve as a template for the client's `.env` file.
    *   Include placeholders for:
        ```env
        # MySQL Settings
        MYSQL_DATABASE=capstone_event_db
        MYSQL_USER=capstone_user
        MYSQL_PASSWORD=yoursecurepassword
        MYSQL_ROOT_PASSWORD=yourverysecurepassword
        DB_HOST_FOR_BACKEND=db # Service name of the DB container
        DB_PORT_FOR_BACKEND=3306

        # Backend Settings
        BACKEND_CONTAINER_PORT=3000
        BACKEND_HOST_PORT=3000
        DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${DB_HOST_FOR_BACKEND}:${DB_PORT_FOR_BACKEND}/${MYSQL_DATABASE}
        JWT_SECRET=replace_with_strong_jwt_secret
        REFRESH_TOKEN_SECRET=replace_with_strong_refresh_token_secret
        STRIPE_SECRET_KEY=sk_test_yourstripesecretkey
        STRIPE_WEBHOOK_SECRET=whsec_yourstripwebhooksecret
        NODE_ENV=production # or development

        # Frontend Settings
        FRONTEND_HOST_PORT=8080
        # VITE_API_BASE_URL is typically set in frontend Dockerfile or Nginx config
        # If needed by docker-compose for frontend build args:
        # VITE_API_BASE_URL_BUILD_ARG=/api
        ```

## Phase 5: Client Instructions

*   Provide clear, step-by-step instructions for the client:
    1.  **Install Docker Desktop**: Download from [docker.com](https://www.docker.com/products/docker-desktop/).
    2.  **Clone Repository**:
        *   `git clone <repository_url> capstone_project`
        *   Ensure the structure is `capstone_project/Capstone-Backend` and `capstone_project/capstone-frontend`.
    3.  **Navigate to Project Root**: `cd capstone_project`.
    4.  **Create `.env` File**:
        *   Copy `d:/src/uni/Capstone/.env.example` (or `capstone_project/.env.example`) to `.env` in the same directory.
        *   Update the placeholder values in `.env` with actual secrets and configurations.
    5.  **Build and Run**:
        *   `docker-compose up --build -d`
        *   This command builds the images (if they don't exist or Dockerfiles changed) and starts all services in detached mode.
    6.  **Access Application**:
        *   Frontend: `http://localhost:FRONTEND_HOST_PORT` (e.g., `http://localhost:8080`).
        *   Backend API (if needed for direct testing): `http://localhost:BACKEND_HOST_PORT` (e.g., `http://localhost:3000`).
    7.  **View Logs**:
        *   `docker-compose logs -f backend`
        *   `docker-compose logs -f frontend`
        *   `docker-compose logs -f db`
        *   To view all logs: `docker-compose logs -f`
    8.  **Stop Application**:
        *   `docker-compose down` (stops and removes containers, networks).
    9.  **Stop and Remove Volumes (for a clean slate, will delete DB data)**:
        *   `docker-compose down -v`

This plan will be executed step-by-step.

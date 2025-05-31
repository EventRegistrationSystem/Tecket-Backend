# Tecket Backend Deployment Guide

This document outlines the important aspects and procedures for deploying the Tecket backend application using Docker, supporting both production and staging environments on a single VPS.

## I. Core Deployment Artifacts & Configuration

The deployment relies on several key files within the project:

1.  **`Dockerfile`**:
    *   Builds the application image using a multi-stage process (`builder` and final `production` stage) for optimized image size.
    *   **Builder Stage:**
        *   Installs all dependencies (including devDependencies).
        *   Copies `prisma` schema and generates Prisma client.
        *   Compiles `prisma/seed.ts` to `prisma/dist_seed/seed.js` using `tsc`. This allows the seed script to run in an environment without `ts-node`.
        *   Copies all source code.
        *   Builds the TypeScript application (`npm run build`).
        *   Prunes development dependencies (`npm prune --production`).
    *   **Final Stage:**
        *   Uses `node:20-alpine` as a base.
        *   Sets `NODE_ENV=production`.
        *   Runs as a non-root `node` user for enhanced security.
        *   Copies compiled application (`dist`), pruned `node_modules`, `package.json`, and the `prisma` directory (including schema, generated client, and compiled seed script) from the `builder` stage.
        *   Exposes the application port (default 3000).
        *   The default `CMD` is `["node", "dist/server.js"]`, which is typically overridden by Docker Compose.

2.  **`docker-compose.prod.yml`** (For Production Environment):
    *   Defines `app` and `db` services for production.
    *   **`app` service (Production Backend):**
        *   Builds from the project's `Dockerfile`.
        *   `container_name`: e.g., `tecket_prod_app`.
        *   `ports`: Maps a host port to the container's port (e.g., `"3000:3000"`). This port will typically be accessed via a reverse proxy on the VPS.
        *   `env_file`: Uses `.env.prod` for production-specific environment variables.
        *   `command`: `sh -c "npx prisma migrate deploy && npm start"` (applies migrations then starts the application).
        *   `depends_on`: `db` service, waiting for it to be healthy.
    *   **`db` service (Production Database - MySQL):**
        *   Uses `mysql:8.0` image.
        *   `container_name`: e.g., `tecket_prod_db`.
        *   `environment`: Configured using variables (e.g., `${PROD_MYSQL_ROOT_PASSWORD}`, `${PROD_MYSQL_DATABASE}`) which are substituted by Docker Compose using values from the file specified by the `--env-file` CLI option (e.g., `.env.prod`).
        *   `volumes`: Uses a named volume for data persistence (e.g., `tecket_prod_mysql_data`).
        *   Includes a `healthcheck`.
    *   Top-level `volumes` section defines `tecket_prod_mysql_data` with an explicit `name`.

3.  **`docker-compose.staging.yml`** (For Staging Environment):
    *   Defines `app` and `db` services for staging, similar to production.
    *   **`app` service (Staging Backend):**
        *   `container_name`: e.g., `tecket_staging_app`.
        *   `ports`: Maps a *different* host port (e.g., `"3001:3000"`).
        *   `env_file`: Uses `.env.staging`.
        *   `command`: `sh -c "npx prisma migrate deploy && npm run db:seed && npm start"` (applies migrations, **runs the database seed script**, then starts the application).
    *   **`db` service (Staging Database - MySQL):**
        *   `container_name`: e.g., `tecket_staging_db`.
        *   `environment`: Configured using `STAGING_` prefixed variables from the `--env-file .env.staging` CLI option.
        *   `volumes`: Uses a separate named volume (e.g., `tecket_staging_mysql_data`).
    *   Top-level `volumes` section defines `tecket_staging_mysql_data` with an explicit `name`.

4.  **Environment Variable Files (`.env.prod`, `.env.staging`):**
    *   **CRITICAL:** These files store secrets and environment-specific configurations.
    *   **DO NOT COMMIT TO GIT.** Use `.env.prod.example` and `.env.staging.example` as templates in version control.
    *   These files must be created manually on the deployment server (and locally for testing).
    *   Contents include:
        *   `NODE_ENV` (`production` or `development`/`staging`).
        *   `PORT` (internal container port).
        *   `DATABASE_URL` (e.g., `mysql://USER:PASS@db:3306/DB_NAME`, where `db` is the service name in the compose file).
        *   MySQL service credentials (`MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` - prefixed with `PROD_` or `STAGING_`).
        *   Application secrets (JWT keys, Stripe keys, Email service credentials).

5.  **`.dockerignore` File:**
    *   Prevents unnecessary files or secrets from being included in the Docker build context.
    *   Excludes `node_modules/`, `.env*` (except `*.example`), `dist/` (if not part of final image assembly), logs, etc.
    *   **Crucially, it MUST NOT exclude `prisma/migrations/*`** as these files are required by `npx prisma migrate deploy` inside the container.

## II. Deployment Process on VPS

This outlines a general process for deploying to a Virtual Private Server (VPS).

1.  **VPS Prerequisites:**
    *   Docker Engine installed.
    *   Docker Compose plugin (or standalone binary) installed.
    *   Git installed.
    *   A reverse proxy (e.g., Nginx) installed and configured (recommended).

2.  **Initial Setup (per environment - Production & Staging):**
    *   Log in to the VPS.
    *   Clone your project repository: `git clone <your-repo-url> tecket-backend`
    *   Navigate into the project directory: `cd tecket-backend`
    *   **For Production:**
        *   Checkout the production branch: `git checkout main` (or your production branch).
        *   `git pull` to ensure latest code.
        *   Create `.env.prod` from `.env.prod.example` and populate with production secrets.
        *   Start services:
            ```bash
            docker-compose -f docker-compose.prod.yml --env-file .env.prod -p tecketprod up --build -d
            ```
    *   **For Staging:**
        *   Checkout the staging/development branch: `git checkout develop` (or your staging branch).
        *   `git pull` to ensure latest code.
        *   Create `.env.staging` from `.env.staging.example` and populate with staging secrets/test keys.
        *   Start services:
            ```bash
            docker-compose -f docker-compose.staging.yml --env-file .env.staging -p tecketstaging up --build -d
            ```
    *   The `-p <projectname>` flag (e.g., `tecketprod`, `tecketstaging`) namespaces containers, networks, and default volumes, ensuring isolation between environments.
    *   The `--env-file .env.prod` (or `.env.staging`) flag makes variables from these files available for substitution by Docker Compose in the `environment` blocks of services (especially for the `db` service).

3.  **Reverse Proxy Configuration (e.g., Nginx):**
    *   Configure Nginx to act as a reverse proxy.
    *   Set up server blocks for your domains/subdomains:
        *   `api.yourdomain.com` (Production) -> `proxy_pass http://localhost:3000;` (points to `tecket_prod_app`'s host port).
        *   `staging-api.yourdomain.com` (Staging) -> `proxy_pass http://localhost:3001;` (points to `tecket_staging_app`'s host port).
    *   Implement SSL/TLS (HTTPS) using Let's Encrypt or another provider at the Nginx level.
    *   Ensure Nginx is configured to pass necessary headers (e.g., `X-Forwarded-For`, `X-Real-IP`).

4.  **Updating an Environment:**
    *   SSH into the VPS and navigate to the project directory.
    *   Checkout the correct branch for the environment being updated.
    *   Pull the latest changes: `git pull`.
    *   Re-run the appropriate `docker-compose ... up --build -d` command. Docker will rebuild the image if source files or `Dockerfile` changed and then recreate the necessary containers.
    *   Monitor logs to ensure a successful startup.

## III. Important Operational Notes

1.  **Secret Management:**
    *   Reiterate: `.env.prod` and `.env.staging` files containing secrets are **never** committed to Git.
    *   Securely manage access to these files on the VPS.
    *   Consider using a dedicated secret management tool for more advanced setups.

2.  **Database Management:**
    *   **Backups:** Regularly back up your production database (`tecket_prod_mysql_data` volume). Document the backup procedure (e.g., using `docker exec` to run `mysqldump`, or volume backup tools).
    *   **Restore:** Document the database restore procedure.
    *   **Migrations:** `npx prisma migrate deploy` is designed to be safe for applying pending migrations. Always test new migrations thoroughly in staging before deploying to production.

3.  **Volume Management:**
    *   Production data is stored in `tecket_prod_mysql_data`. Staging data in `tecket_staging_mysql_data`.
    *   Commands for managing volumes:
        *   `docker volume ls`
        *   `docker volume inspect <volume_name>`
        *   `docker volume rm <volume_name>` (Use with extreme caution, especially for production volumes).

4.  **Logging and Monitoring:**
    *   Access container logs:
        *   `docker-compose -f <file> -p <project> logs app`
        *   `docker-compose -f <file> -p <project> logs db`
    *   Consider setting up centralized logging for production (e.g., ELK stack, Grafana Loki, or a cloud-based logging service).

5.  **Resource Management on VPS:**
    *   Monitor CPU, RAM, and disk space usage on the VPS, as running multiple environments consumes more resources.
    *   Adjust VPS size if necessary.

6.  **Security Best Practices:**
    *   Keep the VPS operating system and all installed software (Docker, Nginx, etc.) up to date with security patches.
    *   Configure a firewall on the VPS (e.g., `ufw`), only allowing traffic on necessary ports (typically 80 for HTTP, 443 for HTTPS, and SSH).
    *   The application runs as a non-root user inside the container.
    *   Regularly review and update dependencies for security vulnerabilities.

7.  **Git Branching Strategy:**
    *   A common strategy:
        *   `feature/*` branches for new development.
        *   `develop` branch: Integration branch for features, deployed to the **staging** environment.
        *   `main` (or `master`) branch: Stable, production-ready code, deployed to the **production** environment.
        *   Hotfixes for production are branched from `main`, fixed, merged back to `main` and `develop`.
    *   Ensure deployment scripts/processes on the VPS pull code from the correct branch for each environment.

8.  **Troubleshooting:**
    *   **Container Fails to Start:** Check `docker-compose logs <service_name>` for errors. Common issues include incorrect environment variables, port conflicts (if not using a reverse proxy correctly), or application errors.
    *   **Database Connection Issues:** Verify `DATABASE_URL` in the app's `.env` file, ensure the `db` service is healthy, and check network connectivity within Docker.
    *   **Migration Problems:** Check `prisma/migrations` are correctly included in the image (not in `.dockerignore`), and review migration script output in logs.

This guide provides a comprehensive overview. Specific commands and configurations might need minor adjustments based on the exact VPS environment and chosen tools.

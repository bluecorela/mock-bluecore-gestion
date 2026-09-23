# Mock Bluecore Gestión — Backend API

API backend construida con NestJS para el portal de gestión interna de Bluecore. Gestiona equipos, personal, evaluaciones de desempeño, sesiones One to One, rotaciones y métricas de rendimiento, integrado con Supabase/PostgreSQL como base de datos.

## Features

- **Teams Management**: CRUD de equipos, sprints, integrantes y dashboard consolidado con métricas de rendimiento.
- **Personnel Management**: Gestión de personal, asignación a equipos, control de vacaciones y reemplazos.
- **Sprint Evaluation**: Registro de evaluaciones por sprint con auto-cierre cuando todos los integrantes han sido evaluados.
- **Performance Evaluation**: Evaluaciones de desempeño con habilitación por Admin, historial por periodo y configuración dinámica de preguntas.
- **One to One (OTO)**: Sesiones individuales cada 4 sprints con configuración dinámica, historial y exportación.
- **Rotation Management**: Control de rotaciones entre equipos con historial completo.
- **Operations Engine**: Cálculo centralizado de promedios de rendimiento, tendencias y calificaciones por sprint.
- **Dynamic Sidebar**: Módulos de navegación controlados por rol desde Supabase.
- **Maintenance Mode**: Endpoint para activar/desactivar modo mantenimiento global.
- **Supabase Integration**: PostgreSQL como base de datos y Supabase Data API para acceso desde el backend.
- **Migration Utilities**: Scripts históricos para preparar e importar datos hacia Supabase.

## Prerequisites

- Node.js 20 or 22 LTS (`nvm use` selects the recommended version)
- npm or yarn
- Supabase project with Data API enabled
- Supabase secret/service role key for backend access

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd mock-bluecore-gestion
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and configure your Supabase credentials and other necessary variables.

   EXAMPLE:

```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_secret_or_service_role_key
   SUPABASE_V2_SCHEMA=bluecore_v2
```

`SUPABASE_V2_SCHEMA` is optional and defaults to `bluecore_v2`. Application
data access uses `SupabaseClient.getV2Client()`; the default Supabase client is
reserved for Auth administration.

## Database schema and migrations

For a new environment, run `scripts/create-bluecore-v2-schema.sql` first.
Then apply every file in `scripts/migrations/` in filename order. The
`20260916_sprint_operations.sql` migration creates the operational sprint
tables, dashboard view, atomic counters and transactional functions used by
the API. The subsequent `20260917_sprint_idempotency.sql` migration makes
sprint closure and story movement safe to retry.
The `20260918_sprint_evaluation_team_membership.sql` migration restricts sprint
evaluation records to members of the selected team.
The `20260921_email_and_report_integrity.sql` migration enforces
case-insensitive active employee emails and forward-only weekly report status
transitions. Employees may keep active memberships in multiple teams; the
database only prevents duplicate active membership in the same team.
The `20260921_multi_team_movements.sql` migration updates rotations and
vacation coverage so they only close the membership involved in the movement
and preserve every unrelated active team assignment. A vacation replacement
must come from `pool-de-vacaciones`, covers every active team of the absent
employee and returns to the pool when the absence is completed.

`PATCH /api/auth/password/change-completed` now accepts `{ "newPassword": "..." }`
and changes the password before clearing the initial-change flag. Update callers
that previously sent an empty body.

Before applying `20260916_one_active_sprint.sql`, run its preflight query and
resolve any team with more than one `in_progress` sprint. Database migrations
must be tested in a non-production Supabase project before promotion.

Run `npm run supabase:check` after deployment. Besides connectivity and row
counts, it verifies the required RPC contract and checks active membership,
sprint and employee-email invariants without modifying remote data.

Set `SUPABASE_DB_URL` to the PostgreSQL connection string and use the tracked
migration runner to inspect or apply pending files:

```bash
npm run supabase:migrations:status
npm run supabase:migrations:apply
```

The runner serializes executions with a PostgreSQL advisory lock, records a
SHA-256 checksum for every migration and refuses changed migrations.

## Running the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run start:prod

# Debug mode
npm run start:debug
```

The application will start on `http://localhost:3000` by default.

## Docker and cloud deployment

The API is stateless: application data is persisted in Supabase, so the API
container does not require a Docker volume. Runtime secrets must be configured
in the cloud provider and must never be copied into the image.

Create the environment files from the safe templates. Use different Supabase
projects and credentials for every environment:

```bash
cp .env.development.example .env.development
cp .env.test.example .env.test
cp .env.production.example .env.production
```

Development with hot reload:

```bash
ENV_FILE=.env.development NODE_ENV=development docker compose \
  -f docker-compose.yml -f docker-compose.development.yml up --build
```

Tests in an isolated container:

```bash
ENV_FILE=.env.test NODE_ENV=test docker compose \
  -f docker-compose.yml -f docker-compose.test.yml run --rm api
```

Production-like local validation:

```bash
ENV_FILE=.env.production NODE_ENV=production docker compose up --build -d
docker compose ps
curl http://localhost:3000/api/health
```

Build an image for a registry:

```bash
docker build -t REGISTRY/bluecore-gestion-api:VERSION .
docker push REGISTRY/bluecore-gestion-api:VERSION
```

Cloud runtime requirements:

- Inject `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`
  using the provider's secret manager.
- Set `CORS_ORIGINS` to the comma-separated production frontend origins.
- Set `FRONTEND_URL` to the production frontend URL.
- Keep `SWAGGER_ENABLED=false` unless API documentation must be public.
- Route health checks to `GET /api/health` on the platform-provided `PORT`.
- Do not mount persistent storage; Supabase is the persistence layer.

Environment file precedence outside Docker is:

1. Variables injected by the operating system or cloud secret manager.
2. `.env.<NODE_ENV>.local`.
3. `.env.<NODE_ENV>`.
4. `.env` as a local fallback.

Never reuse the production Supabase service-role key in development or tests.

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov

# Watch mode for tests
npm run test:watch
```

## Building

```bash
npm run build
```

## Linting and Formatting

```bash
# Lint code
npm run lint

# Format code
npm run format
```

## API Endpoints

The API provides endpoints for:

- **Teams (`/equipos`, legacy-compatible route)**
- **Personnel (`/personal`, legacy-compatible route)**
- **Performance (/performance)**
- **One to One (/oto)**
- **Rotation (`/rotacion`, legacy-compatible route)**
- **Rotation History (`/rotacion-historial`, legacy-compatible route)**
- **Sidebar Modules (`/modulos-sidebar`, legacy-compatible route)**
- **Maintenance (/maintenance)**

For detailed API documentation and testing, refer to the Swagger/OpenAPI specs if available, or check the controller files in the `src/` directory.

Swagger URL: https://bluecore-gestion-api.bluecorela.com/api/Docs#

## Project Structure

```
src/
├── main.ts                    # Entry point & CORS configuration
├── app.module.ts              # Root module
├── app.controller.ts          # Health check
├── app.service.ts             # Base service
├── supabase/
│   ├── supabase.client.ts     # Supabase client wrapper
│   ├── supabase-data.service.ts # Data access layer
│   └── interfaces/
├── teams/
│   ├── teams.controller.ts  # Teams & Sprints endpoints
│   ├── teams.service.ts     # Dashboard, metrics & evaluation logic
│   ├── teams.module.ts
│   └── dto/
├── personnel/
│   ├── personnel.controller.ts # Personnel endpoints
│   ├── personnel.service.ts
│   ├── personnel.module.ts
│   └── dto/
├── performance/
│   ├── performance.controller.ts  # Performance evaluation endpoints
│   ├── performance.service.ts     # Evaluation & enablement logic
│   ├── performance.module.ts
│   └── dto/
├── oto/
│   ├── oto.controller.ts      # One to One endpoints
│   ├── oto.service.ts         # OTO calculation & history logic
│   ├── oto.module.ts
│   └── dto/
├── operations/
│   └── operations.service.ts # Centralized performance calculations
├── rotation/
│   ├── rotation.controller.ts
│   ├── rotation.service.ts
│   └── rotation.module.ts
├── rotation-history/
│   ├── rotation-history.controller.ts
│   ├── rotation-history.service.ts
│   └── rotation-history.module.ts
├── sidebar-modules/
│   ├── sidebar-modules.controller.ts
│   ├── sidebar-modules.service.ts
│   └── sidebar-modules.module.ts
└── maintenance/
    ├── maintenance.controller.ts
    ├── maintenance.service.ts
    └── maintenance.module.ts

```

## Key Business Logic

Performance Metrics (Cuadro de Sprints)
The scoring formula for sprint evaluations is calculated on the frontend and stored via the API:

Total Final = (Entregadas/Asignadas) × 0.4 + (Netas/Entregadas) × 0.4 + (Calidad/4) × 0.2

Migration Scripts

```bash
npm run supabase:check
```

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Run tests and linting.
5. Submit a pull request.

## License

This project is unlicensed (UNLICENSED).

## Support

For questions or support, please contact the development team.

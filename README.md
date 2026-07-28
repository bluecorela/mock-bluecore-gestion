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
- **Migration Utilities**: Scripts para exportar Firestore y preparar/importar datos hacia Supabase.

## Prerequisites

- Node.js (version 18 or higher)
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
```
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

- **Teams (/equipos)**
- **Personnel (/personal)**
- **Performance (/performance)**
- **One to One (/oto)**
- **Rotation (/rotacion)**
- **Rotation History (/rotacion-historial)**
- **Sidebar Modules (/modulos-sidebar)**
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
├── firebase/
│   └── firebase.client.ts     # Legacy Firebase client kept for migration reference
├── equipos/
│   ├── equipos.controller.ts  # Teams & Sprints endpoints
│   ├── equipos.service.ts     # Dashboard, metrics & evaluation logic
│   ├── equipos.module.ts
│   └── dto/
├── personal/
│   ├── personal.controller.ts # Personnel endpoints
│   ├── personal.service.ts
│   ├── personal.module.ts
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
├── operaciones/
│   └── operaciones.service.ts # Centralized performance calculations
├── rotacion/
│   ├── rotacion.controller.ts
│   ├── rotacion.service.ts
│   └── rotacion.module.ts
├── rotacion-historial/
│   ├── rotacion-historial.controller.ts
│   ├── rotacion-historial.service.ts
│   └── rotacion-historial.module.ts
├── modulos-sidebar/
│   ├── modulos-sidebar.controller.ts
│   ├── modulos-sidebar.service.ts
│   └── modulos-sidebar.module.ts
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
npm run firebase:export
npm run supabase:prepare
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

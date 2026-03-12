# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev       # Watch mode (hot reload)
npm run start:debug     # Debug + watch mode

# Build & Production
npm run build           # Compile TypeScript via nest build
npm run start:prod      # Run compiled output from dist/

# Testing
npm run test            # Run all unit tests
npm run test:watch      # Watch mode
npm run test:cov        # With coverage
npm run test:e2e        # End-to-end tests
jest src/path/to/file.spec.ts   # Run a single test file

# Code Quality
npm run lint            # ESLint with auto-fix
npm run format          # Prettier format
```

## Architecture

NestJS backend API serving an Angular frontend (localhost:4200). All routes are prefixed with `/api`. Swagger docs available at `/api/docs`.

### Firebase Integration

The central `FirebaseClient` (`src/firebase/firebase.client.ts`) is the sole Firestore interface. It authenticates using email/password credentials from env vars (`FIREBASE_EMAIL`, `FIREBASE_PASSWORD`) and calls `await this.login()` at the start of every data method. All modules inject `FirebaseClient` from `FirebaseClientModule`.

**Required `.env` variables:**
```
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_APP_ID
FIREBASE_EMAIL
FIREBASE_PASSWORD
PORT  # defaults to 3000
```

### Firestore Data Model

```
personal/                         # Team members (correo, rol, equipo ref, vacaciones)
equipos/                          # Teams
  {equipoId}/sprints/             # Sprints per team
    {sprintId}/Integrantes/       # Sprint evaluations per member
  {equipoId}/evaluaciones/
    perfomance/performance-{n}/   # Performance evaluations (note: typo "perfomance")
    one-to-one/oto-{n}/          # One-to-one evaluations
historialRotaciones/              # Rotation history log
modulosSidebar/                   # Sidebar modules with rolesPermitidos[]
config_evaluaciones/
  performance                     # Performance eval questions config
  one-to-one                      # OTO eval questions config
habilitaciones_desempeno/         # Performance enablement tracking per team
settings/maintenance              # Maintenance mode flag
```

### Module Overview

| Module | Route prefix | Purpose |
|--------|-------------|---------|
| `personal` | `/api/personal` | CRUD for team members |
| `equipos` | `/api/equipos` | CRUD for teams, sprint status |
| `rotacion-historial` | `/api/historial-rotaciones` | Rotation history |
| `rotacion` | `/api/rotacion` | Rotation operations |
| `operaciones` | `/api/operaciones` | Pure calculation logic (no Firestore) for sprint performance metrics |
| `administracion-datos` | `/api/administracion-datos` | Sprint evaluation saving |
| `oto` | `/api/oto` | One-to-one evaluations |
| `performance` | `/api/performance` | Performance evaluations and enablement |
| `modulos-sidebar` | `/api/modulos-sidebar` | Sidebar navigation by role |
| `maintenance` | `/api/maintenance` | Maintenance mode status |

### Key Business Rules

- Sprint IDs follow the pattern `sprint-{number}` (e.g., `sprint-1`, `sprint-12`)
- Sprints auto-close (`sprint_cerrado: true`) when all eligible members are evaluated
- Members excluded from sprint evaluation: `rol === 'arquitecto'`, `vacaciones === true`
- Members with `inicioReemplazoSprintId` are only eligible starting from that sprint number
- Equipo IDs are generated as slugs: normalized, lowercased, spaces replaced with `-`
- CORS is restricted to `http://localhost:4200` only
- `ValidationPipe` is global with `whitelist: true` and `forbidNonWhitelisted: true`

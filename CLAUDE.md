# mock-bluecore-gestion — API

API del portal interno de Bluecore: organización, personal, equipos, sprints e
historias de usuario (HU), evaluaciones, rotaciones y reportes semanales.
Persiste en Supabase/PostgreSQL y autentica con Supabase Auth.
Frontend consumidor: `../bluecore-gestion/CLAUDE.md`.

## Requisitos y comandos

Usar **Node 22 con nvm** (`.nvmrc`). Los scripts disponibles están en `package.json`.

```bash
nvm use
npm install
npm run start              # desarrollo
npm run start:dev          # desarrollo con watch, sin preparar ni sembrar base
npm run start:debug        # debug y watch
npm run start:test         # API con entorno test
npm run build             # Nest → dist/
npm run start:prod         # NODE_ENV=production node dist/main
npm run lint              # ESLint con --fix: modifica archivos
npm run format            # Prettier sobre src/ y test/
npm test
npm run test:watch
npm run test:cov
npm run test:debug
npm run test:e2e
npm run supabase:check
npm run supabase:migrations:status
npm run supabase:migrations:apply
npm run supabase:v2:migrate # utilidad histórica de migración, revisar antes de usar
```

## Stack y arranque

- NestJS 11 sobre Express, TypeScript 5, RxJS 7; Supabase JS 2 y PostgreSQL.
- SDK de Model Context Protocol, Zod; class-validator y class-transformer.
- Swagger/OpenAPI, Helmet, throttler; Jest 30, ts-jest y Supertest.
- Configuración: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`.

`src/main.ts` configura prefijo `/api`, CORS, Helmet, identificador de petición,
validación global y Swagger en `/api/docs` cuando está habilitado. CORS admite
GET/POST/PATCH/PUT/DELETE/OPTIONS. La validación transforma DTOs, elimina campos
fuera de whitelist y rechaza propiedades no declaradas.
`/mcp` y las rutas de descubrimiento `.well-known/oauth-protected-resource`
quedan fuera del prefijo. `src/config/body-parser.ts` configura límites de cuerpos.
`src/app.module.ts` registra guardias globales de throttling y acceso al portal,
y `src/observability/request-logging.interceptor.ts` registra las peticiones.

## Módulos y estructura

Los módulos se registran en `src/app.module.ts`; los controllers definen rutas y
permisos, los services orquestan reglas y los repositorios encapsulan consultas.

| Directorio en src/ | Responsabilidad |
| --- | --- |
| `auth/` | Sesiones, usuarios Auth, contraseña, roles y guards |
| `user-admin/` | Altas, cambios de rol, movimientos y designación de líderes con vista previa |
| `supabase/` | Clientes, fachada de datos y repositorios de directorio/navegación |
| `organization/` | Clientes, proyectos, membresías, líderes y acceso a equipos |
| `sprints/` | Ciclo de sprint, HU, iniciativas, métricas, mappers y repositorios |
| `sprints/load/` | Planificación, confirmación de cargas y actualización de HU por código |
| `weekly-dashboard/` | Contexto, reportes semanales y repositorio |
| `teams/`, `personnel/` | API compatible de equipos, evaluaciones y personal |
| `rotation/`, `rotation-history/` | Vacaciones, reemplazos, movimientos e historial |
| `performance/`, `oto/` | Evaluaciones de desempeño y One to One |
| `operations/` | Cálculos de rendimiento |
| `sidebar-modules/`, `maintenance/` | Navegación por rol y estado de mantenimiento |
| `health/`, `observability/` | Salud y registro de peticiones |
| `mcp/` | Transporte HTTP, autenticación, herramientas y vistas previas |

Se conservan rutas como `/api/equipos`, `/api/personal`, `/api/rotacion` y
`/api/rotacion-historial`. Las rutas operativas nuevas usan `/api/v2`, incluidos
`/api/v2/teams/:teamId/sprints` y `/api/v2/admin`.
Revisar los controllers al cambiar contratos y coordinar los consumidores del front.

## Autenticación y permisos

- `src/auth/auth.service.ts` inicia sesión con Supabase Auth y valida el Bearer
  mediante `auth.getUser`; carga identidad, empleado y rol desde los datos del portal.
- `src/auth/portal-access.guard.ts` protege globalmente las rutas, salvo las
  marcadas públicas. Acceso al portal: Admin, Arquitecto y Scrum Master.
  `AnyAuthenticatedRole` permite excepciones para usuarios autenticados de otros roles.
- `src/auth/auth.constants.ts` define también Ingeniero de Software e Ingeniero
  de QA; los códigos históricos WELLBEING_CREATOR e INTERN no son roles asignables.
- `AuthGuard`, `RolesGuard`, `AdminGuard` y los decoradores de `src/auth/`
  completan la autorización por endpoint. No basta con ocultar opciones del menú.
- `src/organization/services/organization.service.ts` comprueba acceso y liderazgo
  vigente mediante `assertTeamAccess` y `assertTeamLeader`; Admin tiene excepción.
  La designación del líder se consulta en base, no se deduce de claims de equipos.
- En `src/sprints/controllers/sprints.controller.ts`, crear, iniciar, completar
  y eliminar exigen Admin o Arquitecto designado; editar permite también al SM
  designado. Las lecturas comprueban acceso al equipo.
- `src/user-admin/user-admin.controller.ts` exige Admin y ofrece preview/aplicación
  para altas, rol, movimiento y designación de líderes.
- MCP usa guards propios (`src/mcp/mcp-auth.guard.ts`, `mcp-throttler.guard.ts`),
  OAuth de Supabase y límite por usuario. Los tokens de clientes OAuth se restringen
  a MCP; las llamadas internas confiables pasan por `src/auth/internal-call.service.ts`.
  Las herramientas viven en `src/mcp/tools/`; las de usuarios se registran para Admin.

## Acceso a datos y reglas de sprint

`src/supabase/supabase.client.ts` crea un cliente privilegiado para backend:
`getV2Client()` selecciona el esquema normalizado `bluecore_v2`; `getClient()`
se usa para Auth y `getPublicClient()` para flujos con clave anónima.
Nunca enviar la service-role key al navegador.

`src/supabase/supabase-data.service.ts` es la fachada compartida de datos.
Los repositorios de `organization/`, `sprints/`, `weekly-dashboard/`, `user-admin/`
y `src/supabase/repositories/` realizan consultas y llamadas RPC. Mantener las
operaciones atómicas en las RPC, sin sustituirlas por escrituras parciales desde HTTP.

- El ciclo operativo usa estados `planned`, `in_progress`, `completed` y RPC
  como `start_sprint` y `complete_sprint` (repositorio de sprints).
- Completar mueve las HU pendientes al siguiente sprint; los códigos HU son
  únicos globalmente tras normalización (restricción en base).
- Eliminar exige sprint planificado sin HU ni dependencias; reserva su numeración
  para evitar reutilizarla.
- Los errores estables se definen en `src/sprints/sprint-error-codes.ts`:
  preservan `code`, estado HTTP y mensaje; traducen errores RPC P0001 por `details`.
  `src/sprints/sprint-error-message.ts` cubre mensajes heredados. Mantener el contrato
  al cambiar los mensajes de las RPC.
- Cargas de HU y actualizaciones por código tienen preview y confirmación;
  `src/sprints/load/load-confirmation.service.ts` firma operación, usuario, destino
  y contenido con HMAC-SHA256, con vencimiento de diez minutos. Revalidar al aplicar;
  la base registra el consumo para impedir reutilización.

## Migraciones

El aplicador `scripts/apply-database-migrations.js` requiere conexión PostgreSQL
por `SUPABASE_DB_URL`; no es la URL HTTP de Supabase. Ejecutar primero status,
revisar pendientes y luego apply contra el destino elegido.

- Lee `scripts/migrations/` por nombre ordenado y registra SHA-256 en
  `bluecore_v2.schema_migrations` con advisory lock.
- Rechaza checksums cambiados: **no editar migraciones aplicadas**; agregar otra.
- El runner lee `.env` y `.env.<NODE_ENV>`; no carga los `.local` como la API.
- `scripts/check-supabase-connection.js` verifica conexión, conteos, contrato RPC
  e invariantes.
- Los SQL históricos de creación/importación no bastan para reproducir una base actual.

## Variables de entorno

Nombres de las plantillas `.env.example`, `.env.development.example`,
`.env.test.example` y `.env.production.example`, más `SUPABASE_DB_URL` del aplicador:

```text
NODE_ENV PORT API_PORT CORS_ORIGINS SWAGGER_ENABLED
SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY SUPABASE_V2_SCHEMA
AUTH_EMAIL_PROVIDER FRONTEND_URL PUBLIC_API_URL LOAD_CONFIRMATION_SECRET
SUPABASE_DB_URL
```

`src/config/environment.ts` valida la configuración. Precedencia API: entorno del
proceso, `.env.<NODE_ENV>.local`, `.env.<NODE_ENV>`, `.env`.
En producción exige configuración de CORS, front, URL pública y secreto de
confirmación; este último debe tener al menos 32 caracteres y compartirse entre
instancias. Fuera de producción, si falta, se genera uno temporal por instancia.

## Convenciones, tests y precauciones

- Dominio en español; archivos kebab-case, clases PascalCase y sufijos Nest.
  DTOs con class-validator y metadatos Swagger; imports relativos.
- `tsconfig.json`: NodeNext, ES2023, strictNullChecks, noImplicitAny desactivado.
  `.prettierrc`: comillas simples y coma final.
- Specs unitarios en `src/**/*.spec.ts`: servicios, guards, DTOs, mappers,
  repositorios y MCP; simular dependencias mediante inyección de Nest.
- `test/app.e2e-spec.ts` instancia AppModule y prueba `/` sin el bootstrap de
  `main.ts`; no equivale a probar prefijo, CORS y validación del servidor real.
- No usar credenciales de producción en desarrollo o tests. No ejecutar seeds,
  importaciones históricas, limpiezas ni migraciones remotas sin revisar destino,
  respaldo y autorización. Ensayar primero sobre una copia local desechable.

# Mock Bluecore Gestion

A NestJS-based backend API for managing teams, personnel, and rotation history, integrated with Firebase for data storage and authentication.

## Features

- **Authentication**: Secure user authentication module.
- **Teams Management**: CRUD operations for managing teams (equipos).
- **Personnel Management**: Manage personnel data and assignments.
- **Rotation History**: Track and manage historical rotations.
- **Firebase Integration**: Uses Firebase for database and client services.

## Prerequisites

- Node.js (version 18 or higher)
- npm or yarn
- Firebase project setup (for Firebase integration)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd mock_bluecore_gestion
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and configure your Firebase credentials and other necessary variables.

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

- `/auth` - Authentication routes
- `/equipos` - Teams management
- `/personal` - Personnel management
- `/historial-rotaciones` - Rotation history

For detailed API documentation, refer to the Swagger/OpenAPI specs if available, or check the controller files in the `src/` directory.

## Project Structure

```
src/
├── app.controller.ts
├── app.module.ts
├── app.service.ts
├── auth/
├── equipos/
├── firebase/
├── historial-rotaciones/
├── interfaces/
├── main.ts
└── personal/
test/
├── app.e2e-spec.ts
└── jest-e2e.json
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

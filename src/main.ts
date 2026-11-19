import { NestExpressApplication } from '@nestjs/platform-express';
import { configureBodyParsers } from './config/body-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  app.enableShutdownHooks();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = request.header('x-request-id') || randomUUID();
    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  });

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'mcp', method: RequestMethod.ALL },
      {
        path: '.well-known/oauth-protected-resource',
        method: RequestMethod.ALL,
      },
      {
        path: '.well-known/oauth-protected-resource/mcp',
        method: RequestMethod.ALL,
      },
    ],
  });

  const configuredOrigins = configService
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = configuredOrigins?.length
    ? configuredOrigins
    : ['http://localhost:4200', 'https://bluecore-portal-gestion-prod.web.app'];

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'MCP-Protocol-Version',
      'MCP-Session-Id',
    ],
    exposedHeaders: ['WWW-Authenticate', 'Retry-After', 'MCP-Session-Id'],
    credentials: true,
  });
  configureBodyParsers(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const config = new DocumentBuilder()
    .setTitle('APIs de Portal de Gestión')
    .setDescription('Documentación de los endpoints')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access token de una sesión autenticada en Supabase',
    })
    .build();

  if (configService.get<string>('SWAGGER_ENABLED') !== 'false') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();

import { NestExpressApplication } from '@nestjs/platform-express';
import { configureBodyParsers } from './config/body-parser';
import { buildCorsOptions } from './config/cors';
import { NestFactory } from '@nestjs/core';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { trustProxyHops } from './config/environment';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function configureApplication(app: NestExpressApplication): void {
  const configService = app.get(ConfigService);
  const hops = trustProxyHops(configService);
  if (hops > 0) app.set('trust proxy', hops);
  const logForwardedFor =
    configService.get<string>('LOG_FORWARDED_FOR') === 'true';
  const logger = new Logger('HTTP');

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = request.header('x-request-id') || randomUUID();
    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);
    // shortcut: log temporal para fijar TRUST_PROXY, borrar tras el release
    if (logForwardedFor) {
      logger.log(
        JSON.stringify({
          requestId,
          path: request.path,
          xForwardedFor: request.header('x-forwarded-for') ?? null,
          ip: request.ip,
          socketIp: request.socket.remoteAddress,
        }),
      );
    }
    next();
  });

  app.setGlobalPrefix('api', {
    exclude: [
      '/',
      'health',
      'api',
      'api/health',
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

  app.enableCors(buildCorsOptions(allowedOrigins));
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
}

async function bootstrap() {
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  configureApplication(app);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
}
if (require.main === module) void bootstrap();

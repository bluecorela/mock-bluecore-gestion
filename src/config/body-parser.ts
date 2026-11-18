import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

export function configureBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });
  app.use(
    (
      error: { type?: string },
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      if (error.type === 'entity.too.large') {
        response.status(413).json({
          statusCode: 413,
          message: 'La carga es demasiado grande (máximo 1 MB)',
        });
        return;
      }
      next(error);
    },
  );
}

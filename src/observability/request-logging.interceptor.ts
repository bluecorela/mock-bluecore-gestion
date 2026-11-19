import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    const requestId = request.header('x-request-id');

    return next.handle().pipe(
      tap({
        next: () => this.log(request, response, requestId, startedAt),
        error: (error: unknown) =>
          this.log(
            request,
            response,
            requestId,
            startedAt,
            error instanceof HttpException ? error.getStatus() : 500,
          ),
      }),
    );
  }

  private log(
    request: Request,
    response: Response,
    requestId: string | undefined,
    startedAt: number,
    statusCode = response.statusCode,
  ) {
    this.logger.log(
      JSON.stringify({
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode,
        durationMs: Date.now() - startedAt,
      }),
    );
  }
}

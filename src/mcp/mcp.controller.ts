import {
  Controller,
  Logger,
  UnauthorizedException,
  Delete,
  Get,
  MethodNotAllowedException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Response } from 'express';
import {
  OAuthClientRoute,
  PublicRoute,
  SkipAppCheck,
} from '../auth/access.decorators';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { InternalCallService } from '../auth/internal-call.service';
import { InternalApi } from './internal-api';
import { PreviewCache } from './preview-cache';
import { createServer } from './mcp-server.factory';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpThrottlerGuard } from './mcp-throttler.guard';

@SkipAppCheck()
@PublicRoute()
@OAuthClientRoute()
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);
  constructor(
    private readonly config: ConfigService,
    private readonly internalCall: InternalCallService,
    private readonly cache: PreviewCache,
  ) {}

  @Post()
  @UseGuards(McpAuthGuard, McpThrottlerGuard)
  async handle(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    if (!request.user?.supabaseUserId?.trim()) {
      throw new UnauthorizedException('Falta la identidad del usuario');
    }
    const token = request.headers.authorization!.split(' ')[1];
    const api = new InternalApi(
      `http://127.0.0.1:${this.config.get<number>('PORT', 3000)}/api`,
      token,
      { name: this.internalCall.headerName, value: this.internalCall.secret() },
    );
    const server = createServer(api, request.user, this.cache);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const close = async () => {
      await Promise.allSettled([transport.close(), server.close()]);
    };
    response.on('close', () => {
      void close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      await close();
      if (response.headersSent) {
        this.logger.error('Error procesando la respuesta MCP', error);
        response.end();
        return;
      }
      throw error;
    }
  }

  @Get()
  getNotAllowed(): never {
    throw new MethodNotAllowedException('Método no permitido');
  }

  @Delete()
  methodNotAllowed(): never {
    throw new MethodNotAllowedException('Método no permitido');
  }
}

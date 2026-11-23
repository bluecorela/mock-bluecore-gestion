import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OAuthClientRoute,
  PublicRoute,
  SkipAppCheck,
} from '../auth/access.decorators';

@SkipAppCheck()
@PublicRoute()
@OAuthClientRoute()
@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly config: ConfigService) {}

  @Get(['oauth-protected-resource', 'oauth-protected-resource/mcp'])
  metadata() {
    return {
      resource: `${this.config.getOrThrow<string>('PUBLIC_API_URL')}/mcp`,
      authorization_servers: [
        `${this.config.getOrThrow<string>('SUPABASE_URL').replace(/\/$/, '')}/auth/v1`,
      ],
      bearer_methods_supported: ['header'],
    };
  }
}

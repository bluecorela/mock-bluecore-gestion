import { SupabaseModule } from '../supabase/supabase.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { McpController } from './mcp.controller';
import { WellKnownController } from './well-known.controller';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpThrottlerGuard } from './mcp-throttler.guard';
import { PreviewCache } from './preview-cache';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [McpController, WellKnownController],
  providers: [
    McpAuthGuard,
    McpThrottlerGuard,
    { provide: PreviewCache, useFactory: () => new PreviewCache() },
  ],
})
export class McpModule {}

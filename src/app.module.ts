import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PersonnelModule } from './personnel/personnel.module';
import { TeamsModule } from './teams/teams.module';
import { RotationHistoryModule } from './rotation-history/rotation-history.module';
import { SidebarModulesModule } from './sidebar-modules/sidebar-modules.module';
import { OperationsModule } from './operations/operations.module';
import { RotationModule } from './rotation/rotation.module';
import { OtoModule } from './oto/oto.module';
import { PerformanceModule } from './performance/performance.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { PortalAccessGuard } from './auth/portal-access.guard';
import { OrganizationModule } from './organization/organization.module';
import { WeeklyDashboardModule } from './weekly-dashboard/weekly-dashboard.module';
import { SprintsModule } from './sprints/sprints.module';
import {
  environmentFilePaths,
  validateEnvironment,
} from './config/environment';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './auth/app-throttler.guard';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor';
import { McpModule } from './mcp/mcp.module';
import { UserAdminModule } from './user-admin/user-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: environmentFilePaths(),
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PersonnelModule,
    TeamsModule,
    RotationHistoryModule,
    SidebarModulesModule,
    OperationsModule,
    RotationModule,
    OtoModule,
    PerformanceModule,
    MaintenanceModule,
    SupabaseModule,
    AuthModule,
    OrganizationModule,
    WeeklyDashboardModule,
    SprintsModule,
    HealthModule,
    ConditionalModule.registerWhen(
      McpModule,
      (env) => env.MCP_ENABLED === 'true',
    ),
    UserAdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PortalAccessGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule {}

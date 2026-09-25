import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { OrganizationModule } from './organization/organization.module';
import { WeeklyDashboardModule } from './weekly-dashboard/weekly-dashboard.module';
import { SprintsModule } from './sprints/sprints.module';
import {
  environmentFilePaths,
  validateEnvironment,
} from './config/environment';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor';

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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule {}

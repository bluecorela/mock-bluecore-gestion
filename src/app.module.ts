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
import { OrganizationV2Module } from './v2/organization/organization-v2.module';
import { WeeklyDashboardV2Module } from './v2/weekly-dashboard/weekly-dashboard-v2.module';
import { environmentFilePaths, validateEnvironment } from './config/environment';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: environmentFilePaths(),
      validate: validateEnvironment,
    }),
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
    OrganizationV2Module,
    WeeklyDashboardV2Module,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

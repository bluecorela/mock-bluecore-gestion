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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

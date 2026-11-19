import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { WeeklyDashboardController } from './controllers/weekly-dashboard.controller';
import { WeeklyDashboardRepository } from './repositories/weekly-dashboard.repository';
import { WeeklyDashboardService } from './services/weekly-dashboard.service';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [SupabaseModule, AuthModule, OrganizationModule],
  controllers: [WeeklyDashboardController],
  providers: [WeeklyDashboardRepository, WeeklyDashboardService],
  exports: [WeeklyDashboardService],
})
export class WeeklyDashboardModule {}

import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../supabase/supabase.module';
import { WeeklyDashboardV2Controller } from './weekly-dashboard-v2.controller';
import { WeeklyDashboardV2Repository } from './weekly-dashboard-v2.repository';
import { WeeklyDashboardV2Service } from './weekly-dashboard-v2.service';
import { AuthModule } from '../../auth/auth.module';
import { OrganizationV2Module } from '../organization/organization-v2.module';

@Module({
  imports: [SupabaseModule, AuthModule, OrganizationV2Module],
  controllers: [WeeklyDashboardV2Controller],
  providers: [WeeklyDashboardV2Repository, WeeklyDashboardV2Service],
  exports: [WeeklyDashboardV2Service],
})
export class WeeklyDashboardV2Module {}

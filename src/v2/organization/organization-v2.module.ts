import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../supabase/supabase.module';
import { OrganizationV2Repository } from './organization-v2.repository';
import { OrganizationV2Controller } from './organization-v2.controller';
import { OrganizationV2Service } from './organization-v2.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [OrganizationV2Controller],
  providers: [OrganizationV2Repository, OrganizationV2Service],
  exports: [OrganizationV2Repository, OrganizationV2Service],
})
export class OrganizationV2Module {}

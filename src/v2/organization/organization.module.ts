import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../supabase/supabase.module';
import { OrganizationRepository } from './organization.repository';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [OrganizationController],
  providers: [OrganizationRepository, OrganizationService],
  exports: [OrganizationRepository, OrganizationService],
})
export class OrganizationModule {}

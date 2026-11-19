import { OrganizationRepository } from '../organization/repositories/organization.repository';
import { Module } from '@nestjs/common';
import { SupabaseClient } from './supabase.client';
import { SupabaseDataService } from './supabase-data.service';
import { TeamDirectoryRepository } from './repositories/team-directory.repository';
import { NavigationRepository } from './repositories/navigation.repository';

@Module({
  providers: [
    SupabaseClient,
    OrganizationRepository,
    TeamDirectoryRepository,
    NavigationRepository,
    SupabaseDataService,
  ],
  exports: [SupabaseClient, SupabaseDataService, OrganizationRepository],
})
export class SupabaseModule {}

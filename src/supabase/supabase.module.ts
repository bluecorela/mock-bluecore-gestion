import { Module } from '@nestjs/common';
import { SupabaseClient } from './supabase.client';
import { SupabaseDataService } from './supabase-data.service';

@Module({
  providers: [SupabaseClient, SupabaseDataService],
  exports: [SupabaseClient, SupabaseDataService],
})
export class SupabaseModule {}

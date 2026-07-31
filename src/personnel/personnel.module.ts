import { Module } from '@nestjs/common';
import { PersonnelService } from './personnel.service';
import { PersonnelController } from './personnel.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [PersonnelController],
  providers: [PersonnelService],
})
export class PersonnelModule { }

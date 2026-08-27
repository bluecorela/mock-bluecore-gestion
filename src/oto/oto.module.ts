import { Module } from '@nestjs/common';
import { OtoService } from './oto.service';
import { OtoController } from './oto.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [OtoController],
  providers: [OtoService],
})
export class OtoModule {}

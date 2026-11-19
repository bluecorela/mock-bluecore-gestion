import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthController } from './auth.controller';
import { AdminGuard } from './admin.guard';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { InternalCallService } from './internal-call.service';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    AdminGuard,
    RolesGuard,
    InternalCallService,
  ],
  exports: [
    AuthService,
    AuthGuard,
    AdminGuard,
    RolesGuard,
    InternalCallService,
  ],
})
export class AuthModule {}

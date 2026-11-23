import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthController } from './auth.controller';
import { AdminGuard } from './admin.guard';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { InternalCallService } from './internal-call.service';
import { AppCheckVerifier } from './app-check-verifier.service';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    AdminGuard,
    RolesGuard,
    InternalCallService,
    AppCheckVerifier,
  ],
  exports: [
    AuthService,
    AuthGuard,
    AdminGuard,
    RolesGuard,
    InternalCallService,
    AppCheckVerifier,
  ],
})
export class AuthModule {}

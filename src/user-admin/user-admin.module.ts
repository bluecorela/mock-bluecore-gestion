import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { RotationModule } from '../rotation/rotation.module';
import { SprintsModule } from '../sprints/sprints.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { UserAdminController } from './user-admin.controller';
import { UserAdminRepository } from './user-admin.repository';
import { UserAdminService } from './user-admin.service';

@Module({
  imports: [
    AuthModule,
    OrganizationModule,
    RotationModule,
    SprintsModule,
    SupabaseModule,
  ],
  controllers: [UserAdminController],
  providers: [UserAdminService, UserAdminRepository],
})
export class UserAdminModule {}

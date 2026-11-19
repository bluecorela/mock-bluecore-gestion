import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UserAdminModule } from './user-admin.module';
import { UserAdminService } from './user-admin.service';
import { SupabaseClient } from '../supabase/supabase.client';
import { SprintsModule } from '../sprints/sprints.module';
import { LoadConfirmationService } from '../sprints/load/load-confirmation.service';

describe('UserAdminModule', () => {
  it('resuelve el grafo sin ciclos y comparte la confirmación de SprintsModule', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ LOAD_CONFIRMATION_SECRET: 'x'.repeat(32) })],
        }),
        UserAdminModule,
      ],
    })
      .overrideProvider(SupabaseClient)
      .useValue({})
      .compile();
    expect(module.get(UserAdminService)).toBeInstanceOf(UserAdminService);
    const confirmation = module
      .select(SprintsModule)
      .get(LoadConfirmationService, { strict: true });
    expect(module.get(LoadConfirmationService)).toBe(confirmation);
    expect(module.get(UserAdminService)['confirmation']).toBe(confirmation);
    await module.close();
  });
});

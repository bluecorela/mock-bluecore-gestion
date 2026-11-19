import { ConflictException } from '@nestjs/common';
import { SupabaseClient } from '../../supabase/supabase.client';
import { SprintItemsRepository } from './sprint-items.repository';
import { SprintsRepository } from './sprints.repository';

describe('Sprint repository conflicts', () => {
  const supabaseClient = {
    getV2Client: () => ({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: {
                code: '23505',
                message: 'duplicate key value violates unique constraint',
              },
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  it('returns 409 when a sprint number conflicts', async () => {
    const repository = new SprintsRepository(supabaseClient);

    await expect(repository.create({})).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns 409 when an item code conflicts', async () => {
    const repository = new SprintItemsRepository(supabaseClient);

    await expect(
      repository.create('sprint_user_stories', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

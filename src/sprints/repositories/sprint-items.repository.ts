import { sprintExceptionFromSupabase } from '../sprint-error-codes';
import { sprintErrorMessage } from '../sprint-error-message';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '../../supabase/supabase.client';
import { mapSprintBug, mapSprintItem } from '../mappers/sprint-item.mapper';

export type SprintItemTable =
  | 'sprint_initiatives'
  | 'sprint_user_stories'
  | 'sprint_bugs'
  | 'sprint_risks';

@Injectable()
export class SprintItemsRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async nextCode(table: SprintItemTable, prefix: string): Promise<string> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('next_sprint_item_code', {
        p_table: table,
        p_prefix: prefix,
      });
    if (error) this.fail(`${table} code`, error);
    return String(data);
  }

  async findAll(table: SprintItemTable, sprintId: string) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from(table)
      .select(
        table === 'sprint_bugs'
          ? '*,story:sprint_user_stories!sprint_bugs_story_id_fkey(code,name)'
          : '*',
      )
      .eq('sprint_id', sprintId)
      .order('created_at');
    if (error) this.fail(table, error);
    return (data ?? []).map((row) =>
      table === 'sprint_bugs' ? mapSprintBug(row) : mapSprintItem(row),
    );
  }

  async countBySprint(table: SprintItemTable, sprintId: string) {
    const { count, error } = await this.supabaseClient
      .getV2Client()
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('sprint_id', sprintId);
    if (error) this.fail(table, error);
    return count ?? 0;
  }

  async create(table: SprintItemTable, input: Record<string, unknown>) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from(table)
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail(table, error);
    return mapSprintItem(data);
  }

  async createInitiative(
    teamId: string,
    sprintId: string,
    input: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('create_sprint_initiative', {
        p_team_id: teamId,
        p_sprint_id: sprintId,
        p_payload: input,
      });
    if (error) this.fail('sprint initiative', error);
    return mapSprintItem(data);
  }

  async updateInitiative(
    teamId: string,
    sprintId: string,
    itemId: string,
    input: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('update_sprint_initiative', {
        p_team_id: teamId,
        p_sprint_id: sprintId,
        p_item_id: itemId,
        p_payload: input,
      });
    if (error) this.fail('sprint initiative', error);
    return data ? mapSprintItem(data) : null;
  }

  async update(
    table: SprintItemTable,
    sprintId: string,
    itemId: string,
    input: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from(table)
      .update(input)
      .eq('id', itemId)
      .eq('sprint_id', sprintId)
      .select('*')
      .maybeSingle();
    if (error) this.fail(table, error);
    return data ? mapSprintItem(data) : null;
  }

  async remove(table: SprintItemTable, sprintId: string, itemId: string) {
    const { error, count } = await this.supabaseClient
      .getV2Client()
      .from(table)
      .delete({ count: 'exact' })
      .eq('id', itemId)
      .eq('sprint_id', sprintId);
    if (error?.code === '23503' && table === 'sprint_user_stories') {
      throw new BadRequestException(
        'No se puede eliminar la HU porque tiene bugs asociados',
      );
    }
    if (error) this.fail(table, error);
    return count === 1;
  }

  async moveStory(
    teamId: string,
    sourceSprintId: string,
    storyId: string,
    targetSprintId: string,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('move_sprint_story', {
        p_team_id: teamId,
        p_source_sprint_id: sourceSprintId,
        p_story_id: storyId,
        p_target_sprint_id: targetSprintId,
      });
    if (error) this.fail('sprint user story', error);
    if (!data) return null;
    return mapSprintItem(data);
  }

  private fail(
    resource: string,
    error: { code?: string; details?: string; message?: string },
  ): never {
    const codedError = sprintExceptionFromSupabase(error);
    if (codedError) throw codedError;
    // Respaldo eliminable cuando la nube tenga la migración 20261118.
    if (error.code === '23505') {
      throw new ConflictException(
        ['sprint_user_stories', 'sprint user story'].includes(resource)
          ? 'El código de la HU ya existe en otro sprint; vuelve a intentarlo'
          : `Conflict while saving ${resource}`,
      );
    }
    if (['23503', '23514', 'P0001'].includes(error.code ?? '')) {
      throw new BadRequestException(sprintErrorMessage(error.message));
    }
    throw new InternalServerErrorException(
      `Could not access ${resource}: ${sprintErrorMessage(error.message) || 'unknown error'}`,
    );
  }
}

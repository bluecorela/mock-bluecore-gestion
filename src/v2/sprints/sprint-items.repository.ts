import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '../../supabase/supabase.client';

export interface SprintItemRecord extends Record<string, unknown> {
  id?: string;
  code?: string;
  name?: string;
  description?: string | null;
  status?: string;
  storyPoints?: number;
  estimatedWorkDays?: number | null;
  assignedEmployeeId?: string | null;
}

@Injectable()
export class SprintItemsRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async findAll(table: string, sprintId: string) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from(table)
      .select('*')
      .eq('sprint_id', sprintId)
      .order('created_at');
    if (error) this.fail(table, error);
    return (data ?? []).map((row) => this.mapRow(row));
  }

  async countBySprint(table: string, sprintId: string) {
    const { count, error } = await this.supabaseClient
      .getV2Client()
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('sprint_id', sprintId);
    if (error) this.fail(table, error);
    return count ?? 0;
  }

  async create(table: string, input: Record<string, unknown>) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from(table)
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail(table, error);
    return this.mapRow(data);
  }

  async update(
    table: string,
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
    return data ? this.mapRow(data) : null;
  }

  async remove(table: string, sprintId: string, itemId: string) {
    const { error, count } = await this.supabaseClient
      .getV2Client()
      .from(table)
      .delete({ count: 'exact' })
      .eq('id', itemId)
      .eq('sprint_id', sprintId);
    if (error) this.fail(table, error);
    return count === 1;
  }

  async moveStory(
    sourceSprintId: string,
    storyId: string,
    targetSprintId: string,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprint_user_stories')
      .update({
        sprint_id: targetSprintId,
        carried_from_sprint_id: sourceSprintId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', storyId)
      .eq('sprint_id', sourceSprintId)
      .select('*')
      .maybeSingle();
    if (error) this.fail('sprint user story', error);
    if (!data) return null;
    const { error: transferError } = await this.supabaseClient
      .getV2Client()
      .from('sprint_user_story_transfers')
      .insert({
        story_id: storyId,
        source_sprint_id: sourceSprintId,
        target_sprint_id: targetSprintId,
      });
    if (transferError) this.fail('sprint user story transfer', transferError);
    return this.mapRow(data);
  }

  async copyPendingStoriesToSprint(
    sourceSprintId: string,
    targetSprintId: string,
  ) {
    const sourceStories = await this.findAll(
      'sprint_user_stories',
      sourceSprintId,
    );
    const targetStories = await this.findAll(
      'sprint_user_stories',
      targetSprintId,
    );
    const targetCodes = new Set(targetStories.map((story) => story.code));
    const pendingStories = sourceStories.filter(
      (story) =>
        typeof story.status === 'string' &&
        ['planned', 'in_progress', 'blocked'].includes(story.status) &&
        !targetCodes.has(story.code),
    );
    if (!pendingStories.length) return [];

    const now = new Date().toISOString();
    const rows = pendingStories.map((story) => ({
      sprint_id: targetSprintId,
      code: story.code,
      name: story.name,
      description: story.description ?? null,
      status: story.status,
      story_points: story.storyPoints,
      estimated_work_days: story.estimatedWorkDays ?? null,
      assigned_employee_id: story.assignedEmployeeId ?? null,
      carried_from_sprint_id: sourceSprintId,
      carried_from_story_id: story.id,
      created_at: now,
      updated_at: now,
    }));
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprint_user_stories')
      .insert(rows)
      .select('*');
    if (error) this.fail('carried-over user stories', error);

    const copies = data ?? [];
    const { error: transferError } = await this.supabaseClient
      .getV2Client()
      .from('sprint_user_story_transfers')
      .insert(
        copies.map((story) => ({
          story_id: story.id,
          source_sprint_id: sourceSprintId,
          target_sprint_id: targetSprintId,
        })),
      );
    if (transferError) this.fail('sprint user story transfer', transferError);
    return copies.map((story) => this.mapRow(story));
  }

  private mapRow(row: unknown): SprintItemRecord {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new InternalServerErrorException(
        'Could not map an invalid sprint item',
      );
    }

    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row))
      values[key.replace(/_([a-z])/g, (_, char) => char.toUpperCase())] = value;
    return values;
  }

  private fail(resource: string, error: { message?: string }): never {
    throw new InternalServerErrorException(
      `Could not access ${resource}: ${error.message || 'unknown error'}`,
    );
  }
}

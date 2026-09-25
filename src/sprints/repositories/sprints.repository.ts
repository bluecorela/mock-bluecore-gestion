import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '../../supabase/supabase.client';
import {
  mapDashboard,
  mapSprint,
  mapTeamInitiative,
} from '../mappers/sprint.mapper';
import type { SprintStatus } from '../interfaces/sprint.interface';

@Injectable()
export class SprintsRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async findByTeam(teamId: string, status?: SprintStatus) {
    const resolvedTeamId = await this.resolveTeamId(teamId);
    if (!resolvedTeamId) return [];
    let query = this.supabaseClient
      .getV2Client()
      .from('sprints')
      .select('*')
      .eq('team_id', resolvedTeamId)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) this.fail('sprints', error);
    return (data ?? []).map((row) => mapSprint(row));
  }

  async findById(teamId: string, sprintId: string) {
    const resolvedTeamId = await this.resolveTeamId(teamId);
    if (!resolvedTeamId) return null;
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprints')
      .select('*')
      .eq('id', sprintId)
      .eq('team_id', resolvedTeamId)
      .maybeSingle();
    if (error) this.fail('sprint', error);
    return data ? mapSprint(data) : null;
  }

  /** Initiatives are team-level records and may remain active across sprints. */
  async findActiveInitiatives(teamId: string) {
    const resolvedTeamId = await this.resolveTeamId(teamId);
    if (!resolvedTeamId) return [];
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('team_initiatives')
      .select('*')
      .eq('team_id', resolvedTeamId)
      .not('status', 'in', '(completed,cancelled)')
      .order('created_at', { ascending: false });
    if (error) this.fail('team initiatives', error);
    return (data ?? []).map((row) => mapTeamInitiative(row));
  }

  /** Returns long-lived team initiatives whose execution window overlaps a period. */
  async findInitiativesForPeriod(
    teamId: string,
    startDate: string,
    endDate: string,
  ) {
    const resolvedTeamId = await this.resolveTeamId(teamId);
    if (!resolvedTeamId) return [];
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('team_initiatives')
      .select('*')
      .eq('team_id', resolvedTeamId)
      .lte('start_date', endDate)
      .order('start_date', { ascending: true });
    if (error) this.fail('team initiatives', error);
    return (data ?? [])
      .filter((row) => {
        const effectiveEnd = row.actual_end_date ?? row.planned_end_date;
        return effectiveEnd === null || String(effectiveEnd) >= startDate;
      })
      .map((row) => mapTeamInitiative(row));
  }

  async updateTeamInitiative(
    teamId: string,
    initiativeId: string,
    input: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('update_team_initiative', {
        p_team_id: teamId,
        p_initiative_id: initiativeId,
        p_payload: input,
      });
    if (error) this.fail('team initiative', error);
    return data ? mapTeamInitiative(data) : null;
  }

  async findDashboard(teamId: string, sprintId: string) {
    const resolvedTeamId = await this.resolveTeamId(teamId);
    if (!resolvedTeamId) return null;
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprint_dashboard')
      .select('*')
      .eq('team_id', resolvedTeamId)
      .eq('sprint_id', sprintId)
      .maybeSingle();
    if (error) this.fail('sprint dashboard', error);
    return data ? mapDashboard(data) : null;
  }

  async nextSprintNumber(teamId: string) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('next_sprint_number', { p_team_id: teamId });
    if (error) this.fail('sprint number', error);
    return Number(data);
  }

  async hasInProgressSprint(teamId: string, exceptId?: string) {
    let query = this.supabaseClient
      .getV2Client()
      .from('sprints')
      .select('id')
      .eq('team_id', teamId)
      .eq('status', 'in_progress');
    if (exceptId) query = query.neq('id', exceptId);
    const { data, error } = await query.limit(1);
    if (error) this.fail('active sprint', error);
    return Boolean(data?.length);
  }

  async hasPreviousUnclosedSprint(teamId: string, sprintNumber: number) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprints')
      .select('id')
      .eq('team_id', teamId)
      .lt('sprint_number', sprintNumber)
      .in('status', ['planned', 'in_progress'])
      .limit(1);
    if (error) this.fail('previous sprint', error);
    return Boolean(data?.length);
  }

  async create(input: Record<string, unknown>) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprints')
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail('sprint', error);
    return mapSprint(data);
  }

  async createWithStories(
    teamId: string,
    input: Record<string, unknown>,
    userStoryCount: number,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('create_sprint_with_stories', {
        p_team_id: teamId,
        p_payload: input,
        p_story_count: userStoryCount,
      });
    if (error) this.fail('sprint', error);
    return mapSprint(data);
  }

  async update(
    teamId: string,
    sprintId: string,
    input: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprints')
      .update(input)
      .eq('id', sprintId)
      .eq('team_id', teamId)
      .select('*')
      .maybeSingle();
    if (error) this.fail('sprint', error);
    return data ? mapSprint(data) : null;
  }

  async completeTransactional(teamId: string, sprintId: string) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('complete_sprint', {
        p_team_id: teamId,
        p_sprint_id: sprintId,
      });
    if (error) this.fail('sprint completion', error);
    return data ? mapSprint(data) : null;
  }

  private fail(
    resource: string,
    error: { code?: string; message?: string },
  ): never {
    if (error.code === '23505') {
      throw new ConflictException(`Conflict while saving ${resource}`);
    }
    if (['23503', '23514', 'P0001'].includes(error.code ?? '')) {
      throw new BadRequestException(error.message);
    }
    throw new InternalServerErrorException(
      `Could not access ${resource}: ${error.message || 'unknown error'}`,
    );
  }

  private async resolveTeamId(teamId: string): Promise<string | null> {
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        teamId,
      )
    ) {
      return teamId;
    }
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('teams')
      .select('id')
      .ilike('code', teamId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) this.fail('team', error);
    return data?.id ?? null;
  }
}

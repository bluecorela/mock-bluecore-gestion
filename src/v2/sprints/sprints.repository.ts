import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '../../supabase/supabase.client';

export type SprintStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface Sprint {
  id: string;
  teamId: string;
  projectId: string;
  sprintNumber: number;
  name: string;
  objective: string | null;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  committedPoints: number;
  completedPoints: number;
  wipStories: number;
  scrumMasterId: string | null;
  architectId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class SprintsRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async findByTeam(teamId: string, status?: string) {
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
    return (data ?? []).map((row) => this.mapSprint(row));
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
    return data ? this.mapSprint(data) : null;
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
    return (data ?? []).map((row) => this.mapTeamInitiative(row));
  }

  async findTeamInitiative(
    teamId: string,
    projectId: string | null | undefined,
    name: string,
  ) {
    const resolvedTeamId = await this.resolveTeamId(teamId);
    if (!resolvedTeamId) return null;
    let query = this.supabaseClient
      .getV2Client()
      .from('team_initiatives')
      .select('*')
      .eq('team_id', resolvedTeamId)
      .not('status', 'in', '(completed,cancelled)')
      .ilike('name', name)
      .limit(1);
    query = projectId
      ? query.eq('project_id', projectId)
      : query.is('project_id', null);
    const { data, error } = await query.maybeSingle();
    if (error) this.fail('team initiative', error);
    return data ? this.mapTeamInitiative(data) : null;
  }

  async createTeamInitiative(input: Record<string, unknown>) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('team_initiatives')
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail('team initiative', error);
    return this.mapTeamInitiative(data);
  }

  async updateTeamInitiative(
    initiativeId: string,
    input: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('team_initiatives')
      .update(input)
      .eq('id', initiativeId)
      .select('*')
      .maybeSingle();
    if (error) this.fail('team initiative', error);
    return data ? this.mapTeamInitiative(data) : null;
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
    return data ? this.mapDashboard(data) : null;
  }

  async nextSprintNumber(teamId: string) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprints')
      .select('sprint_number')
      .eq('team_id', teamId)
      .order('sprint_number', { ascending: false })
      .limit(1);
    if (error) this.fail('sprint number', error);
    return ((data?.[0]?.sprint_number as number | undefined) ?? 0) + 1;
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

  async findNextPlannedSprint(
    teamId: string,
    projectId: string,
    sprintNumber: number,
  ) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprints')
      .select('*')
      .eq('team_id', teamId)
      .eq('project_id', projectId)
      .eq('status', 'planned')
      .gt('sprint_number', sprintNumber)
      .order('sprint_number')
      .limit(1)
      .maybeSingle();
    if (error) this.fail('next planned sprint', error);
    return data ? this.mapSprint(data) : null;
  }

  async create(input: Record<string, unknown>) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprints')
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail('sprint', error);
    return this.mapSprint(data);
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
    return data ? this.mapSprint(data) : null;
  }

  private mapSprint(row: any): Sprint {
    return {
      id: row.id,
      teamId: row.team_id,
      projectId: row.project_id,
      sprintNumber: row.sprint_number,
      name: row.name,
      objective: row.objective,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      committedPoints: row.committed_points,
      completedPoints: row.completed_points,
      wipStories: row.wip_stories,
      scrumMasterId: row.scrum_master_id,
      architectId: row.architect_id,
      closedAt: row.closed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapTeamInitiative(row: any) {
    const mapped = Object.fromEntries(
      Object.entries(row as Record<string, unknown>).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()),
        value,
      ]),
    );
    if (mapped.startDate && mapped.plannedEndDate && mapped.progressPercentage !== undefined)
      mapped.status = this.calculateInitiativeStatus(
        String(mapped.startDate),
        String(mapped.plannedEndDate),
        Number(mapped.progressPercentage ?? 0),
      );
    return mapped;
  }

  private calculateInitiativeStatus(startDate: string, endDate: string, progress: number) {
    if (progress >= 100) return 'completed';
    const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`).getTime();
    const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`).getTime();
    const today = new Date();
    const current = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    if (current > end) return 'at_risk';
    const duration = Math.max(end - start, 1);
    const elapsed = Math.min(Math.max(current - start, 0), duration);
    const expected = (elapsed / duration) * 100;
    const difference = expected - progress;
    if (difference > 15) return 'at_risk';
    if (difference > 5) return 'requires_attention';
    return 'in_progress';
  }

  private mapDashboard(row: any) {
    return {
      sprint: {
        id: row.sprint_id,
        teamId: row.team_id,
        projectId: row.project_id,
        sprintNumber: row.sprint_number,
        name: row.name,
        objective: row.objective,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
        committedPoints: row.committed_points,
        completedPoints: row.completed_points,
        wipStories: row.wip_stories,
        scrumMasterId: row.scrum_master_id,
        architectId: row.architect_id,
      },
      stories: {
        total: row.stories_total,
        completed: row.stories_completed,
        pointsTotal: row.story_points_total,
        pointsCompleted: row.story_points_completed,
      },
      bugs: {
        total: row.bugs_total,
        open: row.bugs_open,
        resolved: row.bugs_resolved,
        critical: row.bugs_critical,
        returns: row.returns_total,
        production: row.production_bugs,
      },
      risks: { active: row.risks_active, highImpact: row.risks_high_impact },
      completionPercentage: row.completion_percentage,
    };
  }

  private fail(resource: string, error: { message?: string }): never {
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

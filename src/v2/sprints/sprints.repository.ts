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
    let query = this.supabaseClient
      .getV2Client()
      .from('sprints')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) this.fail('sprints', error);
    return (data ?? []).map((row) => this.mapSprint(row));
  }

  async findById(teamId: string, sprintId: string) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprints')
      .select('*')
      .eq('id', sprintId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (error) this.fail('sprint', error);
    return data ? this.mapSprint(data) : null;
  }

  async findDashboard(teamId: string, sprintId: string) {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprint_dashboard')
      .select('*')
      .eq('team_id', teamId)
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
}

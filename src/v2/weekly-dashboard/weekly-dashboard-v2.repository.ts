import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '../../supabase/supabase.client';

@Injectable()
export class WeeklyDashboardV2Repository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async teamExists(teamId: string): Promise<boolean> {
    const { data, error } = await this.supabaseClient.getV2Client().from('teams')
      .select('id').eq('id', teamId).is('deleted_at', null).maybeSingle();
    if (error) this.throwDatabaseError('team', error);
    return Boolean(data);
  }

  async findReports(teamId: string) {
    const { data, error } = await this.supabaseClient.getV2Client()
      .from('team_weekly_reports')
      .select('*')
      .eq('team_id', teamId)
      .order('week_start', { ascending: false });
    if (error) this.throwDatabaseError('weekly reports', error);
    return (data ?? []).map((row) => this.mapReport(row));
  }

  async findSprintsForWeek(teamId: string, weekStart: string, weekEnd: string) {
    const { data, error } = await this.supabaseClient.getV2Client()
      .from('sprints')
      .select('id,project_id,sprint_number,name,start_date,end_date,status,committed_points,completed_points,wip_stories')
      .eq('team_id', teamId)
      .lte('start_date', weekEnd)
      .gte('end_date', weekStart)
      .order('start_date', { ascending: false });
    if (error) this.throwDatabaseError('sprints', error);
    return (data ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      sprintNumber: row.sprint_number,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      committedPoints: row.committed_points,
      completedPoints: row.completed_points,
      wipStories: row.wip_stories,
    }));
  }

  async findReport(teamId: string, reportId: string) {
    const database = this.supabaseClient.getV2Client();
    const { data: report, error: reportError } = await database
      .from('team_weekly_reports')
      .select('*')
      .eq('id', reportId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (reportError) this.throwDatabaseError('weekly report', reportError);
    if (!report) return null;

    const [initiatives, risks, quality] = await Promise.all([
      database.from('team_initiatives').select('*').eq('weekly_report_id', reportId).order('created_at'),
      database.from('team_risks').select('*').eq('weekly_report_id', reportId).order('created_at'),
      database.from('quality_metrics').select('*').eq('weekly_report_id', reportId).order('recorded_at'),
    ]);
    if (initiatives.error) this.throwDatabaseError('initiatives', initiatives.error);
    if (risks.error) this.throwDatabaseError('risks', risks.error);
    if (quality.error) this.throwDatabaseError('quality metrics', quality.error);

    return {
      ...this.mapReport(report),
      initiatives: (initiatives.data ?? []).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        description: row.description,
        startDate: row.start_date,
        plannedEndDate: row.planned_end_date,
        actualEndDate: row.actual_end_date,
        progressPercentage: row.progress_percentage,
        status: row.status,
        ownerId: row.owner_id,
      })),
      risks: (risks.data ?? []).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        description: row.description,
        impact: row.impact,
        probability: row.probability,
        responsibleEmployeeId: row.responsible_employee_id,
        status: row.status,
        mitigationPlan: row.mitigation_plan,
        dueDate: row.due_date,
        resolvedAt: row.resolved_at,
      })),
      qualityMetrics: (quality.data ?? []).map((row) => ({
        id: row.id,
        defectsFound: row.defects_found,
        productionDefects: row.production_defects,
        criticalDefects: row.critical_defects,
        resolvedDefects: row.resolved_defects,
        recordedAt: row.recorded_at,
      })),
    };
  }

  async saveReport(payload: Record<string, unknown>): Promise<string> {
    const { data, error } = await this.supabaseClient.getV2Client()
      .rpc('save_weekly_report', { p_payload: payload });
    if (error) {
      if (['22P02', '23503', '23514', 'P0001'].includes(error.code ?? '')) {
        throw new BadRequestException(error.message);
      }
      throw new InternalServerErrorException(
        `Could not save the weekly report: ${error.message || 'unknown error'}`,
      );
    }
    return data as string;
  }

  private mapReport(row: any) {
    return {
      id: row.id,
      teamId: row.team_id,
      projectId: row.project_id,
      sprintId: row.sprint_id,
      scrumMasterId: row.scrum_master_id,
      architectId: row.architect_id,
      weekNumber: row.week_number,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      committedPoints: row.committed_points,
      completedPoints: row.completed_points,
      wipStories: row.wip_stories,
      defectsFound: row.defects_found,
      productionDefects: row.production_defects,
      status: row.status,
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private throwDatabaseError(resource: string, error: { message?: string }): never {
    throw new InternalServerErrorException(
      `Could not read ${resource} from the v2 database: ${error.message || 'unknown error'}`,
    );
  }
}

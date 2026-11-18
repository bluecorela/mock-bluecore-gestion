import { sprintExceptionFromSupabase } from '../sprint-error-codes';
import { sprintErrorMessage } from '../sprint-error-message';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '../../supabase/supabase.client';

export interface StoryCodeMatch {
  id: string;
  code: string;
  sprint_id: string;
  sprints: { name: string; team_id: string; status: string };
}
export interface OpenStoryMatch {
  id: string;
  code: string;
  status: string;
  name: string;
  story_points: number;
  description: string | null;
  estimated_work_days: number | null;
  assigned_employee_id: string | null;
  sprint_id: string;
  sprints: {
    id: string;
    name: string;
    team_id: string;
    status: string;
    teams: { name: string };
  };
}
export interface StoryLoadResult {
  created: Array<{ id: string; code: string }>;
  updated: Array<{ id: string; code: string }>;
}

@Injectable()
export class StoryLoadRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async findStoriesByCodes(codes: string[]): Promise<StoryCodeMatch[]> {
    if (!codes.length) return [];
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('sprint_user_stories')
      .select(
        'id, code, sprint_id, sprints!sprint_user_stories_sprint_id_fkey!inner(name, team_id, status)',
      )
      .in('code', codes);
    if (error) translateStoryLoadError(error);
    // PostgREST relation cardinality is inferred as an array without generated DB types.
    return (data ?? []) as unknown as StoryCodeMatch[];
  }

  async findOpenStoriesByCode(
    code: string,
    teamIds: string[] | null,
  ): Promise<OpenStoryMatch[]> {
    if (teamIds?.length === 0) return [];
    let query = this.supabaseClient
      .getV2Client()
      .from('sprint_user_stories')
      .select(
        'id, code, status, name, story_points, description, estimated_work_days, assigned_employee_id, sprint_id, sprints!sprint_user_stories_sprint_id_fkey!inner(id, name, team_id, status, teams!sprints_team_id_fkey(name))',
      )
      .eq('code', code)
      .in('sprints.status', ['planned', 'in_progress']);
    if (teamIds !== null) query = query.in('sprints.team_id', teamIds);
    const { data, error } = await query;
    if (error) translateStoryLoadError(error);
    return (data ?? []) as unknown as OpenStoryMatch[];
  }

  async updateStoryById(
    teamId: string,
    sprintId: string,
    storyId: string,
    payload: Record<string, unknown>,
    confirmationId: string,
    employeeId: string,
  ): Promise<unknown> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('update_story_by_id', {
        p_team_id: teamId,
        p_sprint_id: sprintId,
        p_story_id: storyId,
        p_payload: payload,
        p_confirmation_id: confirmationId,
        p_employee_id: employeeId,
      });
    if (error) translateStoryLoadError(error);
    return data;
  }

  async apply(
    teamId: string,
    sprintId: string,
    rows: Record<string, unknown>[],
    confirmationId: string,
    employeeId: string,
  ): Promise<StoryLoadResult> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .rpc('apply_sprint_story_load', {
        p_team_id: teamId,
        p_sprint_id: sprintId,
        p_stories: rows,
        p_confirmation_id: confirmationId,
        p_employee_id: employeeId,
      });
    if (error) translateStoryLoadError(error);
    return data as StoryLoadResult;
  }
}

export function translateStoryLoadError(error: {
  code?: string;
  details?: string;
  message?: string;
}): never {
  const codedError = sprintExceptionFromSupabase(error);
  if (codedError) throw codedError;
  // Respaldo eliminable cuando la nube tenga la migración 20261118.
  if (error.code === 'P0001') {
    if (
      error.message === 'Esta confirmación ya se usó' ||
      error.message ===
        'La carga cambió desde la vista previa; genera la vista previa de nuevo'
    )
      throw new ConflictException(sprintErrorMessage(error.message));
    if (error.message === 'Sprint no encontrado')
      throw new NotFoundException(sprintErrorMessage(error.message));
    throw new BadRequestException(sprintErrorMessage(error.message));
  }
  if (['22P02', '22003', '23502', '23503', '23514'].includes(error.code ?? ''))
    throw new BadRequestException('Los datos de la carga no son válidos');
  if (['40P01', '55P03'].includes(error.code ?? ''))
    throw new ConflictException(
      'Hay otra operación en curso sobre este sprint; inténtalo de nuevo',
    );
  if (error.code === '23505')
    throw new ConflictException('Conflicto al guardar la carga');
  new Logger(StoryLoadRepository.name).error(
    'Error de acceso a la carga de historias',
    error,
  );
  throw new InternalServerErrorException('No se pudo guardar la carga');
}

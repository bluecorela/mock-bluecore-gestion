import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '../supabase.client';
import type { Team } from '../interfaces/supabase-interface';

@Injectable()
export class TeamDirectoryRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  private slug(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-');
  }

  async getTeams(onlyWithEvaluations = false): Promise<Team[]> {
    const database = this.supabaseClient.getV2Client();
    if (onlyWithEvaluations) {
      const { data: metrics, error: metricsError } = await database
        .from('sprint_member_metrics')
        .select('sprint_id');
      if (metricsError) throw metricsError;
      const sprintIds = [
        ...new Set((metrics ?? []).map((metric) => metric.sprint_id)),
      ];
      if (!sprintIds.length) return [];
      const { data: sprints, error: sprintsError } = await database
        .from('sprints')
        .select('team_id')
        .in('id', sprintIds);
      if (sprintsError) throw sprintsError;
      const teamIds = [
        ...new Set((sprints ?? []).map((sprint) => sprint.team_id)),
      ];
      if (!teamIds.length) return [];
      const { data, error } = await database
        .from('teams')
        .select('code,name')
        .in('id', teamIds)
        .is('deleted_at', null)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((team) => ({ id: team.code, name: team.name }));
    }

    const query = database
      .from('teams')
      .select('code,name')
      .is('deleted_at', null);
    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((team) => ({ id: team.code, name: team.name }));
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('teams')
      .select('code,name')
      .eq('code', teamId.toLowerCase())
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.code, name: data.name } : null;
  }

  async findTeamByName(name: string): Promise<Team | null> {
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('teams')
      .select('code,name')
      .ilike('name', name)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data && data.name.toLowerCase() === name.toLowerCase()
      ? { id: data.code, name: data.name }
      : null;
  }

  async createTeam(name: string): Promise<{ id: string; name: string }> {
    const teamId = this.slug(name);
    const [existingCode, existingName] = await Promise.all([
      this.getTeam(teamId),
      this.findTeamByName(name),
    ]);
    if (existingCode || existingName)
      throw new Error('Ya existe un equipo con ese nombre');
    const { data, error } = await this.supabaseClient
      .getV2Client()
      .from('teams')
      .insert({
        code: teamId,
        name,
        status: 'active',
      })
      .select('code,name')
      .single();
    if (error) throw error;
    return { id: data.code, name: data.name };
  }
}

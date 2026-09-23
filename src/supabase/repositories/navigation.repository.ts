import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '../supabase.client';
import type { SidebarModule } from '../interfaces/supabase-interface';

interface RoleSummaryRow {
  id: string;
  code: string;
  name: string;
}
interface SidebarRoleAssignmentRow {
  module_id: string;
  role_id: string;
}
interface SidebarModuleRow {
  id: string;
  code: string;
  name: string;
  route: string;
  icon: string;
  display_order: number;
  is_visible: boolean;
}

@Injectable()
export class NavigationRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async getModulesByRole(role: string): Promise<SidebarModule[]> {
    const database = this.supabaseClient.getV2Client();
    const roleCodes: Record<string, string> = {
      Admin: 'ADMIN',
      Arquitecto: 'ARCHITECT',
      'Scrum Master': 'SCRUM_MASTER',
      'Ingeniero de Software': 'SOFTWARE_ENGINEER',
      'Ingeniero de QA': 'QA_ENGINEER',
      'Ingeniero QA': 'QA_ENGINEER',
      'Creador de Bienestar': 'WELLBEING_CREATOR',
      Pasante: 'INTERN',
    };
    const roleCode = roleCodes[role] ?? role.toUpperCase();
    const { data: roleRecord, error: roleError } = await database
      .from('roles')
      .select('id,code')
      .eq('code', roleCode)
      .maybeSingle();
    if (roleError) throw roleError;
    if (!roleRecord) return [];

    const { data: permissions, error: permissionError } = await database
      .from('sidebar_module_roles')
      .select('module_id')
      .eq('role_id', roleRecord.id);
    if (permissionError) throw permissionError;
    const moduleIds = (permissions ?? []).map(
      (permission) => permission.module_id,
    );
    if (!moduleIds.length) return [];

    const { data: modules, error } = await database
      .from('sidebar_modules')
      .select('*')
      .in('id', moduleIds)
      .eq('is_visible', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return (modules ?? []).map((moduleItem) => ({
      id: moduleItem.id,
      name: moduleItem.name,
      route: moduleItem.route,
      icon: moduleItem.icon,
      order: moduleItem.display_order,
      visible: moduleItem.is_visible,
      permittedRoles: [role],
    }));
  }

  async getSidebarConfiguration() {
    const database = this.supabaseClient.getV2Client();
    const [
      { data: modules, error: moduleError },
      { data: assignments, error: assignmentError },
      { data: roles, error: roleError },
    ] = await Promise.all([
      database.from('sidebar_modules').select('*').order('display_order'),
      database.from('sidebar_module_roles').select('module_id,role_id'),
      database.from('roles').select('id,code,name').order('name'),
    ]);
    if (moduleError) throw moduleError;
    if (assignmentError) throw assignmentError;
    if (roleError) throw roleError;
    const roleRows = (roles ?? []) as RoleSummaryRow[];
    const assignmentRows = (assignments ?? []) as SidebarRoleAssignmentRow[];
    const moduleRows = (modules ?? []) as SidebarModuleRow[];
    const rolesById = new Map(roleRows.map((role) => [role.id, role]));
    const roleCodesByModule = new Map<string, string[]>();
    for (const assignment of assignmentRows) {
      const role = rolesById.get(assignment.role_id);
      if (!role) continue;
      const codes = roleCodesByModule.get(assignment.module_id) ?? [];
      codes.push(role.code);
      roleCodesByModule.set(assignment.module_id, codes);
    }
    return {
      modules: moduleRows.map((moduleItem) => ({
        id: moduleItem.id,
        code: moduleItem.code,
        name: moduleItem.name,
        route: moduleItem.route,
        icon: moduleItem.icon,
        displayOrder: moduleItem.display_order,
        isVisible: moduleItem.is_visible,
        roleCodes: roleCodesByModule.get(moduleItem.id) ?? [],
      })),
      roles: roleRows.map((role) => ({
        code: role.code,
        name: role.name,
      })),
    };
  }

  async saveSidebarModule(input: object) {
    const { data: moduleId, error } = await this.supabaseClient
      .getV2Client()
      .rpc('save_sidebar_module', { p_payload: input });
    if (error) throw error;
    const configuration = await this.getSidebarConfiguration();
    return (
      configuration.modules.find((moduleItem) => moduleItem.id === moduleId) ??
      null
    );
  }
}

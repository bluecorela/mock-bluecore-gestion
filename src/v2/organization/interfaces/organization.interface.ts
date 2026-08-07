export type RecordStatus = 'active' | 'inactive';
export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface ClientV2 {
  id: string;
  code: string;
  name: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProjectV2 {
  id: string;
  clientId: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  plannedEndDate: string | null;
  actualEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TeamV2 {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TeamProjectV2 {
  id: string;
  isPrimary: boolean;
  startedAt: string;
  endedAt: string | null;
  project: ProjectV2 & { client: ClientV2 };
  members: TeamProjectMemberV2[];
}

export interface EmployeeSummaryV2 {
  id: string;
  employeeCode: string | null;
  fullName: string;
  email: string;
}

export interface RoleV2 {
  id: string;
  code: string;
  name: string;
}

export interface TeamProjectMemberV2 {
  id: string;
  startedAt: string;
  endedAt: string | null;
  isActive: boolean;
  employee: EmployeeSummaryV2;
  role: RoleV2;
}

export interface TeamOrganizationV2 {
  team: TeamV2;
  assignments: TeamProjectV2[];
}

export interface SaveClientV2Data {
  code: string;
  name: string;
  status?: RecordStatus;
}

export interface SaveProjectV2Data {
  clientId: string;
  code: string;
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  startDate?: string | null;
  plannedEndDate?: string | null;
  actualEndDate?: string | null;
}

export interface SaveTeamProjectMembershipV2Data {
  teamProjectId: string;
  employeeId: string;
  roleId: string;
  startedAt: string;
  createdBy: string;
}

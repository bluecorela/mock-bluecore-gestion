export type RecordStatus = 'active' | 'inactive';
export type ProjectStatus =
  | 'planned'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

export interface Client {
  id: string;
  code: string;
  name: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Project {
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

export interface Team {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TeamProject {
  id: string;
  isPrimary: boolean;
  startedAt: string;
  endedAt: string | null;
  project: Project & { client: Client };
  members: TeamProjectMember[];
}

export interface EmployeeSummary {
  id: string;
  employeeCode: string | null;
  fullName: string;
  email: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
}

export interface TeamProjectMember {
  id: string;
  startedAt: string;
  endedAt: string | null;
  isActive: boolean;
  employee: EmployeeSummary;
  role: Role;
}

export interface TeamOrganization {
  team: Team;
  assignments: TeamProject[];
}

export interface SaveClientData {
  code: string;
  name: string;
  status?: RecordStatus;
}

export interface SaveProjectData {
  clientId: string;
  code: string;
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  startDate?: string | null;
  plannedEndDate?: string | null;
  actualEndDate?: string | null;
}

export interface SaveTeamProjectMembershipData {
  teamProjectId: string;
  employeeId: string;
  roleId: string;
  startedAt: string;
  createdBy: string;
}

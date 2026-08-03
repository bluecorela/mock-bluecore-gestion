export interface MemberSummary {
  id?: string;
  name: string;
  total1: number;
  total2: number;
  total3: number;
  total_final: number;
  rating: string;
  comments?: string;
}

export interface Team {
  id: string;
  name: string;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface Personnel {
  id: string;
  name: string | null;
  role: string | null;
  email: string | null;
  teamId: string | null;
  status: 'activo' | 'inactivo' | null;
  onVacation: boolean | null;
  replacementStartSprintId: string | null;
  team?: { id: string; path: string; referencePath: string } | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface Sprint {
  id: string;
  firebase_id: string;
  team_id: string;
  start_date: string | null;
  end_date: string | null;
  sprint_closed: boolean | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface SprintMember {
  id: string;
  firebase_id: string;
  sprint_id: string;
  team_id: string;
  name: string | null;
  assigned_tasks: number | null;
  delivered_tasks: number | null;
  returned_tasks: number | null;
  code_quality: number | null;
  total1: number | null;
  total2: number | null;
  total3: number | null;
  total_final: number | null;
  rating: string | null;
  comments: string | null;
  evaluated_by: string | null;
  evaluation_date: string | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface CurrentEngineer {
  id: string;
  name: string;
  replacementStartSprintId: string | null;
  onVacation: boolean | null;
}

export interface DashboardMember {
  id?: string;
  name: string;
  total1?: number | null;
  total2?: number | null;
  total3?: number | null;
  total_final: number | null;
  rating: string | null;
  comments?: string | null;
}

export interface DashboardSprint {
  id: string;
  startDate: string | Date | null;
  endDate: string | Date | null;
  sprintClosed: boolean | null;
  members: DashboardMember[];
}

export type SprintStatus = 'Completado' | 'En proceso';

export interface DashboardSprintWithStatus extends DashboardSprint {
  status: SprintStatus;
}

export interface BarChartData {
  labels: string[];
  datasets: Array<{ data: number[] }>;
}

export interface PerformanceSummary {
  sprintId: string;
  average: number;
  status: SprintStatus;
  rating: string;
  totalEvaluated: number;
}

export interface PerformanceTrend {
  labels: string[];
  values: number[];
}

export interface TeamDashboardData {
  team: Pick<Team, 'id' | 'name'>;
  stats: {
    totalMembers: number;
    totalSprints: number;
    averagePerformance: number;
    ratedPerformance: string;
  };
  sprints: DashboardSprintWithStatus[];
  charts: {
    barChart: BarChartData;
    lineChart: PerformanceTrend | null;
    chartSprintId: string | null;
  };
}

export interface RotationHistory {
  id?: string;
  personnelId?: string;
  type?: string;
  date?: string | Date;
}

export interface TeamSprintResponse {
  id: string;
  name: string;
  startDate: string | Date | null;
  endDate: string | Date | null;
  sprintClosed: boolean | null;
}

export interface SaveEvaluationRequest {
  teamId: string;
  sprintId: string;
  startDate: string;
  endDate: string;
  engineer: string;
  metrics: Record<string, number>;
  finalScore: number;
  ratingLabel: string;
  comments?: string;
  evaluatorEmail: string;
}

export interface CreatePersonnelData {
  name: string;
  role: string;
  email?: string;
  teamId?: string;
  status?: 'activo' | 'inactivo';
}

export interface UpdatePersonnelData {
  name?: string;
  role?: string;
  email?: string | null;
  teamId?: string | null;
  status?: 'activo' | 'inactivo';
}

export interface RotationHistoryRow {
  id: string;
  date: string | null;
  type: string | null;
  employee_name: string | null;
  employee_id: string | null;
  from_team: string | null;
  from_name_team: string | null;
  to_team: string | null;
  to_name_team: string | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface SidebarModule {
  id: string;
  name: string | null;
  route: string | null;
  icon: string | null;
  order: number | null;
  visible: boolean | null;
  permittedRoles: string[] | null;
  firebase_path?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface MaintenanceStatus {
  active: boolean;
}

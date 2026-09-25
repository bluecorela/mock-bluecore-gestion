export interface SprintItemRecord extends Record<string, unknown> {
  id?: string;
  initiativeId?: string | null;
  code?: string;
  name?: string;
  description?: string | null;
  status?: string;
  storyPoints?: number;
  estimatedWorkDays?: number | null;
  assignedEmployeeId?: string | null;
}

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

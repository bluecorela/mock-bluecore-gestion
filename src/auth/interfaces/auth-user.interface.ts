export interface AuthenticatedUser {
  supabaseUserId: string;
  email: string;
  personnelId: string | null;
  name: string | null;
  role: string | null;
  teamId: string | null;
  teamIds: string[];
  mustChangePassword: boolean;
}

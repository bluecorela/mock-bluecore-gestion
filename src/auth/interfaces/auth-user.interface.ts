export interface AuthenticatedUser {
  supabaseUserId: string;
  email: string;
  personnelId: string | null;
  name: string | null;
  role: string | null;
  teamId: string | null;
  mustChangePassword: boolean;
}

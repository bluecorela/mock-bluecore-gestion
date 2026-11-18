export interface AuthenticatedUser {
  supabaseUserId: string;
  oauthClientId: string | null;
  email: string;
  personnelId: string | null;
  employeeId: string | null;
  name: string | null;
  role: string | null;
  teamId: string | null;
  teamIds: string[];
  mustChangePassword: boolean;
}

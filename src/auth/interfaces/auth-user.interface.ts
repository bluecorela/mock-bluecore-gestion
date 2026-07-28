export interface AuthenticatedUser {
  supabaseUserId: string;
  email: string;
  personalId: string | null;
  nombre: string | null;
  rol: string | null;
  equipoId: string | null;
  mustChangePassword: boolean;
}

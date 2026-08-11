import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { inspect } from 'node:util';
import type { User } from '@supabase/supabase-js';
import { SupabaseClient } from '../supabase/supabase.client';
import { SupabaseDataService } from '../supabase/supabase-data.service';
import { AuthenticatedUser } from './interfaces/auth-user.interface';
import { CreateAuthUserDto } from './dto/create-auth-user.dto';
import { UpdateAuthUserDto } from './dto/update-auth-user.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseClient: SupabaseClient,
    private readonly supabaseDataService: SupabaseDataService,
  ) {}

  extractBearerToken(authorization?: string): string {
    if (!authorization) {
      throw new UnauthorizedException('Authorization header es obligatorio');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authorization header debe usar Bearer token');
    }

    return token;
  }

  async loginForApiDocumentation(input: LoginDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Endpoint no disponible');
    }

    const { data, error } = await this.supabaseClient.getPublicClient().auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.session?.access_token) {
      throw new UnauthorizedException('Correo o contraseña inválidos');
    }

    const user = await this.validateAccessToken(data.session.access_token);
    return {
      accessToken: data.session.access_token,
      tokenType: data.session.token_type || 'bearer',
      expiresAt: data.session.expires_at ?? null,
      user,
    };
  }

  async validateAuthorizationHeader(authorization?: string): Promise<AuthenticatedUser> {
    const token = this.extractBearerToken(authorization);
    return this.validateAccessToken(token);
  }

  async validateAccessToken(token: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabaseClient.getClient().auth.getUser(token);

    if (error || !data.user?.email) {
      throw new UnauthorizedException('Token de Supabase inválido o expirado');
    }

    let personnel = await this.supabaseDataService.getPersonnelByAuthUserId(data.user.id);
    if (!personnel) {
      personnel = await this.supabaseDataService.getPersonnelByEmail(data.user.email);
      if (personnel) {
        await this.supabaseDataService.linkPersonnelToAuthUser(personnel.id, data.user.id);
      }
    }

    if (!personnel) {
      throw new UnauthorizedException('El usuario no tiene un perfil de personal asociado');
    }

    if (personnel?.status === 'inactivo') {
      throw new UnauthorizedException('Usuario inactivo');
    }

    return {
      supabaseUserId: data.user.id,
      email: data.user.email,
      personnelId: personnel?.id ?? null,
      name: personnel?.name ?? null,
      role: personnel?.role ?? null,
      teamId: personnel?.teamId ?? null,
      mustChangePassword: data.user.user_metadata?.mustChangePassword === true,
    };
  }

  async getUsers() {
    return this.supabaseDataService.getPersonnel();
  }

  async getBootstrap(user: AuthenticatedUser) {
    const [sidebarModules, maintenance] = await Promise.all([
      user.role ? this.supabaseDataService.getModulesByRole(user.role) : Promise.resolve([]),
      this.supabaseDataService.getMaintenanceStatus(),
    ]);
    return {
      user,
      sidebarModules,
      maintenance: { active: maintenance?.active ?? false },
    };
  }

  async getUser(personnelId: string) {
    return this.supabaseDataService.getPersonnelById(personnelId);
  }

  async createUser(data: CreateAuthUserDto) {
    const existingPersonnel = await this.supabaseDataService.getPersonnelByEmail(data.email);

    if (existingPersonnel) {
      throw new BadRequestException('Ya existe un usuario/personal con ese correo');
    }

    const { data: authData, error } = await this.supabaseClient.getClient().auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: data.emailConfirm ?? true,
      user_metadata: {
        name: data.name,
        role: data.role,
        teamId: data.teamId ?? null,
        status: 'activo',
        mustChangePassword: true,
      },
    });

    if (error || !authData.user) {
      throw new BadRequestException(error?.message ?? 'No se pudo crear el usuario en Supabase Auth');
    }

    let personnel: { id: string };
    try {
      personnel = await this.supabaseDataService.createPersonnel({
        name: data.name,
        role: data.role,
        email: data.email,
        teamId: data.teamId,
        status: 'activo',
        authUserId: authData.user.id,
      });
    } catch (personnelError) {
      const { error: rollbackError } = await this.supabaseClient.getClient()
        .auth.admin.deleteUser(authData.user.id);
      const detail = rollbackError
        ? ` No se pudo revertir el usuario de Auth: ${rollbackError.message}`
        : '';
      throw new BadRequestException(`No se pudo crear el perfil de personal.${detail}`);
    }

    const emailResult = data.sendPasswordEmail === false
      ? { sent: false, warning: 'Envío de correo omitido.' }
      : await this.sendUserAccessEmail({
        to: data.email,
        name: data.name,
        password: data.password,
      });

    return {
      ok: true,
      authUserId: authData.user.id,
      personnelId: personnel.id,
      email: authData.user.email,
      emailSent: emailResult.sent,
      warning: emailResult.warning,
    };
  }

  async updateUser(personnelId: string, data: UpdateAuthUserDto, updatedBy?: string) {
    const currentPersonnel = await this.supabaseDataService.getPersonnelById(personnelId);

    if (!currentPersonnel) {
      return null;
    }

    const effectiveRole = data.role ?? currentPersonnel.role;
    const effectiveTeamId = data.teamId === undefined ? currentPersonnel.teamId : data.teamId;
    if (effectiveRole && ['Ingeniero de Software', 'Ingeniero de QA', 'Pasante'].includes(effectiveRole)
      && !effectiveTeamId) {
      throw new BadRequestException(`El rol ${effectiveRole} requiere equipo`);
    }

    const updatedPersonnel = await this.supabaseDataService.updatePersonnel(personnelId, {
      name: data.name,
      role: data.role,
      email: data.email,
      teamId: data.teamId,
      status: data.status,
      createdBy: updatedBy,
    });

    const authEmail = data.email ?? currentPersonnel.email;
    const authUserId = await this.supabaseDataService.getPersonnelAuthUserId(personnelId);
    const authUser = authUserId
      ? await this.findAuthUserById(authUserId)
      : currentPersonnel.email
        ? await this.findAuthUserByEmail(currentPersonnel.email)
        : authEmail ? await this.findAuthUserByEmail(authEmail) : null;

    if (authUser) {
      const authUpdate: {
        email?: string;
        password?: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
        ban_duration?: string;
      } = {};

      if (data.email) authUpdate.email = data.email;
      if (data.password) authUpdate.password = data.password;
      if (data.email && data.emailConfirm !== false) authUpdate.email_confirm = true;
      if (data.status) authUpdate.ban_duration = data.status === 'inactivo' ? '876000h' : 'none';

      authUpdate.user_metadata = {
        ...(authUser.user_metadata ?? {}),
        name: updatedPersonnel?.name ?? currentPersonnel.name,
        role: updatedPersonnel?.role ?? currentPersonnel.role,
        teamId: updatedPersonnel?.teamId ?? null,
        status: updatedPersonnel?.status ?? currentPersonnel.status ?? 'activo',
        mustChangePassword: data.password ? true : authUser.user_metadata?.mustChangePassword === true,
      };

      const { error } = await this.supabaseClient
        .getClient()
        .auth.admin.updateUserById(authUser.id, authUpdate);

      if (error) {
        throw new BadRequestException(error.message);
      }

      const emailResult = data.password && data.sendPasswordEmail !== false
        ? await this.sendUserAccessEmail({
          to: data.email ?? authUser.email ?? currentPersonnel.email ?? '',
          name: updatedPersonnel?.name ?? currentPersonnel.name,
          password: data.password,
        })
        : null;

      return {
        ok: true,
        user: updatedPersonnel,
        emailSent: emailResult?.sent ?? false,
        warning: emailResult?.warning,
      };
    } else if (data.password) {
      if (!authEmail) {
        throw new BadRequestException('El usuario necesita correo para crear acceso en Supabase Auth');
      }

      const { data: createdAuthData, error } = await this.supabaseClient.getClient().auth.admin.createUser({
        email: authEmail,
        password: data.password,
        email_confirm: data.emailConfirm ?? true,
        user_metadata: {
          name: updatedPersonnel?.name ?? currentPersonnel.name,
          role: updatedPersonnel?.role ?? currentPersonnel.role,
          teamId: updatedPersonnel?.teamId ?? null,
          status: updatedPersonnel?.status ?? currentPersonnel.status ?? 'activo',
          personnelId,
          mustChangePassword: true,
        },
      });

      if (error) {
        throw new BadRequestException(error.message);
      }

      if (createdAuthData.user) {
        await this.supabaseDataService.linkPersonnelToAuthUser(personnelId, createdAuthData.user.id);
      }

      const emailResult = data.sendPasswordEmail === false
        ? { sent: false, warning: 'Envío de correo omitido.' }
        : await this.sendUserAccessEmail({
          to: authEmail,
          name: updatedPersonnel?.name ?? currentPersonnel.name,
          password: data.password,
        });

      return {
        ok: true,
        user: updatedPersonnel,
        emailSent: emailResult.sent,
        warning: emailResult.warning,
      };
    }

    return {
      ok: true,
      user: updatedPersonnel,
      emailSent: false,
    };
  }

  async markPasswordChanged(user: AuthenticatedUser) {
    const authUser = await this.findAuthUserById(user.supabaseUserId);

    if (!authUser) {
      throw new BadRequestException('Usuario de Supabase Auth no encontrado');
    }

    const { error } = await this.supabaseClient.getClient().auth.admin.updateUserById(authUser.id, {
      user_metadata: {
        ...(authUser.user_metadata ?? {}),
        mustChangePassword: false,
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { ok: true };
  }

  private async sendUserAccessEmail(data: { to: string; name?: string | null; password: string }) {
    if (process.env.AUTH_EMAIL_PROVIDER === 'supabase') {
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
      try {
        const { error } = await this.supabaseClient.getPublicClient().auth.resetPasswordForEmail(data.to, {
          redirectTo: `${frontendUrl}/change-password`,
        });

        if (error) {
          console.error('Supabase resetPasswordForEmail error:', inspect(error, { depth: 5 }));

          return {
            sent: false,
            warning: `Usuario creado, pero Supabase no pudo enviar el email: ${this.getErrorMessage(error)}`,
          };
        }

        return { sent: true };
      } catch (error) {
        console.error('Supabase resetPasswordForEmail exception:', inspect(error, { depth: 5 }));

        return {
          sent: false,
          warning: `Usuario creado, pero Supabase no pudo enviar el email: ${this.getErrorMessage(error)}`,
        };
      }
    }

    return {
      sent: false,
      warning: 'AUTH_EMAIL_PROVIDER debe ser supabase para enviar correos desde Supabase Auth.',
    };
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const details = [
        this.readErrorProperty(error, 'name'),
        this.readErrorProperty(error, 'message'),
        this.readErrorProperty(error, 'status'),
        this.readErrorProperty(error, 'code'),
        this.readErrorProperty(error, 'hint'),
        this.readErrorProperty(error, 'cause'),
      ].filter(Boolean);

      if (details.length) {
        return details.join(', ');
      }

      const entries = Object.entries(error)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}: ${String(value)}`);

      if (entries.length) {
        return entries.join(', ');
      }
    }

    return String(error);
  }

  private readErrorProperty(error: object, key: string): string | null {
    const value = (error as Record<string, unknown>)[key];

    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (value instanceof Error) {
      return `${key}: ${value.message}`;
    }

    if (typeof value === 'object') {
      return `${key}: ${inspect(value, { depth: 2 })}`;
    }

    return `${key}: ${String(value)}`;
  }

  private async findAuthUserByEmail(email: string): Promise<User | null> {
    let page = 1;
    const perPage = 100;

    while (page <= 10) {
      const { data, error } = await this.supabaseClient
        .getClient()
        .auth.admin.listUsers({ page, perPage });

      if (error) {
        throw new BadRequestException(error.message);
      }

      const user = data.users.find((item) => item.email === email);

      if (user) {
        return user;
      }

      if (data.users.length < perPage) {
        return null;
      }

      page += 1;
    }

    return null;
  }

  private async findAuthUserById(authUserId: string): Promise<User | null> {
    const { data, error } = await this.supabaseClient.getClient()
      .auth.admin.getUserById(authUserId);
    if (error) {
      if (error.status === 404) return null;
      throw new BadRequestException(error.message);
    }
    return data.user ?? null;
  }
}

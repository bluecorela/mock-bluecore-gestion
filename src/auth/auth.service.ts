import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { inspect } from 'node:util';
import type { User } from '@supabase/supabase-js';
import { SupabaseClient } from '../supabase/supabase.client';
import { SupabaseDataService } from '../supabase/supabase-data.service';
import { AuthenticatedUser } from './interfaces/auth-user.interface';
import { CreateAuthUserDto } from './dto/create-auth-user.dto';
import { UpdateAuthUserDto } from './dto/update-auth-user.dto';

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

  async validateAuthorizationHeader(authorization?: string): Promise<AuthenticatedUser> {
    const token = this.extractBearerToken(authorization);
    return this.validateAccessToken(token);
  }

  async validateAccessToken(token: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabaseClient.getClient().auth.getUser(token);

    if (error || !data.user?.email) {
      throw new UnauthorizedException('Token de Supabase inválido o expirado');
    }

    const personnel = await this.supabaseDataService.getPersonnelByEmail(data.user.email);

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

    const personnel = await this.supabaseDataService.createPersonnel({
      name: data.name,
      role: data.role,
      email: data.email,
      teamId: data.teamId,
      status: 'activo',
    });

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

  async updateUser(personnelId: string, data: UpdateAuthUserDto) {
    const currentPersonnel = await this.supabaseDataService.getPersonnelById(personnelId);

    if (!currentPersonnel) {
      return null;
    }

    const updatedPersonnel = await this.supabaseDataService.updatePersonnel(personnelId, {
      name: data.name,
      role: data.role,
      email: data.email,
      teamId: data.teamId,
      status: data.status,
    });

    const authEmail = data.email ?? currentPersonnel.email;
    const authUser = authEmail
      ? await this.findAuthUserByEmail(authEmail)
      : null;

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

      const { error } = await this.supabaseClient.getClient().auth.admin.createUser({
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
    const authUser = await this.findAuthUserByEmail(user.email);

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
}

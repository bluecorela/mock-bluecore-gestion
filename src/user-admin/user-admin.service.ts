import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { OrganizationService } from '../organization/services/organization.service';
import { RotationService } from '../rotation/rotation.service';
import { LoadConfirmationService } from '../sprints/load/load-confirmation.service';
import { canonicalJson } from '../mcp/canonical-json';
import { UserAdminRepository } from './user-admin.repository';
import {
  isAdmin,
  normalizeEmail,
  planCreate,
  planDesignate,
  planMove,
  planRole,
} from './user-admin.planner';
import {
  CreateRow,
  DesignateRow,
  MoveRow,
  PlanContext,
  PlannedRow,
  PreviewResponse,
  RoleRow,
  RowResult,
  UserAdminOperation,
  UserResult,
} from './user-admin.types';
type Input = CreateRow | RoleRow | MoveRow | DesignateRow;

@Injectable()
export class UserAdminService {
  constructor(
    private readonly repository: UserAdminRepository,
    private readonly confirmation: LoadConfirmationService,
    private readonly auth: AuthService,
    private readonly rotation: RotationService,
    private readonly organization: OrganizationService,
  ) {}

  findUsers(query: {
    texto?: string;
    equipo_id?: string;
  }): Promise<UserResult[]> {
    return this.repository.findUsers(query);
  }
  async previewCreate(
    rows: CreateRow[],
    admin: AuthenticatedUser,
  ): Promise<PreviewResponse> {
    return this.preview(
      'user_create',
      planCreate(rows, await this.context(rows)),
      admin,
    );
  }
  async previewRole(
    row: RoleRow,
    admin: AuthenticatedUser,
  ): Promise<PreviewResponse> {
    const ctx = await this.context([row]);
    return this.preview(
      'user_role',
      [planRole(row, ctx)],
      admin,
      ctx.people.get(normalizeEmail(row.correo))?.id ?? undefined,
    );
  }
  async previewMove(
    row: MoveRow,
    admin: AuthenticatedUser,
  ): Promise<PreviewResponse> {
    return this.preview(
      'user_move',
      [planMove(row, await this.context([row]))],
      admin,
    );
  }
  async previewDesignate(
    row: DesignateRow,
    admin: AuthenticatedUser,
  ): Promise<PreviewResponse> {
    const ctx = await this.context([row]);
    return this.preview(
      'leader_designate',
      [planDesignate(row, ctx)],
      admin,
      ctx.people.get(normalizeEmail(row.correo))?.id ?? undefined,
    );
  }
  applyCreate(row: CreateRow, token: string, admin: AuthenticatedUser) {
    return this.apply('user_create', row, token, admin);
  }
  applyRole(row: RoleRow, token: string, admin: AuthenticatedUser) {
    return this.apply('user_role', row, token, admin);
  }
  applyMove(row: MoveRow, token: string, admin: AuthenticatedUser) {
    return this.apply('user_move', row, token, admin);
  }
  applyDesignate(row: DesignateRow, token: string, admin: AuthenticatedUser) {
    return this.apply('leader_designate', row, token, admin);
  }

  private binding(
    operation: UserAdminOperation,
    input: Input,
    admin: AuthenticatedUser,
    resolvedMove?: PlannedRow<Input>['resolvedMove'],
    resolvedEmployeeId?: string,
  ) {
    return {
      operation,
      employeeId: admin.supabaseUserId,
      target: normalizeEmail(input.correo),
      content: resolvedMove
        ? { input, resolvedMove }
        : resolvedEmployeeId
          ? {
              input,
              resolvedEmployee: { employeeId: resolvedEmployeeId },
              ...(operation === 'leader_designate'
                ? { moveRequired: false }
                : {}),
            }
          : input,
    };
  }
  private preview(
    operation: UserAdminOperation,
    rows: PlannedRow<Input>[],
    admin: AuthenticatedUser,
    resolvedEmployeeId?: string,
  ): PreviewResponse {
    const errors = rows.reduce((count, row) => count + row.errors.length, 0);
    return {
      errors,
      rows: rows.map((row) => {
        const resolved =
          row.resolvedMove ??
          (resolvedEmployeeId ? { employeeId: resolvedEmployeeId } : undefined);
        const issued =
          !errors && !row.noop
            ? this.confirmation.issue(
                this.binding(
                  operation,
                  row.input,
                  admin,
                  row.resolvedMove,
                  resolvedEmployeeId,
                ),
              )
            : null;
        return {
          ...row,
          confirmationToken: issued
            ? resolved
              ? `${issued.token}.${Buffer.from(JSON.stringify(resolved)).toString('base64url')}`
              : issued.token
            : null,
          expiresAt: issued?.expiresAt ?? null,
        };
      }),
    };
  }

  private async context(rows: Input[]): Promise<PlanContext> {
    const emails = rows.map((row) => normalizeEmail(row.correo));
    const teamIds = rows.flatMap((row) =>
      'equipo_destino_id' in row
        ? [
            row.equipo_destino_id,
            ...(row.equipo_origen_id ? [row.equipo_origen_id] : []),
          ]
        : 'equipo_id' in row
          ? [
              row.equipo_id,
              ...('equipo_origen_id' in row && row.equipo_origen_id
                ? [row.equipo_origen_id]
                : []),
            ]
          : [],
    );
    const ctx = await this.repository.loadContext({ emails, teamIds });
    // Las lecturas iniciales revelan los equipos actuales, necesarios para resolver
    // el origen y advertir de líderes que conservan su designación.
    const missing = [
      ...new Set([...ctx.people.values()].flatMap((person) => person.teamIds)),
    ].filter((id) => !ctx.teams.has(id));
    if (missing.length) {
      const extra = await this.repository.loadContext({
        emails: [],
        teamIds: missing,
      });
      for (const [id, team] of extra.teams) ctx.teams.set(id, team);
    }
    return ctx;
  }

  private async apply(
    operation: UserAdminOperation,
    raw: Input,
    token: string,
    admin: AuthenticatedUser,
  ): Promise<RowResult> {
    const input = { ...raw, correo: normalizeEmail(raw.correo) };
    // El contexto resuelto viaja junto al token y su hash está firmado.
    let resolvedMove: PlannedRow<Input>['resolvedMove'];
    let resolvedEmployeeId: string | undefined;
    let signedToken = token;
    if (operation !== 'user_create') {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error();
        const parsed: unknown = JSON.parse(
          Buffer.from(parts[2], 'base64url').toString(),
        );
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !('employeeId' in parsed) ||
          typeof parsed.employeeId !== 'string'
        )
          throw new Error();
        if (
          operation === 'user_move' ||
          (operation === 'leader_designate' && 'sourceTeamId' in parsed)
        ) {
          if (
            !('sourceTeamId' in parsed) ||
            (parsed.sourceTeamId !== null &&
              typeof parsed.sourceTeamId !== 'string') ||
            !('designationRole' in parsed) ||
            (parsed.designationRole !== null &&
              parsed.designationRole !== 'architect' &&
              parsed.designationRole !== 'scrum-master')
          )
            throw new Error();
          resolvedMove = {
            employeeId: parsed.employeeId,
            sourceTeamId: parsed.sourceTeamId,
            designationRole: parsed.designationRole,
            ...('closeSourceLeader' in parsed
              ? {
                  closeSourceLeader: parsed.closeSourceLeader as {
                    teamId: string;
                    employeeId: string;
                  },
                }
              : {}),
          };
        } else {
          resolvedEmployeeId = parsed.employeeId;
        }
        signedToken = parts.slice(0, 2).join('.');
      } catch {
        throw new BadRequestException(
          'La confirmación no es válida o venció; genera la vista previa de nuevo',
        );
      }
    }
    const { confirmationId } = this.confirmation.verify(
      signedToken,
      this.binding(operation, input, admin, resolvedMove, resolvedEmployeeId),
    );
    const result: RowResult = { row: 1, correo: input.correo, estado: 'falló' };
    try {
      await this.repository.consumeConfirmation(
        confirmationId,
        operation,
        admin.employeeId ?? null,
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      return { ...result, detalle: 'No se pudo consumir la confirmación' };
    }
    let password: string | undefined;
    let replacementDetail: string | undefined;
    try {
      const ctx = await this.context([input]);
      if (
        resolvedEmployeeId !== undefined &&
        ctx.people.get(input.correo)?.id !== resolvedEmployeeId
      )
        return {
          ...result,
          detalle:
            'La persona cambió desde la vista previa; genera la vista previa de nuevo',
        };
      const planned =
        operation === 'user_create'
          ? planCreate([input as CreateRow], ctx)[0]
          : operation === 'user_role'
            ? planRole(input as RoleRow, ctx)
            : operation === 'user_move'
              ? planMove(input as MoveRow, ctx)
              : planDesignate(input as DesignateRow, ctx);
      if (
        (operation === 'user_move' || operation === 'leader_designate') &&
        canonicalJson(resolvedMove) !== canonicalJson(planned.resolvedMove)
      )
        return {
          ...result,
          detalle:
            'El movimiento o cargo de origen cambió desde la vista previa; genera la vista previa de nuevo',
        };
      if (planned.errors.length)
        return { ...result, detalle: planned.errors[0] };
      if (planned.noop) return { ...result, estado: 'omitida' };
      const person = ctx.people.get(input.correo);
      if (operation === 'user_create') {
        const row = input as CreateRow;
        password = randomBytes(24).toString('base64url');
        const created = await this.auth.createUser({
          name: row.nombre,
          email: row.correo,
          role: row.rol,
          teamId: ctx.teams.get(row.equipo_id)!.code,
          password,
          sendPasswordEmail: true,
          emailConfirm: true,
          createdBy: admin.supabaseUserId,
        });
        if (row.designar_como_lider) {
          try {
            replacementDetail = await this.designate(
              row.equipo_id,
              ctx.teams.get(row.equipo_id)!.name,
              row.rol === 'Arquitecto' ? 'architect' : 'scrum-master',
              created.personnelId,
              admin,
            );
          } catch (error) {
            return {
              ...result,
              estado: 'creada, designación fallida',
              detalle: this.message(error, password),
              pendientes: ['designar_lider'],
            };
          }
        }
        return {
          ...result,
          estado: created.emailSent ? 'creada' : 'creada, correo no enviado',
          ...(created.emailSent ? {} : { pendientes: ['reenviar_correo'] }),
          ...(!created.emailSent && created.warning
            ? {
                detalle: [
                  this.message(new Error(created.warning), password),
                  replacementDetail,
                ]
                  .filter(Boolean)
                  .join('; '),
              }
            : replacementDetail
              ? { detalle: replacementDetail }
              : {}),
        };
      }
      if (operation === 'user_role') {
        const updated = await this.auth.updateUser(
          person!.id!,
          { role: (input as RoleRow).rol },
          admin.supabaseUserId,
        );
        if (updated === null)
          return { ...result, detalle: 'La persona ya no existe' };
      } else {
        const move = planned.resolvedMove;
        const destinationId =
          operation === 'user_move'
            ? (input as MoveRow).equipo_destino_id
            : (input as DesignateRow).equipo_id;
        const destinationTeam = ctx.teams.get(destinationId)!;
        if (move) {
          if (move.sourceTeamId) {
            await this.rotation.rotatePersonnel(
              {
                personnelId: move.employeeId,
                sourceTeamId: ctx.teams.get(move.sourceTeamId)!.code,
                destinationTeamId: destinationTeam.code,
              },
              admin.supabaseUserId,
            );
          } else {
            // Rotación exige origen; la edición de usuario ya incorpora a quien no tiene equipo.
            const updated = await this.auth.updateUser(
              move.employeeId,
              { teamId: destinationTeam.code },
              admin.supabaseUserId,
            );
            if (updated === null)
              return { ...result, detalle: 'La persona ya no existe' };
          }
        }
        const role =
          move?.designationRole ??
          (operation === 'leader_designate'
            ? (input as DesignateRow).rol === 'Arquitecto'
              ? 'architect'
              : 'scrum-master'
            : null);
        if (role) {
          try {
            replacementDetail = await this.designate(
              destinationId,
              destinationTeam.name,
              role,
              person!.id!,
              admin,
            );
          } catch (error) {
            if (!move) return { ...result, detalle: this.message(error) };
            const source = move.closeSourceLeader;
            let sourceStillAssigned = false;
            let sourceReadFailed = false;
            if (source) {
              try {
                sourceStillAssigned =
                  (await this.repository.findCurrentScrumMasterId(
                    source.teamId,
                  )) === source.employeeId;
              } catch {
                sourceReadFailed = true;
              }
            }
            const sourceName = source ? ctx.teams.get(source.teamId)!.name : '';
            const pendingSource = sourceStillAssigned
              ? `; además queda pendiente quitar el SM de ${sourceName} en Equipos`
              : sourceReadFailed
                ? `; además no se pudo verificar el SM de ${sourceName}: revísalo en Equipos`
                : '';
            const pendingSourceRemoval =
              sourceStillAssigned || sourceReadFailed;
            return {
              ...result,
              estado: 'aplicado, designación fallida',
              detalle: `Movimiento aplicado, designación fallida: ${this.message(error)}${pendingSource}`,
              pendientes: pendingSourceRemoval
                ? ['designar_lider', 'quitar_sm_origen']
                : ['designar_lider'],
            };
          }
        }
        if (move?.closeSourceLeader) {
          const source = move.closeSourceLeader;
          try {
            const currentId = await this.repository.findCurrentScrumMasterId(
              source.teamId,
            );
            // Sin SM vigente el cargo ya está cerrado; si es otra persona no se toca.
            if (currentId !== source.employeeId)
              return this.applied(
                result,
                replacementDetail,
                currentId
                  ? `El SM de ${ctx.teams.get(source.teamId)!.name} cambió durante la operación; no se modificó`
                  : undefined,
              );
            await this.organization.replaceTeamLeader(
              source.teamId,
              'scrum-master',
              { employeeId: null },
              admin,
            );
          } catch (error) {
            return {
              ...result,
              estado: 'aplicado, cargo de origen sin cerrar',
              detalle: [
                `Movimiento y designación aplicados, cargo de origen sin cerrar: ${this.message(error)}`,
                replacementDetail,
              ]
                .filter(Boolean)
                .join('; '),
              pendientes: ['quitar_sm_origen'],
            };
          }
        }
      }
      return this.applied(result, replacementDetail);
    } catch (error) {
      return { ...result, detalle: this.message(error, password) };
    }
  }
  private applied(
    result: RowResult,
    ...details: (string | undefined)[]
  ): RowResult {
    const detalle = details.filter(Boolean).join('; ');
    return { ...result, estado: 'aplicado', ...(detalle ? { detalle } : {}) };
  }
  /** Designa en el equipo y devuelve a quién reemplazó, si había otro líder. */
  private async designate(
    teamId: string,
    teamName: string,
    role: 'architect' | 'scrum-master',
    employeeId: string,
    admin: AuthenticatedUser,
  ): Promise<string | undefined> {
    const leaders = await this.organization.findTeamLeaders(teamId);
    const current =
      role === 'architect' ? leaders.architect : leaders.scrumMaster;
    if (current && current.id !== employeeId) {
      const leader = await this.repository.loadLeaderPerson(current);
      if (isAdmin(leader))
        throw new BadRequestException(
          `El líder actual de ${teamName} es Admin; cámbialo desde la web`,
        );
    }
    await this.organization.replaceTeamLeader(
      teamId,
      role,
      { employeeId },
      admin,
    );
    return current && current.id !== employeeId
      ? `Reemplazó a ${current.fullName} como ${role === 'architect' ? 'arquitecto' : 'Scrum Master'}`
      : undefined;
  }
  private message(error: unknown, password?: string): string {
    const detail =
      error instanceof Error
        ? error.message
        : error &&
            typeof error === 'object' &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : 'No se pudo aplicar la operación';
    return password
      ? detail.split(password).join('[contraseña oculta]')
      : detail;
  }
}

import { Test } from '@nestjs/testing';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserAdminService } from './user-admin.service';
import { UserAdminRepository } from './user-admin.repository';
import { AuthService } from '../auth/auth.service';
import { RotationService } from '../rotation/rotation.service';
import { OrganizationService } from '../organization/services/organization.service';
import { LoadConfirmationService } from '../sprints/load/load-confirmation.service';
import { CreateRow, Person, PlanContext, RowResult } from './user-admin.types';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

const admin = { supabaseUserId: 'admin', role: 'Admin' } as AuthenticatedUser;
const input: CreateRow = {
  nombre: 'Ana',
  correo: 'ana@x.com',
  rol: 'Arquitecto',
  equipo_id: 'A',
};
const person: Person = {
  id: 'ana',
  name: 'Ana',
  email: input.correo,
  role: 'Arquitecto',
  teamIds: ['A'],
  activeRoleCodes: ['ARCHITECT'],
  onVacationOrCovering: false,
  authOnly: false,
};
const changed =
  'El movimiento o cargo de origen cambió desde la vista previa; genera la vista previa de nuevo';
const invalid =
  'La confirmación no es válida o venció; genera la vista previa de nuevo';
describe('UserAdminService', () => {
  let service: UserAdminService;
  let ctx: PlanContext;
  const repo = {
    loadContext: jest.fn(),
    loadLeaderPerson: jest.fn(),
    findUsers: jest.fn(),
    consumeConfirmation: jest.fn(),
    findCurrentScrumMasterId: jest.fn(),
  };
  const auth = { createUser: jest.fn(), updateUser: jest.fn() };
  const rotation = { rotatePersonnel: jest.fn() };
  const org = { replaceTeamLeader: jest.fn(), findTeamLeaders: jest.fn() };
  beforeEach(async () => {
    jest.resetAllMocks();
    repo.loadLeaderPerson.mockResolvedValue(person);
    const used = new Set<string>();
    repo.consumeConfirmation.mockImplementation((id: string) => {
      if (used.has(id))
        throw new BadRequestException(
          'Esta confirmación ya se usó; genera la vista previa de nuevo',
        );
      used.add(id);
      return Promise.resolve();
    });
    org.findTeamLeaders.mockResolvedValue({
      architect: null,
      scrumMaster: null,
    });
    ctx = {
      ambiguousEmails: new Set(),
      people: new Map(),
      teams: new Map(
        ['A', 'B'].map((id) => [
          id,
          {
            id,
            name: id,
            code: id,
            active: true,
            hasOpenProject: true,
            leaders: { architect: null, scrumMaster: null },
          },
        ]),
      ),
    };
    repo.loadContext.mockImplementation(() => Promise.resolve(ctx));
    auth.createUser.mockResolvedValue({ personnelId: 'ana', emailSent: true });
    const module = await Test.createTestingModule({
      providers: [
        UserAdminService,
        LoadConfirmationService,
        { provide: ConfigService, useValue: { get: () => 'a'.repeat(32) } },
        { provide: UserAdminRepository, useValue: repo },
        { provide: AuthService, useValue: auth },
        { provide: RotationService, useValue: rotation },
        { provide: OrganizationService, useValue: org },
      ],
    }).compile();
    service = module.get(UserAdminService);
  });
  const token = async () =>
    (await service.previewCreate([input], admin)).rows[0].confirmationToken!;
  it.each(['mover', 'designar'] as const)(
    'bloquea correo ambiguo al %s, incluso tras emitir token',
    async (operation) => {
      const sm = {
        ...person,
        role: 'Scrum Master',
        activeRoleCodes: ['SCRUM_MASTER'],
      };
      ctx.people.set(input.correo, sm);
      ctx.teams.get('A')!.leaders.scrumMaster = {
        ...sm,
        id: 'otra',
        name: 'Otra Ana',
      };
      const row = {
        correo: input.correo,
        equipo_id: 'B',
        equipo_destino_id: 'B',
        rol: 'Scrum Master' as const,
        designar_como_lider: true,
      };
      const preview = () =>
        operation === 'mover'
          ? service.previewMove(row, admin)
          : service.previewDesignate(row, admin);
      const confirmation = (await preview()).rows[0].confirmationToken!;
      expect(confirmation).toBeTruthy();
      ctx.ambiguousEmails.add(input.correo);
      expect((await preview()).rows[0]).toMatchObject({
        errors: ['Hay varias personas con este correo; corrígelo desde la web'],
        confirmationToken: null,
      });
      const result =
        operation === 'mover'
          ? await service.applyMove(row, confirmation, admin)
          : await service.applyDesignate(row, confirmation, admin);
      expect(result.estado).toBe('falló');
      expect(org.replaceTeamLeader).not.toHaveBeenCalled();
      expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
      expect(auth.updateUser).not.toHaveBeenCalled();
    },
  );
  it('incluye el warning de correo sin exponer la contraseña', async () => {
    auth.createUser.mockImplementation(({ password }: { password: string }) =>
      Promise.resolve({
        personnelId: 'ana',
        emailSent: false,
        warning: 'Correo no disponible: ' + password,
      }),
    );
    const result = await service.applyCreate(input, await token(), admin);
    expect(result).toMatchObject({
      estado: 'creada, correo no enviado',
      detalle: 'Correo no disponible: [contraseña oculta]',
    });
    const payload = auth.createUser.mock.calls[0][0] as { password: string };
    expect(JSON.stringify(result)).not.toContain(payload.password);
  });
  it('un error bloquea los tokens de todo el lote', async () => {
    const result = await service.previewCreate(
      [input, { ...input, correo: 'otro@x.com', equipo_id: 'no' }],
      admin,
    );
    expect(result.errors).toBeGreaterThan(0);
    expect(
      result.rows.every(
        (r) => r.confirmationToken === null && r.expiresAt === null,
      ),
    ).toBe(true);
  });
  it.each(['fila', 'admin', 'contenido', 'operación', 'vencido'])(
    'rechaza token cambiado: %s',
    async (kind) => {
      const confirmation = await token();
      let result: Promise<unknown>;
      if (kind === 'operación')
        result = service.applyRole(
          { correo: input.correo, rol: input.rol },
          confirmation,
          admin,
        );
      else {
        if (kind === 'vencido')
          jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);
        result = service.applyCreate(
          {
            ...input,
            ...(kind === 'fila'
              ? { correo: 'otra@x.com' }
              : kind === 'contenido'
                ? { nombre: 'Otro' }
                : {}),
          },
          confirmation,
          kind === 'admin' ? { ...admin, supabaseUserId: 'otro' } : admin,
        );
      }
      await expect(result).rejects.toThrow(new BadRequestException(invalid));
      jest.restoreAllMocks();
      expect(auth.createUser).not.toHaveBeenCalled();
    },
  );
  it('no expone contraseña en respuestas, token ni logs y propaga auditoría', async () => {
    const logs = ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'].map(
      (method) =>
        jest
          .spyOn(Logger.prototype, method as 'log')
          .mockImplementation(() => undefined),
    );
    const preview = await service.previewCreate([input], admin);
    const result = await service.applyCreate(
      input,
      preview.rows[0].confirmationToken!,
      admin,
    );
    const payload = auth.createUser.mock.calls[0][0] as { password: string };
    expect(payload.password.length).toBeGreaterThan(20);
    expect(repo.consumeConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
      auth.createUser.mock.invocationCallOrder[0],
    );
    expect(auth.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: 'admin',
        emailConfirm: true,
        sendPasswordEmail: true,
      }),
    );
    expect(
      JSON.stringify([preview, result, logs.map((log) => log.mock.calls)]),
    ).not.toContain(payload.password);
    expect(
      Buffer.from(
        preview.rows[0].confirmationToken!.split('.')[0],
        'base64url',
      ).toString(),
    ).not.toContain(payload.password);
    jest.restoreAllMocks();
  });
  it('reporta correo no enviado', async () => {
    auth.createUser.mockResolvedValue({ personnelId: 'ana', emailSent: false });
    expect(
      await service.applyCreate(input, await token(), admin),
    ).toMatchObject({
      estado: 'creada, correo no enviado',
      pendientes: ['reenviar_correo'],
    });
  });
  it('conserva el alta cuando falla la designación', async () => {
    const row = { ...input, designar_como_lider: true };
    const preview = await service.previewCreate([row], admin);
    org.replaceTeamLeader.mockRejectedValue(new Error('No disponible'));
    expect(
      await service.applyCreate(row, preview.rows[0].confirmationToken!, admin),
    ).toMatchObject({
      estado: 'creada, designación fallida',
      detalle: 'No disponible',
      pendientes: ['designar_lider'],
    });
    expect(org.replaceTeamLeader).toHaveBeenCalledWith(
      'A',
      'architect',
      { employeeId: 'ana' },
      admin,
    );
    expect(auth.createUser).toHaveBeenCalledTimes(1);
  });
  it('revalida y omite un correo creado después del preview', async () => {
    const confirmation = await token();
    ctx.people.set(input.correo, person);
    expect((await service.applyCreate(input, confirmation, admin)).estado).toBe(
      'omitida',
    );
    expect(auth.createUser).not.toHaveBeenCalled();
  });
  it('continúa las filas independientes tras un fallo', async () => {
    const rows = [
      input,
      { ...input, correo: 'dos@x.com' },
      { ...input, correo: 'tres@x.com' },
    ];
    const preview = await service.previewCreate(rows, admin);
    auth.createUser
      .mockResolvedValueOnce({ personnelId: 'ana', emailSent: true })
      .mockRejectedValueOnce(new Error('Fallo de alta'))
      .mockResolvedValueOnce({ personnelId: 'tres', emailSent: true });
    const results: RowResult[] = [];
    for (const [i, row] of rows.entries())
      results.push(
        await service.applyCreate(
          row,
          preview.rows[i].confirmationToken!,
          admin,
        ),
      );
    expect(results.map((r) => r.estado)).toEqual(['creada', 'falló', 'creada']);
    expect(results[1].detalle).toBe('Fallo de alta');
    expect(results[1]).not.toHaveProperty('stack');
  });
  it('no emite tokens para cambios de rol ni designaciones sin cambios', async () => {
    ctx.people.set(input.correo, person);
    ctx.teams.get('A')!.leaders.architect = person;
    expect(
      (
        await service.previewRole(
          { correo: input.correo, rol: input.rol },
          admin,
        )
      ).rows[0].confirmationToken,
    ).toBeNull();
    expect(
      (
        await service.previewDesignate(
          { correo: input.correo, rol: 'Arquitecto', equipo_id: 'A' },
          admin,
        )
      ).rows[0].confirmationToken,
    ).toBeNull();
  });
  it('omite si el rol ya cambió tras el preview', async () => {
    ctx.people.set(input.correo, person);
    const row = { correo: input.correo, rol: 'Ingeniero de QA' as const };
    const preview = await service.previewRole(row, admin);
    ctx.people.set(input.correo, { ...person, role: row.rol });
    expect(
      (await service.applyRole(row, preview.rows[0].confirmationToken!, admin))
        .estado,
    ).toBe('omitida');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('cambia el rol usando AuthService', async () => {
    ctx.people.set(input.correo, person);
    const row = { correo: input.correo, rol: 'Ingeniero de QA' as const };
    const preview = await service.previewRole(row, admin);
    expect(
      (await service.applyRole(row, preview.rows[0].confirmationToken!, admin))
        .estado,
    ).toBe('aplicado');
    expect(repo.consumeConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updateUser.mock.invocationCallOrder[0],
    );
    expect(auth.updateUser).toHaveBeenCalledWith(
      'ana',
      { role: row.rol },
      'admin',
    );
  });
  describe.each(['user_role', 'leader_designate'] as const)(
    'identidad confirmada para %s',
    (operation) => {
      const row = {
        correo: input.correo,
        rol: 'Arquitecto' as const,
        equipo_id: 'A',
      };
      const preview = () =>
        operation === 'user_role'
          ? service.previewRole(row, admin)
          : service.previewDesignate(row, admin);
      const apply = (confirmation: string) =>
        operation === 'user_role'
          ? service.applyRole(row, confirmation, admin)
          : service.applyDesignate(row, confirmation, admin);
      const original = { ...person, role: 'Ingeniero de QA' };
      beforeEach(() => {
        ctx.people.set(
          input.correo,
          operation === 'user_role' ? original : person,
        );
      });
      it.each(['otra persona', 'persona inexistente'])(
        'rechaza el correo que ahora corresponde a %s',
        async (change) => {
          const confirmation = (await preview()).rows[0].confirmationToken!;
          if (change === 'persona inexistente') ctx.people.delete(input.correo);
          else
            ctx.people.set(input.correo, {
              ...ctx.people.get(input.correo)!,
              id: 'otra-persona',
            });

          expect(await apply(confirmation)).toMatchObject({
            estado: 'falló',
            detalle:
              'La persona cambió desde la vista previa; genera la vista previa de nuevo',
          });
          expect(auth.updateUser).not.toHaveBeenCalled();
          expect(org.replaceTeamLeader).not.toHaveBeenCalled();
        },
      );
      it('aplica si sigue siendo la misma persona', async () => {
        const confirmation = (await preview()).rows[0].confirmationToken!;
        expect(await apply(confirmation)).toMatchObject({ estado: 'aplicado' });
        if (operation === 'user_role')
          expect(auth.updateUser).toHaveBeenCalledWith(
            person.id,
            { role: row.rol },
            admin.supabaseUserId,
          );
        else
          expect(org.replaceTeamLeader).toHaveBeenCalledWith(
            row.equipo_id,
            'architect',
            { employeeId: person.id },
            admin,
          );
      });
      it('rechaza alterar el empleado firmado antes de consumir', async () => {
        const parts = (await preview()).rows[0].confirmationToken!.split('.');
        parts[2] = Buffer.from(
          JSON.stringify({ employeeId: 'otra-persona' }),
        ).toString('base64url');

        await expect(apply(parts.join('.'))).rejects.toThrow(
          BadRequestException,
        );
        expect(repo.consumeConfirmation).not.toHaveBeenCalled();
        expect(auth.updateUser).not.toHaveBeenCalled();
        expect(org.replaceTeamLeader).not.toHaveBeenCalled();
      });
    },
  );
  it('mueve y designa con el Admin del token', async () => {
    ctx.people.set(input.correo, person);
    const row = {
      correo: input.correo,
      equipo_destino_id: 'B',
      designar_como_lider: true,
    };
    const preview = await service.previewMove(row, admin);
    expect(
      (await service.applyMove(row, preview.rows[0].confirmationToken!, admin))
        .estado,
    ).toBe('aplicado');
    expect(repo.consumeConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
      rotation.rotatePersonnel.mock.invocationCallOrder[0],
    );
    expect(repo.consumeConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
      org.replaceTeamLeader.mock.invocationCallOrder[0],
    );
    expect(rotation.rotatePersonnel).toHaveBeenCalledWith(
      { personnelId: 'ana', sourceTeamId: 'A', destinationTeamId: 'B' },
      'admin',
    );
    expect(org.replaceTeamLeader).toHaveBeenCalledWith(
      'B',
      'architect',
      { employeeId: 'ana' },
      admin,
    );
  });
  it.each([true, false])(
    'mueve con códigos y designa con UUID (origen explícito: %s)',
    async (explicitSource) => {
      const sourceId = '12345678-1234-4234-8234-123456789abc';
      const destinationId = '87654321-4321-4321-8321-cba987654321';
      ctx.teams = new Map([
        [
          sourceId,
          { ...ctx.teams.get('A')!, id: sourceId, code: 'equipo-alfa' },
        ],
        [
          destinationId,
          { ...ctx.teams.get('B')!, id: destinationId, code: 'equipo-beta' },
        ],
      ]);
      ctx.people.set(input.correo, { ...person, teamIds: [sourceId] });
      const row = {
        correo: input.correo,
        equipo_destino_id: destinationId,
        ...(explicitSource ? { equipo_origen_id: sourceId } : {}),
        designar_como_lider: true,
      };
      const preview = await service.previewMove(row, admin);
      const confirmation = preview.rows[0].confirmationToken!;
      expect(
        JSON.parse(
          Buffer.from(confirmation.split('.')[2], 'base64url').toString(),
        ),
      ).toEqual({
        employeeId: person.id,
        sourceTeamId: sourceId,
        designationRole: 'architect',
      });
      expect((await service.applyMove(row, confirmation, admin)).estado).toBe(
        'aplicado',
      );
      expect(rotation.rotatePersonnel).toHaveBeenCalledWith(
        {
          personnelId: person.id,
          sourceTeamId: 'equipo-alfa',
          destinationTeamId: 'equipo-beta',
        },
        admin.supabaseUserId,
      );
      expect(org.replaceTeamLeader).toHaveBeenCalledWith(
        destinationId,
        'architect',
        { employeeId: person.id },
        admin,
      );
    },
  );
  it.each(['A', 'B'])(
    'falla en español si el equipo %s ya no está en el contexto',
    async (teamId) => {
      ctx.people.set(input.correo, person);
      const row = { correo: input.correo, equipo_destino_id: 'B' };
      const preview = await service.previewMove(row, admin);
      ctx.teams.delete(teamId);
      const result = await service.applyMove(
        row,
        preview.rows[0].confirmationToken!,
        admin,
      );
      expect(result).toMatchObject({
        estado: 'falló',
        detalle: expect.stringMatching(/equipo.*(no existe|no se encontr)/i),
      });
      expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
      expect(org.replaceTeamLeader).not.toHaveBeenCalled();
    },
  );
  it('designa y rechaza una confirmación ya aplicada', async () => {
    ctx.people.set(input.correo, person);
    const row = {
      correo: input.correo,
      equipo_id: 'A',
      rol: 'Arquitecto' as const,
    };
    const preview = await service.previewDesignate(row, admin);
    expect(
      (
        await service.applyDesignate(
          row,
          preview.rows[0].confirmationToken!,
          admin,
        )
      ).estado,
    ).toBe('aplicado');
    expect(repo.consumeConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
      org.replaceTeamLeader.mock.invocationCallOrder[0],
    );
    ctx.teams.get('A')!.leaders.architect = person;
    await expect(
      service.applyDesignate(row, preview.rows[0].confirmationToken!, admin),
    ).rejects.toThrow(
      new BadRequestException(
        'Esta confirmación ya se usó; genera la vista previa de nuevo',
      ),
    );
    expect(org.replaceTeamLeader).toHaveBeenCalledTimes(1);
  });
  it('devuelve falló si la revalidación encuentra errores', async () => {
    const confirmation = await token();
    ctx.teams.get('A')!.active = false;
    expect((await service.applyCreate(input, confirmation, admin)).estado).toBe(
      'falló',
    );
    expect(auth.createUser).not.toHaveBeenCalled();
  });
  it('delega búsquedas', async () => {
    repo.findUsers.mockResolvedValue([]);
    expect(await service.findUsers({ texto: 'Ana' })).toEqual([]);
    expect(repo.findUsers).toHaveBeenCalledWith({ texto: 'Ana' });
  });
  it('carga los equipos de la persona para resolver origen y avisos', async () => {
    ctx.people.set(input.correo, person);
    const source = ctx.teams.get('A')!;
    ctx.teams.delete('A');
    repo.loadContext.mockResolvedValueOnce(ctx).mockResolvedValueOnce({
      ambiguousEmails: new Set(),
      people: new Map(),
      teams: new Map([['A', source]]),
    });
    const row = { correo: input.correo, equipo_destino_id: 'B' };
    const preview = await service.previewMove(row, admin);
    expect(repo.loadContext).toHaveBeenNthCalledWith(2, {
      emails: [],
      teamIds: ['A'],
    });
    expect(preview.errors).toBe(0);
    expect(preview.rows[0].summary).toContain('de A a B');
  });
  it('convierte el UUID al código esperado por el RPC de alta', async () => {
    ctx.teams.get('A')!.code = 'equipo-alfa';
    await service.applyCreate(input, await token(), admin);
    expect(auth.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'equipo-alfa' }),
    );
  });
  it('oculta la contraseña incluso si un error de alta la contiene', async () => {
    auth.createUser.mockImplementation(({ password }: { password: string }) =>
      Promise.reject(new Error('Error con ' + password)),
    );
    const result = await service.applyCreate(input, await token(), admin);
    const password = (auth.createUser.mock.calls[0][0] as { password: string })
      .password;
    expect(result.estado).toBe('falló');
    expect(result.detalle).toBe('Error con [contraseña oculta]');
    expect(JSON.stringify(result)).not.toContain(password);
  });
  it('consume una sola vez antes del alta y usa el empleado del Admin', async () => {
    const actor = {
      ...admin,
      personnelId: 'codigo-admin',
      employeeId: '11111111-1111-4111-8111-111111111111',
    };
    const preview = await service.previewCreate([input], actor);
    const confirmation = preview.rows[0].confirmationToken!;
    await service.applyCreate(input, confirmation, actor);
    expect(repo.consumeConfirmation).toHaveBeenCalledWith(
      expect.any(String),
      'user_create',
      '11111111-1111-4111-8111-111111111111',
    );
    auth.createUser.mockClear();
    await expect(
      service.applyCreate(input, confirmation, actor),
    ).rejects.toThrow(BadRequestException);
    expect(auth.createUser).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
    expect(org.replaceTeamLeader).not.toHaveBeenCalled();
  });
  it('oculta errores de BD al consumir y no llama a servicios', async () => {
    repo.consumeConfirmation.mockRejectedValue(
      new Error('detalle interno de BD'),
    );
    expect(await service.applyCreate(input, await token(), admin)).toEqual({
      row: 1,
      correo: input.correo,
      estado: 'falló',
      detalle: 'No se pudo consumir la confirmación',
    });
    expect(auth.createUser).not.toHaveBeenCalled();
  });
  it('conserva consumida la confirmación cuando falla la escritura posterior', async () => {
    const confirmation = await token();
    auth.createUser.mockRejectedValue(new Error('Fallo de alta'));
    expect((await service.applyCreate(input, confirmation, admin)).estado).toBe(
      'falló',
    );
    await expect(
      service.applyCreate(input, confirmation, admin),
    ).rejects.toThrow(BadRequestException);
    expect(auth.createUser).toHaveBeenCalledTimes(1);
    expect(repo.consumeConfirmation).toHaveBeenCalledWith(
      expect.any(String),
      'user_create',
      null,
    );
  });
  it.each(['origen', 'empleado', 'ambiguo'])(
    'fija el movimiento resuelto: cambio de %s',
    async (change) => {
      ctx.people.set(input.correo, { ...person });
      const row = { correo: input.correo, equipo_destino_id: 'B' };
      const preview = await service.previewMove(row, admin);
      ctx.people.set(input.correo, {
        ...person,
        ...(change === 'empleado'
          ? { id: 'otro' }
          : { teamIds: change === 'ambiguo' ? ['A', 'C'] : ['C'] }),
      });
      expect(
        await service.applyMove(row, preview.rows[0].confirmationToken!, admin),
      ).toMatchObject({
        estado: 'falló',
        detalle: changed,
      });
      expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
    },
  );
  it('rechaza la alteración del contexto resuelto del token', async () => {
    ctx.people.set(input.correo, person);
    const row = { correo: input.correo, equipo_destino_id: 'B' };
    const preview = await service.previewMove(row, admin);
    const parts = preview.rows[0].confirmationToken!.split('.');
    parts[2] = Buffer.from(
      JSON.stringify({
        employeeId: 'ana',
        sourceTeamId: 'C',
        designationRole: null,
      }),
    ).toString('base64url');
    await expect(
      service.applyMove(row, parts.join('.'), admin),
    ).rejects.toThrow(BadRequestException);
    expect(repo.consumeConfirmation).not.toHaveBeenCalled();
    expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
  });
  it('reporta movimiento aplicado si falla la designación', async () => {
    ctx.people.set(input.correo, person);
    const row = {
      correo: input.correo,
      equipo_destino_id: 'B',
      designar_como_lider: true,
    };
    const preview = await service.previewMove(row, admin);
    org.replaceTeamLeader.mockRejectedValue(new Error('No disponible'));
    expect(
      await service.applyMove(row, preview.rows[0].confirmationToken!, admin),
    ).toMatchObject({
      estado: 'aplicado, designación fallida',
      detalle: 'Movimiento aplicado, designación fallida: No disponible',
      pendientes: ['designar_lider'],
    });
    expect(rotation.rotatePersonnel).toHaveBeenCalledTimes(1);
  });
  it.each(['alta', 'movimiento', 'designación'])(
    'informa el líder actual reemplazado en %s',
    async (operation) => {
      const leader = { ...person, id: 'anterior', name: 'Luis' };
      ctx.teams.get('A')!.leaders.architect = leader;
      ctx.teams.get('B')!.leaders.architect = leader;
      if (operation !== 'alta') ctx.people.set(input.correo, person);
      const create = { ...input, designar_como_lider: true };
      const move = {
        correo: input.correo,
        equipo_destino_id: 'B',
        designar_como_lider: true,
      };
      const designate = {
        correo: input.correo,
        equipo_id: 'A',
        rol: 'Arquitecto' as const,
      };
      const preview =
        operation === 'alta'
          ? await service.previewCreate([create], admin)
          : operation === 'movimiento'
            ? await service.previewMove(move, admin)
            : await service.previewDesignate(designate, admin);
      org.findTeamLeaders.mockResolvedValue({
        architect: { id: 'nuevo', fullName: 'Marta' },
        scrumMaster: null,
      });
      const confirmation = preview.rows[0].confirmationToken!;
      const result =
        operation === 'alta'
          ? await service.applyCreate(create, confirmation, admin)
          : operation === 'movimiento'
            ? await service.applyMove(move, confirmation, admin)
            : await service.applyDesignate(designate, confirmation, admin);
      expect(result.estado).toBe(operation === 'alta' ? 'creada' : 'aplicado');
      expect(result.detalle).toBe('Reemplazó a Marta como arquitecto');
      expect(org.replaceTeamLeader).toHaveBeenCalledTimes(1);
    },
  );
  describe.each([
    'alta',
    'movimiento',
    'designar con movimiento',
    'designar',
  ] as const)('revalida los roles del líder vigente: %s', (operation) => {
    const teamId = operation === 'alta' || operation === 'designar' ? 'A' : 'B';
    const row = {
      ...input,
      rol: 'Arquitecto' as const,
      equipo_id: teamId,
      equipo_destino_id: teamId,
      designar_como_lider: true,
    };
    const current = {
      id: 'nuevo-lider',
      fullName: 'Marta',
      email: input.correo,
    };
    const preview = () =>
      operation === 'alta'
        ? service.previewCreate([row], admin)
        : operation === 'movimiento'
          ? service.previewMove(row, admin)
          : service.previewDesignate(row, admin);
    const apply = (token: string) =>
      operation === 'alta'
        ? service.applyCreate(row, token, admin)
        : operation === 'movimiento'
          ? service.applyMove(row, token, admin)
          : service.applyDesignate(row, token, admin);
    beforeEach(() => {
      if (operation !== 'alta') ctx.people.set(input.correo, person);
    });
    it.each(['primario', 'secundario', 'error', 'no Admin'] as const)(
      'consulta por UUID y maneja líder %s aparecido durante la operación',
      async (kind) => {
        const token = (await preview()).rows[0].confirmationToken!;
        expect(token).toBeTruthy();
        const changeLeader = () => {
          org.findTeamLeaders.mockResolvedValue({
            architect: current,
            scrumMaster: null,
          });
        };
        if (operation === 'alta')
          auth.createUser.mockImplementationOnce(() => {
            changeLeader();
            return Promise.resolve({ personnelId: 'ana', emailSent: true });
          });
        else if (operation === 'designar') changeLeader();
        else
          rotation.rotatePersonnel.mockImplementationOnce(() => {
            changeLeader();
            return Promise.resolve();
          });
        if (kind === 'error')
          repo.loadLeaderPerson.mockRejectedValue(
            new Error('No se pudo cargar roles'),
          );
        else
          repo.loadLeaderPerson.mockResolvedValue({
            ...person,
            id: current.id,
            role: kind === 'primario' ? 'Admin' : 'Arquitecto',
            activeRoleCodes:
              kind === 'secundario' ? ['ARCHITECT', 'ADMIN'] : ['ARCHITECT'],
          });

        const result = await apply(token);
        expect(repo.loadLeaderPerson).toHaveBeenCalledWith(current);
        expect(org.findTeamLeaders.mock.invocationCallOrder[0]).toBeLessThan(
          repo.loadLeaderPerson.mock.invocationCallOrder[0],
        );
        if (operation !== 'alta' && operation !== 'designar')
          expect(rotation.rotatePersonnel).toHaveBeenCalledTimes(1);
        if (kind === 'no Admin') {
          expect(result).toMatchObject({
            estado: operation === 'alta' ? 'creada' : 'aplicado',
            detalle: 'Reemplazó a Marta como arquitecto',
          });
          expect(org.replaceTeamLeader).toHaveBeenCalledWith(
            teamId,
            'architect',
            { employeeId: 'ana' },
            admin,
          );
          expect(
            repo.loadLeaderPerson.mock.invocationCallOrder[0],
          ).toBeLessThan(org.replaceTeamLeader.mock.invocationCallOrder[0]);
        } else {
          const reason =
            kind === 'error'
              ? 'No se pudo cargar roles'
              : `El líder actual de ${teamId} es Admin; cámbialo desde la web`;
          expect(result).toEqual({
            row: 1,
            correo: input.correo,
            estado:
              operation === 'alta'
                ? 'creada, designación fallida'
                : operation === 'designar'
                  ? 'falló'
                  : 'aplicado, designación fallida',
            detalle:
              operation === 'alta' || operation === 'designar'
                ? reason
                : `Movimiento aplicado, designación fallida: ${reason}`,
            ...(operation === 'designar'
              ? {}
              : { pendientes: ['designar_lider'] }),
          });
          expect(org.replaceTeamLeader).not.toHaveBeenCalled();
        }
      },
    );
    it('no consulta roles si el líder releído es la propia persona', async () => {
      const token = (await preview()).rows[0].confirmationToken!;
      org.findTeamLeaders.mockResolvedValue({
        architect: { ...current, id: person.id },
        scrumMaster: null,
      });
      expect((await apply(token)).estado).toBe(
        operation === 'alta' ? 'creada' : 'aplicado',
      );
      expect(repo.loadLeaderPerson).not.toHaveBeenCalled();
      expect(org.replaceTeamLeader).toHaveBeenCalledTimes(1);
    });
  });
  it('solo un apply concurrente escribe cuando el segundo consumo falla con 23505', async () => {
    const confirmation = await token();
    repo.consumeConfirmation
      .mockReset()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ code: '23505' });

    const results = await Promise.all([
      service.applyCreate(input, confirmation, admin),
      service.applyCreate(input, confirmation, admin),
    ]);

    expect(results.map((result) => result.estado).sort()).toEqual([
      'creada',
      'falló',
    ]);
    expect(repo.consumeConfirmation).toHaveBeenCalledTimes(2);
    expect(repo.consumeConfirmation.mock.calls[0]).toEqual(
      repo.consumeConfirmation.mock.calls[1],
    );
    expect(auth.createUser).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
    expect(org.replaceTeamLeader).not.toHaveBeenCalled();
  });
  it.each(['error', 'no-op'])(
    'consume el token aunque el re-plan produzca %s',
    async (outcome) => {
      const confirmation = await token();
      if (outcome === 'error') ctx.teams.get('A')!.active = false;
      else ctx.people.set(input.correo, person);

      const result = await service.applyCreate(input, confirmation, admin);

      expect(result.estado).toBe(outcome === 'error' ? 'falló' : 'omitida');
      expect(repo.consumeConfirmation).toHaveBeenCalledTimes(1);
      expect(repo.consumeConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
        repo.loadContext.mock.invocationCallOrder[1],
      );
      await expect(
        service.applyCreate(input, confirmation, admin),
      ).rejects.toThrow(BadRequestException);
      expect(auth.createUser).not.toHaveBeenCalled();
    },
  );
  it('rechaza mover y designar si cambia de Arquitecto a Scrum Master', async () => {
    ctx.people.set(input.correo, person);
    const row = {
      correo: input.correo,
      equipo_destino_id: 'B',
      designar_como_lider: true,
    };
    const preview = await service.previewMove(row, admin);
    expect(preview.rows[0].resolvedMove).toMatchObject({
      designationRole: 'architect',
    });
    ctx.people.set(input.correo, {
      ...person,
      role: 'Scrum Master',
      activeRoleCodes: ['SCRUM_MASTER'],
    });

    expect(
      await service.applyMove(row, preview.rows[0].confirmationToken!, admin),
    ).toMatchObject({
      estado: 'falló',
      detalle: changed,
    });
    expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
    expect(org.replaceTeamLeader).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'firma el cargo resuelto de un Scrum Master (designar: %s)',
    async (designate) => {
      ctx.people.set(input.correo, {
        ...person,
        role: 'Scrum Master',
        activeRoleCodes: ['SCRUM_MASTER'],
      });
      const row = {
        correo: input.correo,
        equipo_destino_id: 'B',
        designar_como_lider: designate,
      };
      const preview = await service.previewMove(row, admin);
      const confirmation = preview.rows[0].confirmationToken!;
      const parts = confirmation.split('.');
      const resolved = JSON.parse(
        Buffer.from(parts[2], 'base64url').toString(),
      ) as { designationRole: string | null };
      expect(resolved.designationRole).toBe(designate ? 'scrum-master' : null);
      parts[2] = Buffer.from(
        JSON.stringify({ ...resolved, designationRole: 'architect' }),
      ).toString('base64url');
      await expect(
        service.applyMove(row, parts.join('.'), admin),
      ).rejects.toThrow(BadRequestException);
      expect(repo.consumeConfirmation).not.toHaveBeenCalled();

      expect((await service.applyMove(row, confirmation, admin)).estado).toBe(
        'aplicado',
      );
      if (designate)
        expect(org.replaceTeamLeader).toHaveBeenCalledWith(
          'B',
          'scrum-master',
          { employeeId: 'ana' },
          admin,
        );
      else expect(org.replaceTeamLeader).not.toHaveBeenCalled();
    },
  );
  describe.each(['designar', 'mover'] as const)(
    'movimiento con cierre: %s',
    (op) => {
      const row = {
        correo: input.correo,
        equipo_id: 'B',
        equipo_destino_id: 'B',
        rol: 'Scrum Master' as const,
        designar_como_lider: true,
      };
      const preview = () =>
        op === 'designar'
          ? service.previewDesignate(row, admin)
          : service.previewMove(row, admin);
      const apply = (token: string) =>
        op === 'designar'
          ? service.applyDesignate(row, token, admin)
          : service.applyMove(row, token, admin);
      beforeEach(() => {
        const sm = {
          ...person,
          role: 'Scrum Master',
          activeRoleCodes: ['SCRUM_MASTER'],
        };
        ctx.people.set(input.correo, sm);
        ctx.teams.get('A')!.leaders.scrumMaster = sm;
        repo.findCurrentScrumMasterId.mockResolvedValue(sm.id);
      });
      it('rota, designa y cierra en orden con auditoría', async () => {
        expect(
          await apply((await preview()).rows[0].confirmationToken!),
        ).toMatchObject({ estado: 'aplicado' });
        expect(rotation.rotatePersonnel).toHaveBeenCalledWith(
          { personnelId: 'ana', sourceTeamId: 'A', destinationTeamId: 'B' },
          'admin',
        );
        expect(org.replaceTeamLeader.mock.calls).toEqual([
          ['B', 'scrum-master', { employeeId: 'ana' }, admin],
          ['A', 'scrum-master', { employeeId: null }, admin],
        ]);
        expect(
          rotation.rotatePersonnel.mock.invocationCallOrder[0],
        ).toBeLessThan(org.replaceTeamLeader.mock.invocationCallOrder[0]);
        expect(repo.findCurrentScrumMasterId).toHaveBeenCalledWith('A');
        expect(org.replaceTeamLeader.mock.invocationCallOrder[0]).toBeLessThan(
          repo.findCurrentScrumMasterId.mock.invocationCallOrder[0],
        );
        expect(
          repo.findCurrentScrumMasterId.mock.invocationCallOrder[0],
        ).toBeLessThan(org.replaceTeamLeader.mock.invocationCallOrder[1]);
      });
      it.each(['otra persona', 'ninguno'])(
        'no cierra el origen si su SM cambia a %s durante la designación',
        async (change) => {
          const token = (await preview()).rows[0].confirmationToken!;
          org.replaceTeamLeader.mockImplementationOnce(() => {
            repo.findCurrentScrumMasterId.mockResolvedValue(
              change === 'ninguno' ? null : 'nuevo-sm',
            );
            return Promise.resolve({});
          });

          const result = await apply(token);
          expect(result.estado).toBe('aplicado');
          expect(result.detalle).toBe(
            change === 'ninguno'
              ? undefined
              : 'El SM de A cambió durante la operación; no se modificó',
          );
          expect(result.pendientes).toBeUndefined();
          expect(rotation.rotatePersonnel).toHaveBeenCalledTimes(1);
          expect(org.replaceTeamLeader.mock.calls).toEqual([
            ['B', 'scrum-master', { employeeId: 'ana' }, admin],
          ]);
          expect(repo.findCurrentScrumMasterId).toHaveBeenCalledWith('A');
        },
      );
      it('conserva el resultado parcial si falla la relectura del SM de origen', async () => {
        const token = (await preview()).rows[0].confirmationToken!;
        repo.findCurrentScrumMasterId.mockRejectedValue(
          new Error('No se pudo consultar el SM vigente'),
        );

        expect(await apply(token)).toMatchObject({
          estado: 'aplicado, cargo de origen sin cerrar',
          detalle:
            'Movimiento y designación aplicados, cargo de origen sin cerrar: No se pudo consultar el SM vigente',
          pendientes: ['quitar_sm_origen'],
        });
        expect(org.replaceTeamLeader.mock.calls).toEqual([
          ['B', 'scrum-master', { employeeId: 'ana' }, admin],
        ]);
      });
      it.each(['sin cambios', 'otro SM', 'sin titular', 'error de relectura'])(
        'designación fallida con origen: %s',
        async (current) => {
          const token = (await preview()).rows[0].confirmationToken!;
          org.replaceTeamLeader.mockImplementationOnce(() => {
            if (current === 'error de relectura')
              repo.findCurrentScrumMasterId.mockRejectedValue(
                new Error('Consulta no disponible'),
              );
            else
              repo.findCurrentScrumMasterId.mockResolvedValue(
                current === 'sin cambios'
                  ? 'ana'
                  : current === 'otro SM'
                    ? 'nuevo-sm'
                    : null,
              );
            return Promise.reject(new Error('Designación no disponible'));
          });

          const result = await apply(token);
          const pendingSource = current === 'sin cambios';
          const sourceReadFailed = current === 'error de relectura';
          expect(result).toMatchObject({
            estado: 'aplicado, designación fallida',
            pendientes:
              pendingSource || sourceReadFailed
                ? ['designar_lider', 'quitar_sm_origen']
                : ['designar_lider'],
            detalle:
              'Movimiento aplicado, designación fallida: Designación no disponible' +
              (pendingSource
                ? '; además queda pendiente quitar el SM de A en Equipos'
                : sourceReadFailed
                  ? '; además no se pudo verificar el SM de A: revísalo en Equipos'
                  : ''),
          });
          expect(repo.findCurrentScrumMasterId).toHaveBeenCalledTimes(1);
          expect(repo.findCurrentScrumMasterId).toHaveBeenCalledWith('A');
          expect(
            org.replaceTeamLeader.mock.invocationCallOrder[0],
          ).toBeLessThan(
            repo.findCurrentScrumMasterId.mock.invocationCallOrder[0],
          );
          expect(rotation.rotatePersonnel).toHaveBeenCalledTimes(1);
          expect(org.replaceTeamLeader.mock.calls).toEqual([
            ['B', 'scrum-master', { employeeId: 'ana' }, admin],
          ]);
        },
      );
      it.each(['sin cambios', 'otro SM', 'sin titular', 'error de relectura'])(
        'no reemplaza Admin y conserva pendientes según origen: %s',
        async (current) => {
          const token = (await preview()).rows[0].confirmationToken!;
          rotation.rotatePersonnel.mockImplementationOnce(() => {
            org.findTeamLeaders.mockResolvedValue({
              architect: null,
              scrumMaster: {
                id: 'admin-destino',
                fullName: 'Admin',
                email: 'admin@x.com',
              },
            });
            if (current === 'error de relectura')
              repo.findCurrentScrumMasterId.mockRejectedValue(
                new Error('Consulta no disponible'),
              );
            else
              repo.findCurrentScrumMasterId.mockResolvedValue(
                current === 'sin cambios'
                  ? 'ana'
                  : current === 'otro SM'
                    ? 'otro'
                    : null,
              );
            return Promise.resolve();
          });
          repo.loadLeaderPerson.mockResolvedValue({
            ...person,
            id: 'admin-destino',
            activeRoleCodes: ['SCRUM_MASTER', 'ADMIN'],
          });
          expect(await apply(token)).toMatchObject({
            estado: 'aplicado, designación fallida',
            detalle:
              'Movimiento aplicado, designación fallida: El líder actual de B es Admin; cámbialo desde la web' +
              (current === 'sin cambios'
                ? '; además queda pendiente quitar el SM de A en Equipos'
                : current === 'error de relectura'
                  ? '; además no se pudo verificar el SM de A: revísalo en Equipos'
                  : ''),
            pendientes:
              current === 'sin cambios' || current === 'error de relectura'
                ? ['designar_lider', 'quitar_sm_origen']
                : ['designar_lider'],
          });
          expect(repo.findCurrentScrumMasterId).toHaveBeenCalledTimes(1);
          expect(repo.findCurrentScrumMasterId).toHaveBeenCalledWith('A');
          expect(org.replaceTeamLeader).not.toHaveBeenCalled();
        },
      );
      it.each([1, 2, 3])(
        'conserva el resultado parcial al fallar paso %s',
        async (step) => {
          const token = (await preview()).rows[0].confirmationToken!;
          if (step === 1)
            rotation.rotatePersonnel.mockRejectedValue(
              new Error('Movimiento no disponible'),
            );
          else if (step === 2)
            org.replaceTeamLeader.mockRejectedValueOnce(
              new Error('Designación no disponible'),
            );
          else
            org.replaceTeamLeader
              .mockResolvedValueOnce({})
              .mockRejectedValueOnce(new Error('Cierre no disponible'));
          const result = await apply(token);
          expect(result.estado).toBe(
            step === 1
              ? 'falló'
              : step === 2
                ? 'aplicado, designación fallida'
                : 'aplicado, cargo de origen sin cerrar',
          );
          expect(result.detalle).toContain('no disponible');
          if (step === 2)
            expect(result.detalle).toContain(
              '; además queda pendiente quitar el SM de A en Equipos',
            );
          expect(result.pendientes).toEqual(
            step === 1
              ? undefined
              : step === 2
                ? ['designar_lider', 'quitar_sm_origen']
                : ['quitar_sm_origen'],
          );
          expect(org.replaceTeamLeader).toHaveBeenCalledTimes(step - 1);
        },
      );
      it.each(['cambio de SM', 'fallo del cierre'])(
        'conserva el reemplazo en el detalle tras %s',
        async (kind) => {
          ctx.teams.get('B')!.leaders.scrumMaster = {
            ...person,
            id: 'anterior',
            name: 'Luis',
          };
          const token = (await preview()).rows[0].confirmationToken!;
          org.findTeamLeaders.mockResolvedValue({
            architect: null,
            scrumMaster: { id: 'anterior', fullName: 'Luis' },
          });
          if (kind === 'cambio de SM')
            repo.findCurrentScrumMasterId.mockResolvedValue('nuevo-sm');
          else
            org.replaceTeamLeader
              .mockResolvedValueOnce({})
              .mockRejectedValueOnce(new Error('Cierre no disponible'));
          const result = await apply(token);
          expect(result.detalle).toContain(
            'Reemplazó a Luis como Scrum Master',
          );
        },
      );
      it('rechaza si cambia el cierre del origen', async () => {
        const token = (await preview()).rows[0].confirmationToken!;
        ctx.teams.get('A')!.leaders.scrumMaster = null;
        expect(await apply(token)).toMatchObject({
          estado: 'falló',
          detalle: expect.stringContaining('genera la vista previa de nuevo'),
        });
        expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
      });
      it('rechaza alterar el cierre firmado', async () => {
        const parts = (await preview()).rows[0].confirmationToken!.split('.');
        const resolved = JSON.parse(
          Buffer.from(parts[2], 'base64url').toString(),
        ) as Record<string, unknown>;
        resolved.closeSourceLeader = null;
        parts[2] = Buffer.from(JSON.stringify(resolved)).toString('base64url');
        await expect(apply(parts.join('.'))).rejects.toThrow(
          BadRequestException,
        );
        expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
      });
    },
  );

  it('incorpora sin origen mediante edición existente antes de designar', async () => {
    ctx.people.set(input.correo, { ...person, teamIds: [] });
    ctx.teams.get('B')!.code = 'beta';
    const row = {
      correo: input.correo,
      equipo_id: 'B',
      rol: 'Arquitecto' as const,
    };
    const preview = await service.previewDesignate(row, admin);
    expect(preview.errors).toBe(0);
    expect(
      await service.applyDesignate(
        row,
        preview.rows[0].confirmationToken!,
        admin,
      ),
    ).toMatchObject({ estado: 'aplicado' });
    expect(auth.updateUser).toHaveBeenCalledWith(
      'ana',
      { teamId: 'beta' },
      'admin',
    );
    expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
    expect(auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      org.replaceTeamLeader.mock.invocationCallOrder[0],
    );
  });
  it('no firma la salida del arquitecto vigente del origen', async () => {
    ctx.people.set(input.correo, person);
    ctx.teams.get('A')!.leaders.architect = person;
    const preview = await service.previewDesignate(
      { correo: input.correo, equipo_id: 'B', rol: 'Arquitecto' },
      admin,
    );
    expect(preview.rows[0]).toMatchObject({
      confirmationToken: null,
      errors: ['Es el arquitecto de A: designa primero a su reemplazo'],
    });
  });
  it.each(['origen', 'movimiento', 'empleado'])(
    'designar rechaza cambio de %s tras confirmar',
    async (change) => {
      ctx.people.set(input.correo, { ...person });
      const row = {
        correo: input.correo,
        equipo_id: 'B',
        rol: 'Arquitecto' as const,
      };
      const token = (await service.previewDesignate(row, admin)).rows[0]
        .confirmationToken!;
      ctx.people.set(input.correo, {
        ...person,
        ...(change === 'empleado'
          ? { id: 'otro' }
          : { teamIds: change === 'movimiento' ? ['B'] : [] }),
      });
      expect(await service.applyDesignate(row, token, admin)).toMatchObject({
        estado: 'falló',
        detalle: expect.stringContaining('genera la vista previa de nuevo'),
      });
      expect(rotation.rotatePersonnel).not.toHaveBeenCalled();
      expect(org.replaceTeamLeader).not.toHaveBeenCalled();
    },
  );
  it.each(['designar', 'mover'] as const)(
    'no emite token al %s a una persona inactiva',
    async (op) => {
      ctx.people.set(input.correo, { ...person, inactive: true });
      const preview =
        op === 'designar'
          ? await service.previewDesignate(
              { correo: input.correo, equipo_id: 'B', rol: 'Arquitecto' },
              admin,
            )
          : await service.previewMove(
              { correo: input.correo, equipo_destino_id: 'B' },
              admin,
            );
      expect(preview.rows[0]).toMatchObject({
        confirmationToken: null,
        errors: ['La persona está inactiva; actívala desde la web'],
      });
    },
  );
  it('no emite token si el líder actual del destino es Admin', async () => {
    ctx.people.set(input.correo, person);
    ctx.teams.get('B')!.leaders.architect = {
      ...person,
      id: 'jefa',
      name: 'Jefa',
      activeRoleCodes: ['ARCHITECT', 'ADMIN'],
    };
    const preview = await service.previewDesignate(
      { correo: input.correo, equipo_id: 'B', rol: 'Arquitecto' },
      admin,
    );
    expect(preview.rows[0]).toMatchObject({
      confirmationToken: null,
      errors: ['El líder actual de B es Admin; cámbialo desde la web'],
    });
  });
});

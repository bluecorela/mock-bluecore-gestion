import { SupabaseDataService } from '../../supabase/supabase-data.service';
import { TeamDirectoryRepository } from '../../supabase/repositories/team-directory.repository';
import { NavigationRepository } from '../../supabase/repositories/navigation.repository';
import { TeamsService } from '../../teams/teams.service';
import { TeamsController } from '../../teams/teams.controller';
import { OperationsService } from '../../operations/operations.service';
import { SprintsService } from '../../sprints/services/sprints.service';
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { OrganizationService } from '../services/organization.service';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { OrganizationRepository } from './organization.repository';
import { SupabaseClient } from '../../supabase/supabase.client';

// Simula las filas y los filtros de PostgREST; sin sockets ni base de datos.
describe('Acceso por proyectos abiertos y liderazgo vigente', () => {
  afterEach(() => jest.useRealTimers());
  it.each([
    [null, 'active', true, null, true, null, 'active'],
    ['2026-11-12', 'active', false, null, true, null, 'active'],
    [null, 'completed', false, null, true, null, 'active'],
    [null, 'cancelled', false, null, true, null, 'active'],
    [null, 'active', true, '2099-01-01', true, 'ARCHITECT', 'active'],
    [null, 'active', true, '2026-11-13', true, 'SCRUM_MASTER', 'active'],
    [null, 'active', false, '2026-11-13', false, 'ARCHITECT', 'active'],
    [null, 'active', false, '2026-11-13', false, 'SCRUM_MASTER', 'active'],
    [null, 'active', true, null, false, 'ENGINEER', 'active'],
    [null, 'active', false, null, true, 'ARCHITECT', 'inactive'],
  ])(
    'asignación ended_at=%s, proyecto=%s',
    async (
      endedAt,
      status,
      allowed,
      memberEnd,
      memberActive,
      directRole,
      employeeStatus,
    ) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-13T12:00:00Z'));
      const employeeId = '11111111-1111-4111-8111-111111111111';
      const source: Record<string, Record<string, unknown>[]> = {
        employees: [
          { id: employeeId, status: employeeStatus, deleted_at: null },
        ],
        team_memberships: directRole
          ? [
              {
                employee_id: employeeId,
                team_id: 'team',
                is_active: true,
                ended_at: null,
                roles: { code: directRole },
              },
            ]
          : [],
        team_project_memberships: [
          {
            employee_id: employeeId,
            team_project_id: 'assignment',
            is_active: memberActive,
            started_at: '2026-01-01',
            ended_at: memberEnd,
            roles: { code: directRole ?? 'ARCHITECT' },
            employees: {
              id: employeeId,
              status: employeeStatus,
              deleted_at: null,
            },
            team_projects: {
              team_id: 'team',
              ended_at: endedAt,
              projects: { status, deleted_at: null },
            },
          },
        ],
        team_projects: [
          {
            id: 'assignment',
            team_id: 'team',
            ended_at: endedAt,
            projects: { status, deleted_at: null },
          },
        ],
        teams: [
          { id: 'team', code: 'team-code', name: 'Team', deleted_at: null },
        ],
      };
      const database = {
        from: (table: string) => {
          let rows = source[table];
          const at = (row: Record<string, unknown>, key: string): unknown =>
            key
              .split('.')
              .reduce<unknown>(
                (value, part) => (value as Record<string, unknown>)[part],
                row,
              );
          const query = {
            select: () => query,
            order: () => query,
            lte: (key: string, value: string) => {
              rows = rows.filter((row) => String(at(row, key)) <= value);
              return query;
            },
            or: (expression: string) => {
              const date = expression.split('ended_at.gte.')[1];
              rows = rows.filter(
                (row) => row.ended_at === null || String(row.ended_at) >= date,
              );
              return query;
            },
            limit: () => query,
            eq: (key: string, value: unknown) => {
              rows = rows.filter((row) => at(row, key) === value);
              return query;
            },
            is: (key: string, value: unknown) => query.eq(key, value),
            in: (key: string, values: unknown[]) => {
              rows = rows.filter((row) => values.includes(at(row, key)));
              return query;
            },
            not: (key: string, operator: string, values: string) => {
              expect(operator).toBe('in');
              rows = rows.filter(
                (row) =>
                  !values
                    .slice(1, -1)
                    .split(',')
                    .includes(String(at(row, key))),
              );
              return query;
            },
            maybeSingle: () =>
              Promise.resolve({ data: rows[0] ?? null, error: null }),
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve({ data: rows, error: null }).then(resolve),
          };
          return query;
        },
      };
      const repository = new OrganizationRepository({
        getV2Client: () => database,
      } as unknown as SupabaseClient);
      await expect(
        repository.isEmployeeInTeam(employeeId, 'team'),
      ).resolves.toBe(allowed);
      const teams = await repository.findTeamsForEmployee(employeeId);
      expect(teams.map((team) => team.id)).toEqual(allowed ? ['team'] : []);
      const module = await Test.createTestingModule({
        providers: [
          OrganizationService,
          { provide: OrganizationRepository, useValue: repository },
        ],
      }).compile();
      const service = module.get(OrganizationService);
      const user = {
        employeeId,
        role: directRole ?? 'Arquitecto',
      } as AuthenticatedUser;
      const write = service.assertTeamLeader('team', user, [
        'ARCHITECT',
        'SCRUM_MASTER',
      ]);
      if (allowed && directRole !== 'ENGINEER')
        await expect(write).resolves.toBeUndefined();
      else await expect(write).rejects.toBeInstanceOf(ForbiddenException);
      const data = new SupabaseDataService(
        { getV2Client: () => database } as unknown as SupabaseClient,
        {
          getTeams: async () => [{ id: 'team-code', name: 'Team' }],
        } as unknown as TeamDirectoryRepository,
        {} as NavigationRepository,
        repository,
      );
      const legacy = new TeamsService(
        {} as OperationsService,
        data,
        {} as SprintsService,
      );
      const dashboard = jest
        .spyOn(legacy, 'getHomeDashboard')
        .mockResolvedValue({ team: { id: 'team-code' } } as never);
      const save = jest
        .spyOn(legacy, 'saveEvaluation')
        .mockResolvedValue({ ok: true } as never);
      const controller = new TeamsController(legacy);
      for (const admin of [false, true]) {
        const actor = { ...user, role: admin ? 'Admin' : user.role };
        const visible = admin || allowed;
        const context = await controller.getHomeContext(actor);
        expect(context.teams.map((team) => team.id)).toEqual(
          visible ? ['team-code'] : [],
        );
        dashboard.mockClear();
        save.mockClear();
        const read = controller.getHomeDashboard('team-code', actor);
        const write = controller.saveSprintEvaluation(
          { teamId: 'team-code' } as never,
          actor,
        );
        if (visible) {
          await expect(read).resolves.toBeDefined();
          await expect(write).resolves.toMatchObject({ ok: true });
        } else {
          await expect(read).rejects.toMatchObject({ status: 403 });
          await expect(write).rejects.toMatchObject({ status: 403 });
          expect(dashboard).not.toHaveBeenCalled();
          expect(save).not.toHaveBeenCalled();
        }
      }
      await module.close();
    },
  );
});

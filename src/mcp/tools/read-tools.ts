import { ApiError, type InternalApi } from '../internal-api';
import { deHistoriaApi, ESTADOS_INVERSOS, type HistoriaApi } from '../labels';

interface Team {
  id: string;
  name: string;
}
interface Organization {
  leaders: { architect: Employee | null; scrumMaster: Employee | null };
  assignments: { endedAt: string | null; project: Team }[];
}
interface Sprint extends Team {
  status: string;
  startDate: string;
  endDate: string;
}
interface Employee {
  id: string;
  email: string;
}

async function result(action: () => Promise<unknown>) {
  try {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(await action(), null, 2),
        },
      ],
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      isError: true,
      content: [{ type: 'text' as const, text: error.message }],
    };
  }
}

export function createReadTools(api: InternalApi) {
  return {
    listar_equipos: () =>
      result(async () => {
        const teams = await api.get<Team[]>('/v2/teams');
        return Promise.all(
          teams.map(async (team) => {
            let org: Organization;
            try {
              org = await api.get<Organization>(
                `/v2/teams/${encodeURIComponent(team.id)}/organization`,
              );
            } catch (error) {
              if (!(error instanceof ApiError)) throw error;
              return { id: team.id, nombre: team.name, proyectos: [] };
            }
            return {
              id: team.id,
              nombre: team.name,
              proyectos: org.assignments
                .filter((a) => a.endedAt === null)
                .map((a) => ({ id: a.project.id, nombre: a.project.name })),
            };
          }),
        );
      }),
    listar_sprints: ({ equipo_id }: { equipo_id: string }) =>
      result(async () =>
        (
          await api.get<Sprint[]>(
            `/v2/teams/${encodeURIComponent(equipo_id)}/sprints`,
          )
        ).map((s) => ({
          id: s.id,
          nombre: s.name,
          estado: ESTADOS_INVERSOS[s.status] ?? s.status,
          fecha_inicio: s.startDate,
          fecha_fin: s.endDate,
        })),
      ),
    listar_historias: ({
      equipo_id,
      sprint_id,
    }: {
      equipo_id: string;
      sprint_id: string;
    }) =>
      result(async () => {
        const [stories, employees, organization] = await Promise.all([
          api.get<HistoriaApi[]>(
            `/v2/teams/${encodeURIComponent(equipo_id)}/sprints/${encodeURIComponent(sprint_id)}/stories`,
          ),
          api.get<Employee[]>(
            `/v2/employees?teamId=${encodeURIComponent(equipo_id)}`,
          ),
          api.get<Organization>(
            `/v2/teams/${encodeURIComponent(equipo_id)}/organization`,
          ),
        ]);
        const emails = Object.fromEntries(
          employees.map((e) => [e.id, e.email]),
        );
        for (const leader of [
          organization.leaders.architect,
          organization.leaders.scrumMaster,
        ]) {
          if (leader) emails[leader.id] = leader.email;
        }
        return stories.map((s) => deHistoriaApi(s, emails));
      }),
  };
}

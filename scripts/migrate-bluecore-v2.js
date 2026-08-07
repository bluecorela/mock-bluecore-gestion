/* Consolidated Bluecore v2 migration.
 * Dry run: npm run supabase:v2:migrate
 * Apply:   npm run supabase:v2:migrate -- --apply
 */

async function migrateTeams() {
  console.log('\n[Teams]');
require('dotenv').config({ quiet: true });

const { createClient } = require('@supabase/supabase-js');

const TARGET_SCHEMA = process.env.SUPABASE_V2_SCHEMA || 'bluecore_v2';
const SHOULD_APPLY = process.argv.includes('--apply');

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeCode(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  const client = createClient(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: sourceTeams, error: sourceError } = await client
    .from('teams')
    .select('id,name,raw_data')
    .order('name');
  if (sourceError) throw sourceError;

  const { data: targetTeams, error: targetError } = await client
    .schema(TARGET_SCHEMA)
    .from('teams')
    .select('id,code,name,status')
    .order('name');
  if (targetError) throw targetError;

  const payload = (sourceTeams || []).map((team) => ({
    code: normalizeCode(team.id),
    name: team.name,
    description: team.raw_data?.description ?? team.raw_data?.descripcion ?? null,
    status: 'active',
  }));

  const invalid = payload.filter((team) => !team.code || !team.name);
  const duplicateCodes = payload
    .map((team) => team.code)
    .filter((code, index, codes) => codes.indexOf(code) !== index);

  if (invalid.length) throw new Error(`${invalid.length} teams have no valid code or name`);
  if (duplicateCodes.length) {
    throw new Error(`Duplicate codes: ${[...new Set(duplicateCodes)].join(', ')}`);
  }

  const existingCodes = new Set((targetTeams || []).map((team) => team.code));
  console.log(JSON.stringify({
    mode: SHOULD_APPLY ? 'apply' : 'dry-run',
    sourceSchema: 'public',
    targetSchema: TARGET_SCHEMA,
    sourceCount: payload.length,
    targetCountBefore: (targetTeams || []).length,
    inserts: payload.filter((team) => !existingCodes.has(team.code)).length,
    updates: payload.filter((team) => existingCodes.has(team.code)).length,
  }, null, 2));
  console.table(payload.map(({ code, name, status }) => ({ code, name, status })));

  if (!SHOULD_APPLY) {
    console.log('Dry run completed. Use --apply to write the records.');
    return;
  }

  const { error: upsertError } = await client
    .schema(TARGET_SCHEMA)
    .from('teams')
    .upsert(payload, { onConflict: 'code' });
  if (upsertError) throw upsertError;

  const { count, error: countError } = await client
    .schema(TARGET_SCHEMA)
    .from('teams')
    .select('id', { count: 'exact', head: true });
  if (countError) throw countError;

  console.log(JSON.stringify({ applied: true, targetCountAfter: count }, null, 2));
}
  await main();
}

async function migrateOrganization() {
  console.log('\n[Organization]');
require('dotenv').config({ quiet: true });

const { createClient } = require('@supabase/supabase-js');

const TARGET_SCHEMA = process.env.SUPABASE_V2_SCHEMA || 'bluecore_v2';
const SHOULD_APPLY = process.argv.includes('--apply');
const EFFECTIVE_DATE = process.env.SUPABASE_V2_MIGRATION_DATE || new Date().toISOString().slice(0, 10);

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function organizationForTeam(team) {
  if (team.code.startsWith('gb-')) {
    return {
      client: { code: 'global-bank', name: 'Global Bank' },
      project: { code: 'global-bank-banca-digital', name: 'Banca Digital' },
    };
  }
  if (team.code === 'sgb-evolucion') {
    return {
      client: { code: 'saint-george-bank', name: 'Saint George Bank' },
      project: { code: 'saint-george-bank-evolucion', name: 'Evolución' },
    };
  }
  if (team.code === 'sgb-laboratorio') {
    return {
      client: { code: 'saint-george-bank', name: 'Saint George Bank' },
      project: { code: 'saint-george-bank-laboratorio', name: 'Laboratorio' },
    };
  }
  if (team.code === 'pool-de-vacaciones') {
    return {
      client: { code: 'bluecore', name: 'Bluecore' },
      project: {
        code: 'bluecore-internal-projects-availability',
        name: 'Proyectos Internos y Disponibilidad',
      },
    };
  }
  return {
    client: { code: team.code, name: team.name },
    project: { code: `${team.code}-project`, name: `Proyecto ${team.name}` },
  };
}

async function main() {
  const client = createClient(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const v2 = client.schema(TARGET_SCHEMA);

  const [teamsResult, sprintsResult, clientsResult, projectsResult, assignmentsResult] = await Promise.all([
    v2.from('teams').select('id,code,name').is('deleted_at', null).order('name'),
    v2.from('sprints').select('id,team_id,start_date,project_id'),
    v2.from('clients').select('id,code,name'),
    v2.from('projects').select('id,code,name,client_id'),
    v2.from('team_projects').select('team_id,project_id,started_at'),
  ]);
  for (const result of [teamsResult, sprintsResult, clientsResult, projectsResult, assignmentsResult]) {
    if (result.error) throw result.error;
  }

  const teams = teamsResult.data || [];
  const rules = teams.map((team) => ({ team, ...organizationForTeam(team) }));
  const uniqueClients = [...new Map(rules.map((rule) => [rule.client.code, rule.client])).values()];
  const uniqueProjectDefinitions = [...new Map(rules.map((rule) => [rule.project.code, {
    ...rule.project,
    clientCode: rule.client.code,
  }])).values()];
  const existingClientCodes = new Set(clientsResult.data.map((row) => row.code));
  const existingProjectCodes = new Set(projectsResult.data.map((row) => row.code));

  console.log(JSON.stringify({
    mode: SHOULD_APPLY ? 'apply' : 'dry-run',
    teams: teams.length,
    uniqueClients: uniqueClients.length,
    uniqueProjects: uniqueProjectDefinitions.length,
    clientInserts: uniqueClients.filter((row) => !existingClientCodes.has(row.code)).length,
    clientUpdates: uniqueClients.filter((row) => existingClientCodes.has(row.code)).length,
    projectInserts: uniqueProjectDefinitions.filter((row) => !existingProjectCodes.has(row.code)).length,
    projectUpdates: uniqueProjectDefinitions.filter((row) => existingProjectCodes.has(row.code)).length,
    teamProjectAssignments: rules.length,
    sprintsToAssign: sprintsResult.data.filter((sprint) => !sprint.project_id).length,
  }, null, 2));
  console.table(rules.map((rule) => ({
    team: rule.team.name,
    client: rule.client.name,
    project: rule.project.name,
  })));

  if (!SHOULD_APPLY) {
    console.log('Dry run completed. Use --apply to write the records.');
    return;
  }

  const { error: clientsError } = await v2.from('clients').upsert(
    uniqueClients.map((row) => ({ ...row, status: 'active' })),
    { onConflict: 'code' },
  );
  if (clientsError) throw clientsError;

  const { data: migratedClients, error: migratedClientsError } = await v2.from('clients').select('id,code');
  if (migratedClientsError) throw migratedClientsError;
  const clientIdByCode = new Map(migratedClients.map((row) => [row.code, row.id]));

  const projectsPayload = uniqueProjectDefinitions.map((row) => ({
    client_id: clientIdByCode.get(row.clientCode),
    code: row.code,
    name: row.name,
    status: 'active',
  }));
  const { error: projectsError } = await v2.from('projects').upsert(projectsPayload, { onConflict: 'code' });
  if (projectsError) throw projectsError;

  const { data: migratedProjects, error: migratedProjectsError } = await v2.from('projects').select('id,code');
  if (migratedProjectsError) throw migratedProjectsError;
  const projectIdByCode = new Map(migratedProjects.map((row) => [row.code, row.id]));

  const earliestSprintByTeam = new Map();
  for (const sprint of sprintsResult.data) {
    const current = earliestSprintByTeam.get(sprint.team_id);
    if (!current || sprint.start_date < current) earliestSprintByTeam.set(sprint.team_id, sprint.start_date);
  }
  const assignmentPayload = rules.map((rule) => ({
    team_id: rule.team.id,
    project_id: projectIdByCode.get(rule.project.code),
    started_at: earliestSprintByTeam.get(rule.team.id) || EFFECTIVE_DATE,
    is_primary: true,
  }));
  const { error: assignmentError } = await v2
    .from('team_projects')
    .upsert(assignmentPayload, { onConflict: 'team_id,project_id,started_at' });
  if (assignmentError) throw assignmentError;

  for (const rule of rules) {
    const { error } = await v2
      .from('sprints')
      .update({ project_id: projectIdByCode.get(rule.project.code) })
      .eq('team_id', rule.team.id);
    if (error) throw error;
  }

  console.log(JSON.stringify({
    applied: true,
    clients: migratedClients.length,
    projects: migratedProjects.length,
    teamProjectAssignments: assignmentPayload.length,
    sprintsAssigned: sprintsResult.data.length,
  }, null, 2));
}
  await main();
}

async function migrateEmployees() {
  console.log('\n[Employees]');
require('dotenv').config({ quiet: true });

const { createClient } = require('@supabase/supabase-js');

const TARGET_SCHEMA = process.env.SUPABASE_V2_SCHEMA || 'bluecore_v2';
const SHOULD_APPLY = process.argv.includes('--apply');
const EFFECTIVE_DATE = process.env.SUPABASE_V2_MIGRATION_DATE || new Date().toISOString().slice(0, 10);

const ROLE_DEFINITIONS = {
  Admin: { code: 'ADMIN', name: 'Administrator' },
  Arquitecto: { code: 'ARCHITECT', name: 'Architect' },
  'Ingeniero de Software': { code: 'SOFTWARE_ENGINEER', name: 'Software Engineer' },
  'Ingeniero de QA': { code: 'QA_ENGINEER', name: 'QA Engineer' },
  'Creador de Bienestar': { code: 'WELLBEING_CREATOR', name: 'Wellbeing Creator' },
};
const ROLE_PRIORITY = ['ADMIN', 'ARCHITECT', 'SCRUM_MASTER', 'SOFTWARE_ENGINEER', 'QA_ENGINEER', 'WELLBEING_CREATOR'];

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function mapStatus(status) {
  if (String(status || '').toLowerCase() === 'inactivo') return 'inactive';
  return 'active';
}

function chooseCanonicalName(records) {
  const frequencies = new Map();
  for (const record of records) {
    frequencies.set(record.full_name, (frequencies.get(record.full_name) || 0) + 1);
  }
  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

async function listAuthUsers(client) {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
    page += 1;
  }
}

async function main() {
  const client = createClient(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const v2 = client.schema(TARGET_SCHEMA);

  const [sourceResult, teamsResult, rolesResult, employeesResult, authUsers] = await Promise.all([
    client.from('employees').select('id,full_name,rol,email,team_id,estatus').order('full_name'),
    v2.from('teams').select('id,code'),
    v2.from('roles').select('id,code'),
    v2.from('employees').select('id,employee_code,email'),
    listAuthUsers(client),
  ]);

  for (const result of [sourceResult, teamsResult, rolesResult, employeesResult]) {
    if (result.error) throw result.error;
  }

  const sourceEmployees = sourceResult.data || [];
  const teamByCode = new Map((teamsResult.data || []).map((team) => [team.code, team.id]));
  const roleByCode = new Map((rolesResult.data || []).map((role) => [role.code, role.id]));
  const authByEmail = new Map(authUsers.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user.id]));
  const existingByEmail = new Map((employeesResult.data || []).map((employee) => [employee.email.toLowerCase(), employee]));

  const unknownRoles = [...new Set(sourceEmployees.map((employee) => employee.rol).filter((role) => !ROLE_DEFINITIONS[role]))];
  const unknownTeams = [...new Set(sourceEmployees.map((employee) => employee.team_id).filter((code) => code && !teamByCode.has(code)))];
  if (unknownRoles.length) throw new Error(`Unknown roles: ${unknownRoles.join(', ')}`);
  if (unknownTeams.length) throw new Error(`Unknown teams: ${unknownTeams.join(', ')}`);

  const identities = new Map();
  for (const employee of sourceEmployees) {
    const email = employee.email.toLowerCase();
    if (!identities.has(email)) identities.set(email, []);
    identities.get(email).push(employee);
  }

  const employeesPayload = [...identities.entries()].map(([email, records]) => ({
    employee_code: [...records].map((record) => record.id).sort()[0],
    auth_user_id: authByEmail.get(email) || null,
    full_name: chooseCanonicalName(records),
    email,
    status: records.some((record) => mapStatus(record.estatus) === 'active') ? 'active' : 'inactive',
  }));

  const uniqueRoleKeys = new Set(sourceEmployees.map((employee) =>
    `${employee.email.toLowerCase()}:${ROLE_DEFINITIONS[employee.rol].code}`,
  ));
  const uniqueMembershipKeys = new Set(sourceEmployees
    .filter((employee) => employee.team_id)
    .map((employee) => `${employee.email.toLowerCase()}:${employee.team_id}`));
  const identitiesWithoutTeam = [...identities.values()].filter((records) => records.every((record) => !record.team_id));

  const summary = {
    mode: SHOULD_APPLY ? 'apply' : 'dry-run',
    effectiveDate: EFFECTIVE_DATE,
    sourceRecords: sourceEmployees.length,
    uniqueEmployees: employeesPayload.length,
    consolidatedRecords: sourceEmployees.length - employeesPayload.length,
    employeeInserts: employeesPayload.filter((employee) => !existingByEmail.has(employee.email)).length,
    employeeUpdates: employeesPayload.filter((employee) => existingByEmail.has(employee.email)).length,
    roleAssignments: uniqueRoleKeys.size,
    teamMemberships: uniqueMembershipKeys.size,
    employeesWithoutTeam: identitiesWithoutTeam.length,
    matchedAuthUsers: employeesPayload.filter((employee) => employee.auth_user_id).length,
    unmatchedAuthUsers: employeesPayload.filter((employee) => !employee.auth_user_id).length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!SHOULD_APPLY) {
    console.table(sourceEmployees.map((employee) => ({
      employee: employee.full_name,
      role: ROLE_DEFINITIONS[employee.rol].code,
      team: employee.team_id || '(unassigned)',
      auth: authByEmail.has(employee.email.toLowerCase()) ? 'matched' : 'not found',
    })));
    console.log('Dry run completed. Use --apply to write the records.');
    return;
  }

  const missingRoleDefinitions = Object.values(ROLE_DEFINITIONS).filter((role) => !roleByCode.has(role.code));
  if (missingRoleDefinitions.length) {
    const { error } = await v2.from('roles').upsert(missingRoleDefinitions, { onConflict: 'code' });
    if (error) throw error;
  }

  const { error: employeeError } = await v2
    .from('employees')
    .upsert(employeesPayload, { onConflict: 'email' });
  if (employeeError) throw employeeError;

  const [{ data: migratedEmployees, error: migratedError }, { data: migratedRoles, error: roleError }] = await Promise.all([
    v2.from('employees').select('id,email'),
    v2.from('roles').select('id,code'),
  ]);
  if (migratedError) throw migratedError;
  if (roleError) throw roleError;

  const employeeIdByEmail = new Map(migratedEmployees.map((employee) => [employee.email.toLowerCase(), employee.id]));
  const migratedRoleByCode = new Map(migratedRoles.map((role) => [role.code, role.id]));

  const [{ data: existingRoles, error: existingRolesError }, { data: existingMemberships, error: existingMembershipsError }] = await Promise.all([
    v2.from('employee_roles').select('employee_id,role_id').is('ended_at', null),
    v2.from('team_memberships').select('employee_id,team_id').eq('is_active', true),
  ]);
  if (existingRolesError) throw existingRolesError;
  if (existingMembershipsError) throw existingMembershipsError;

  const existingRoleKeys = new Set(existingRoles.map((row) => `${row.employee_id}:${row.role_id}`));
  const existingMembershipKeys = new Set(existingMemberships.map((row) => `${row.employee_id}:${row.team_id}`));

  const roleRowsByKey = new Map();
  for (const employee of sourceEmployees) {
    const employeeId = employeeIdByEmail.get(employee.email.toLowerCase());
    const roleCode = ROLE_DEFINITIONS[employee.rol].code;
    const roleId = migratedRoleByCode.get(roleCode);
    const key = `${employeeId}:${roleId}`;
    if (!roleRowsByKey.has(key)) roleRowsByKey.set(key, { employee_id: employeeId, role_id: roleId, roleCode });
  }
  const rolesByEmployee = new Map();
  for (const row of roleRowsByKey.values()) {
    if (!rolesByEmployee.has(row.employee_id)) rolesByEmployee.set(row.employee_id, []);
    rolesByEmployee.get(row.employee_id).push(row);
  }
  const rolePayload = [];
  for (const rows of rolesByEmployee.values()) {
    rows.sort((a, b) => ROLE_PRIORITY.indexOf(a.roleCode) - ROLE_PRIORITY.indexOf(b.roleCode));
    rows.forEach((row, index) => {
      const key = `${row.employee_id}:${row.role_id}`;
      if (!existingRoleKeys.has(key)) {
        rolePayload.push({ employee_id: row.employee_id, role_id: row.role_id, started_at: EFFECTIVE_DATE, is_primary: index === 0 });
      }
    });
  }

  const membershipRowsByKey = new Map();
  for (const employee of sourceEmployees.filter((record) => record.team_id)) {
    const employeeId = employeeIdByEmail.get(employee.email.toLowerCase());
    const teamId = teamByCode.get(employee.team_id);
    const key = `${employeeId}:${teamId}`;
    if (!membershipRowsByKey.has(key)) {
      membershipRowsByKey.set(key, {
        employee_id: employeeId,
        team_id: teamId,
        role_id: migratedRoleByCode.get(ROLE_DEFINITIONS[employee.rol].code),
        started_at: EFFECTIVE_DATE,
        is_active: true,
      });
    }
  }
  const membershipPayload = [...membershipRowsByKey.entries()]
    .filter(([key]) => !existingMembershipKeys.has(key))
    .map(([, row]) => row);

  if (rolePayload.length) {
    const { error } = await v2.from('employee_roles').insert(rolePayload);
    if (error) throw error;
  }
  if (membershipPayload.length) {
    const { error } = await v2.from('team_memberships').insert(membershipPayload);
    if (error) throw error;
  }

  console.log(JSON.stringify({
    applied: true,
    employees: migratedEmployees.length,
    roleAssignmentsInserted: rolePayload.length,
    membershipsInserted: membershipPayload.length,
  }, null, 2));
}
  await main();
}

async function migrateSprints() {
  console.log('\n[Sprints]');
require('dotenv').config({ quiet: true });

const { createClient } = require('@supabase/supabase-js');

const TARGET_SCHEMA = process.env.SUPABASE_V2_SCHEMA || 'bluecore_v2';
const SHOULD_APPLY = process.argv.includes('--apply');

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ');
}

function sprintNumber(firebaseId) {
  const match = String(firebaseId || '').match(/^sprint-(\d+)$/i);
  if (!match) throw new Error(`Invalid sprint ID: ${firebaseId}`);
  return Number(match[1]);
}

function dateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

async function main() {
  const client = createClient(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const v2 = client.schema(TARGET_SCHEMA);

  const [sprintsResult, membersResult, teamsResult, employeesResult, targetSprintsResult, targetMetricsResult] = await Promise.all([
    client.from('sprints').select('*').order('start_date'),
    client.from('sprint_members').select('*'),
    v2.from('teams').select('id,code'),
    v2.from('employees').select('id,full_name,email'),
    v2.from('sprints').select('id,team_id,sprint_number'),
    v2.from('sprint_member_metrics').select('sprint_id,employee_id'),
  ]);
  for (const result of [sprintsResult, membersResult, teamsResult, employeesResult, targetSprintsResult, targetMetricsResult]) {
    if (result.error) throw result.error;
  }

  const sourceSprints = sprintsResult.data || [];
  const sourceMembers = membersResult.data || [];
  const teamByCode = new Map(teamsResult.data.map((team) => [team.code, team.id]));
  const employeeByName = new Map();
  const employeeByEmail = new Map(employeesResult.data.map((employee) => [employee.email.toLowerCase(), employee.id]));
  for (const employee of employeesResult.data) {
    const key = normalizeName(employee.full_name);
    if (employeeByName.has(key)) throw new Error(`Ambiguous employee name in v2: ${employee.full_name}`);
    employeeByName.set(key, employee.id);
  }

  const sprintPayload = sourceSprints.map((sprint) => {
    const teamId = teamByCode.get(sprint.team_id);
    if (!teamId) throw new Error(`Team not found in v2: ${sprint.team_id}`);
    return {
      team_id: teamId,
      project_id: null,
      sprint_number: sprintNumber(sprint.firebase_id),
      name: sprint.firebase_id,
      start_date: dateOnly(sprint.start_date),
      end_date: dateOnly(sprint.end_date),
      status: sprint.sprint_closed ? 'completed' : 'in_progress',
      closed_at: null,
    };
  });

  const sourceSprintById = new Map(sourceSprints.map((sprint) => [sprint.id, sprint]));
  const targetSprintKeys = new Set(targetSprintsResult.data.map((sprint) => `${sprint.team_id}:${sprint.sprint_number}`));
  const targetMetricKeys = new Set(targetMetricsResult.data.map((metric) => `${metric.sprint_id}:${metric.employee_id}`));

  let metricsAlreadyPresent = 0;
  for (const member of sourceMembers) {
    const sourceSprint = sourceSprintById.get(member.sprint_id);
    if (!sourceSprint) throw new Error(`Source sprint not found for member: ${member.sprint_id}`);
    if (!employeeByName.has(normalizeName(member.employee_name))) {
      throw new Error(`Employee not found in v2: ${member.employee_name}`);
    }
  }

  console.log(JSON.stringify({
    mode: SHOULD_APPLY ? 'apply' : 'dry-run',
    sourceSprints: sourceSprints.length,
    sprintInserts: sprintPayload.filter((sprint) => !targetSprintKeys.has(`${sprint.team_id}:${sprint.sprint_number}`)).length,
    sprintUpdates: sprintPayload.filter((sprint) => targetSprintKeys.has(`${sprint.team_id}:${sprint.sprint_number}`)).length,
    sourceMetrics: sourceMembers.length,
    metricsWithoutEvaluationDate: sourceMembers.filter((member) => !member.evaluation_date).length,
    projectsPendingAssignment: sprintPayload.filter((sprint) => !sprint.project_id).length,
  }, null, 2));

  if (!SHOULD_APPLY) {
    console.table(sprintPayload.map((sprint) => ({
      sprint: sprint.name,
      teamId: sprint.team_id,
      startDate: sprint.start_date,
      endDate: sprint.end_date,
      status: sprint.status,
    })));
    console.log('Dry run completed. Use --apply to write the records.');
    return;
  }

  const { error: sprintError } = await v2
    .from('sprints')
    .upsert(sprintPayload, { onConflict: 'team_id,sprint_number' });
  if (sprintError) throw sprintError;

  const { data: migratedSprints, error: migratedSprintError } = await v2
    .from('sprints')
    .select('id,team_id,sprint_number');
  if (migratedSprintError) throw migratedSprintError;
  const sprintByKey = new Map(migratedSprints.map((sprint) => [`${sprint.team_id}:${sprint.sprint_number}`, sprint.id]));

  const metricsPayload = sourceMembers.map((member) => {
    const sourceSprint = sourceSprintById.get(member.sprint_id);
    const teamId = teamByCode.get(sourceSprint.team_id);
    const sprintId = sprintByKey.get(`${teamId}:${sprintNumber(sourceSprint.firebase_id)}`);
    const employeeId = employeeByName.get(normalizeName(member.employee_name));
    if (targetMetricKeys.has(`${sprintId}:${employeeId}`)) metricsAlreadyPresent += 1;
    return {
      sprint_id: sprintId,
      employee_id: employeeId,
      assigned_tasks: member.assigned_tasks ?? 0,
      delivered_tasks: member.delivered_tasks ?? 0,
      returned_tasks: member.returned_tasks ?? 0,
      code_quality_score: member.code_quality,
      component_1_score: member.total1,
      component_2_score: member.total2,
      component_3_score: member.total3,
      final_score: member.total_final,
      rating: member.qualification,
      comments: member.comments,
      evaluated_by: member.evaluated_by ? employeeByEmail.get(member.evaluated_by.toLowerCase()) || null : null,
      evaluated_at: member.evaluation_date,
    };
  });

  const { error: metricsError } = await v2
    .from('sprint_member_metrics')
    .upsert(metricsPayload, { onConflict: 'sprint_id,employee_id' });
  if (metricsError) throw metricsError;

  console.log(JSON.stringify({
    applied: true,
    sprints: migratedSprints.length,
    metricsInserted: metricsPayload.length - metricsAlreadyPresent,
    metricsUpdated: metricsAlreadyPresent,
  }, null, 2));
}
  await main();
}

async function runMigration() {
  await migrateTeams();
  await migrateOrganization();
  await migrateEmployees();
  await migrateSprints();
}

runMigration().catch((error) => {
  console.error('Bluecore v2 migration failed:', error.message || error);
  process.exitCode = 1;
});


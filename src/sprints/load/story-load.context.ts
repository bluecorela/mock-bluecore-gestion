// Shared by bulk loading and updates by code; team leaders can be assignees too.
export function buildStoryEmployeeMaps(
  employees: Array<{ id: string; email?: string | null }>,
  leaders: {
    architect?: { id: string; email?: string | null } | null;
    scrumMaster?: { id: string; email?: string | null } | null;
  },
) {
  const employeeIdByEmail = new Map<string, string>();
  const employeeEmailById = new Map<string, string>();
  for (const employee of [
    ...employees,
    leaders.architect,
    leaders.scrumMaster,
  ]) {
    if (employee?.email) {
      const email = employee.email.trim().toLowerCase();
      employeeIdByEmail.set(email, employee.id);
      employeeEmailById.set(employee.id, email);
    }
  }
  return { employeeIdByEmail, employeeEmailById };
}

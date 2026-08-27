export const AUTH_ROLES = [
  'Admin',
  'Arquitecto',
  'Scrum Master',
  'Ingeniero de Software',
  'Ingeniero de QA',
  'Creador de Bienestar',
  'Pasante',
] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const ROLES_REQUIRING_TEAM: readonly AuthRole[] = [
  'Ingeniero de Software',
  'Ingeniero de QA',
  'Pasante',
];

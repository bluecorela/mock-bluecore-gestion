export const AUTH_ROLES = [
  'Admin',
  'Arquitecto',
  'Scrum Master',
  'Ingeniero de Software',
  'Ingeniero de QA',
] as const;

export const HISTORICAL_ROLE_CODES = ['WELLBEING_CREATOR', 'INTERN'] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const PORTAL_ACCESS_ROLES = [
  'Admin',
  'Arquitecto',
  'Scrum Master',
] as const;

export const PORTAL_ACCESS_DENIED_MESSAGE =
  'Todavía no disponible, estamos trabajando :D';

export const ROLES_REQUIRING_TEAM: readonly AuthRole[] = [
  'Ingeniero de Software',
  'Ingeniero de QA',
];

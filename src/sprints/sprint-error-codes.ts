import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  HttpException,
} from '@nestjs/common';

export const sprintErrorCodes = {
  SPRINT_NOT_FOUND: { status: 404, message: 'Sprint no encontrado' },
  STORY_NOT_FOUND: {
    status: 404,
    message: 'Historia de usuario no encontrada',
  },
  INITIATIVE_NOT_FOUND: {
    status: 404,
    message: 'Iniciativa del sprint no encontrada',
  },
  SPRINT_COMPLETED: {
    status: 400,
    message: 'No se puede modificar un sprint completado',
  },
  SPRINT_NOT_WRITABLE: { status: 400, message: undefined },
  SPRINT_NOT_PLANNED: {
    status: 400,
    message: 'Solo se puede iniciar un sprint planificado',
  },
  SPRINT_NOT_IN_PROGRESS: {
    status: 400,
    message: 'Solo se puede completar un sprint en progreso',
  },
  SPRINT_ALREADY_ACTIVE: {
    status: 400,
    message: 'El equipo ya tiene un sprint en progreso',
  },
  PREVIOUS_SPRINT_PENDING: {
    status: 400,
    message:
      'No se puede iniciar un sprint mientras exista un sprint anterior sin completar',
  },
  SPRINT_WITHOUT_STORIES: {
    status: 400,
    message:
      'Debes registrar al menos una historia de usuario antes de iniciar el sprint',
  },
  SPRINT_END_NOT_REACHED: { status: 400, message: undefined },
  NEXT_SPRINT_MISSING: {
    status: 400,
    message:
      'Hay HU pendientes y no existe un siguiente sprint planificado del mismo proyecto',
  },
  NEXT_SPRINT_CHANGED: {
    status: 409,
    message:
      'El siguiente sprint cambió mientras se completaba; vuelve a intentarlo',
  },
  SAME_SOURCE_TARGET: {
    status: 400,
    message: 'El sprint de origen y el de destino deben ser distintos',
  },
  SPRINT_OTHER_TEAM: {
    status: 400,
    message: 'El sprint de origen o de destino no pertenece al equipo',
  },
  LOAD_EMPTY: { status: 400, message: 'La carga no tiene historias' },
  UPDATE_EMPTY: { status: 400, message: 'La actualización no tiene datos' },
  LOAD_CONFIRMATION_USED: {
    status: 409,
    message: 'Esta confirmación ya se usó',
  },
  LOAD_PREVIEW_CHANGED: {
    status: 409,
    message:
      'La carga cambió desde la vista previa; genera la vista previa de nuevo',
  },
} as const;

export type SprintErrorCode = keyof typeof sprintErrorCodes;

export function sprintErrorException(
  code: SprintErrorCode,
  message?: string,
): HttpException {
  const definition = sprintErrorCodes[code];
  const Exception = {
    400: BadRequestException,
    404: NotFoundException,
    409: ConflictException,
  }[definition.status];
  const error = { 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict' }[
    definition.status
  ];
  return new Exception({
    statusCode: definition.status,
    message: message ?? definition.message ?? error,
    error,
    code,
  });
}

export function sprintExceptionFromSupabase(
  error: unknown,
): HttpException | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    code?: unknown;
    details?: unknown;
    message?: unknown;
  };
  if (
    candidate.code !== 'P0001' ||
    typeof candidate.details !== 'string' ||
    !Object.prototype.hasOwnProperty.call(sprintErrorCodes, candidate.details)
  )
    return undefined;
  const code = candidate.details as SprintErrorCode;
  return sprintErrorException(
    code,
    sprintErrorCodes[code].message === undefined &&
      typeof candidate.message === 'string'
      ? candidate.message
      : undefined,
  );
}

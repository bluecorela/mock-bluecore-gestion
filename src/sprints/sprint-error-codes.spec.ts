import {
  sprintErrorException,
  sprintExceptionFromSupabase,
} from './sprint-error-codes';
import type { SprintErrorCode } from './sprint-error-codes';
describe('sprint error codes', () => {
  it.each([
    ['SPRINT_NOT_FOUND', 404, 'Sprint no encontrado'],
    ['STORY_NOT_FOUND', 404, 'Historia de usuario no encontrada'],
    ['INITIATIVE_NOT_FOUND', 404, 'Iniciativa del sprint no encontrada'],
    ['SPRINT_COMPLETED', 400, 'No se puede modificar un sprint completado'],
    ['SPRINT_NOT_WRITABLE', 400, 'Mensaje con fecha o variante'],
    ['SPRINT_NOT_PLANNED', 400, 'Solo se puede iniciar un sprint planificado'],
    [
      'SPRINT_NOT_IN_PROGRESS',
      400,
      'Solo se puede completar un sprint en progreso',
    ],
    ['SPRINT_ALREADY_ACTIVE', 400, 'El equipo ya tiene un sprint en progreso'],
    [
      'PREVIOUS_SPRINT_PENDING',
      400,
      'No se puede iniciar un sprint mientras exista un sprint anterior sin completar',
    ],
    [
      'SPRINT_WITHOUT_STORIES',
      400,
      'Debes registrar al menos una historia de usuario antes de iniciar el sprint',
    ],
    ['SPRINT_END_NOT_REACHED', 400, 'Mensaje con fecha o variante'],
    [
      'NEXT_SPRINT_MISSING',
      400,
      'Hay HU pendientes y no existe un siguiente sprint planificado del mismo proyecto',
    ],
    [
      'NEXT_SPRINT_CHANGED',
      409,
      'El siguiente sprint cambió mientras se completaba; vuelve a intentarlo',
    ],
    [
      'SAME_SOURCE_TARGET',
      400,
      'El sprint de origen y el de destino deben ser distintos',
    ],
    [
      'SPRINT_OTHER_TEAM',
      400,
      'El sprint de origen o de destino no pertenece al equipo',
    ],
    ['LOAD_EMPTY', 400, 'La carga no tiene historias'],
    ['UPDATE_EMPTY', 400, 'La actualización no tiene datos'],
    ['LOAD_CONFIRMATION_USED', 409, 'Esta confirmación ya se usó'],
    [
      'LOAD_PREVIEW_CHANGED',
      409,
      'La carga cambió desde la vista previa; genera la vista previa de nuevo',
    ],
  ] as [SprintErrorCode, number, string][])('%s', (code, status, message) => {
    const exception = sprintExceptionFromSupabase({
      code: 'P0001',
      details: code,
      message: 'Mensaje con fecha o variante',
    })!;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toEqual({
      statusCode: status,
      message,
      error: { 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict' }[status],
      code,
    });
  });
  it.each([
    { code: 'P0001', details: 'UNKNOWN' },
    { code: 'P0001' },
    { code: '23505', details: 'SPRINT_NOT_FOUND' },
    { code: 'P0001', details: 'toString' },
    null,
  ])('ignora %j', (error) => {
    expect(sprintExceptionFromSupabase(error)).toBeUndefined();
  });
  it('permite preservar un mensaje explícito del servicio', () => {
    expect(
      sprintErrorException(
        'SAME_SOURCE_TARGET',
        'La historia ya pertenece a este sprint',
      ).getResponse(),
    ).toMatchObject({
      message: 'La historia ya pertenece a este sprint',
      code: 'SAME_SOURCE_TARGET',
    });
  });
});

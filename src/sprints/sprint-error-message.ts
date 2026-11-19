const legacySprintMessages = new Map<string, string>([
  [
    'No se puede modificar un sprint cerrado',
    'No se puede modificar un sprint completado',
  ],
  [
    'No se puede iniciar un sprint mientras exista un sprint anterior sin cerrar',
    'No se puede iniciar un sprint mientras exista un sprint anterior sin completar',
  ],
  [
    'El siguiente sprint cambió mientras se cerraba; vuelve a intentarlo',
    'El siguiente sprint cambió mientras se completaba; vuelve a intentarlo',
  ],
]);

export function sprintErrorMessage(
  message: string | undefined,
): string | undefined {
  return message === undefined
    ? undefined
    : (legacySprintMessages.get(message) ?? message);
}

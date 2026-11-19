import { sprintErrorMessage } from './sprint-error-message';

describe('sprintErrorMessage', () => {
  it.each([
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
    ['Bug cerrado', 'Bug cerrado'],
    ['Cerrar sesión', 'Cerrar sesión'],
    ['Mensaje desconocido', 'Mensaje desconocido'],
    ['', ''],
    [undefined, undefined],
  ])('traduce solo mensajes conocidos: %s', (message, expected) => {
    expect(sprintErrorMessage(message)).toBe(expected);
  });
});

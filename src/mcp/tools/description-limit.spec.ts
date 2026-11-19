import { userDescriptions } from './user-tools';
import { writeSchemas } from './write-tools';

it.each([5000, 5001])('valida el límite de descripción: %i', (length) => {
  const historia = {
    nombre: 'Historia',
    puntos: 1,
    descripcion: 'a'.repeat(length),
  };
  const id = '12345678-1234-4234-8234-123456789abc';
  const inputs = {
    cargar_historias: { equipo_id: id, sprint_id: id, historias: [historia] },
    crear_sprint: {
      equipo_id: id,
      proyecto_id: id,
      fecha_inicio: '2026-11-11',
      fecha_fin: '2026-11-25',
      historias: [historia],
    },
    actualizar_historia: { codigo: 'HU-1', ...historia },
  };
  for (const name of Object.keys(inputs) as (keyof typeof inputs)[]) {
    expect(writeSchemas[name].safeParse(inputs[name]).success).toBe(
      length === 5000,
    );
  }
});

it('limita las descripciones de usuarios a 1024 caracteres', () => {
  for (const description of Object.values(userDescriptions)) {
    expect(description.length).toBeLessThanOrEqual(1024);
  }
});

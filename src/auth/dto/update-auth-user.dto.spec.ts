import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePersonnelDto } from '../../personnel/dto/create-personnel.dto';
import { CreateAuthUserDto } from './create-auth-user.dto';
import { UpdateAuthUserDto } from './update-auth-user.dto';

describe.each([UpdateAuthUserDto, CreateAuthUserDto, CreatePersonnelDto])(
  '%s: roles vigentes',
  (Dto: ClassConstructor<object>) => {
    it.each(['Pasante', 'Creador de Bienestar', 'Ingeniero QA'])(
      'rechaza el rol retirado %s',
      async (role) => {
        const dto = plainToInstance(Dto, {
          name: 'Persona de prueba',
          email: 'persona@example.com',
          password: 'Cambiar123!',
          role,
        });
        const errors = await validate(dto);
        expect(
          errors.find((error) => error.property === 'role')?.constraints,
        ).toHaveProperty('isIn');
      },
    );

    it('acepta Ingeniero de QA', async () => {
      const dto = plainToInstance(Dto, {
        name: 'Persona de prueba',
        email: 'persona@example.com',
        password: 'Cambiar123!',
        role: 'Ingeniero de QA',
      });
      expect(await validate(dto)).toEqual([]);
    });
  },
);

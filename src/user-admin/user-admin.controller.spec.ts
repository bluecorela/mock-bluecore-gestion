import {
  ExecutionContext,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { UserAdminController } from './user-admin.controller';
import {
  ApplyCreateUserDto,
  CreateUsersDto,
  CreateUserRowDto,
  RoleRowDto,
  DesignateRowDto,
  ApplyDesignateDto,
} from './user-admin.dto';
import { CreateAuthUserDto } from '../auth/dto/create-auth-user.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const row = {
  nombre: 'Ana',
  correo: 'ana@x.com',
  rol: 'Arquitecto',
  equipo_id: '11111111-1111-4111-8111-111111111111',
};
describe('UserAdminController', () => {
  it.each([
    'previewCreate',
    'applyCreate',
    'previewRole',
    'applyRole',
    'previewMove',
    'applyMove',
    'previewDesignate',
    'applyDesignate',
    'findUsers',
  ])('%s rechaza Arquitecto y SM con 403', (method) => {
    const handler = (
      UserAdminController.prototype as unknown as Record<string, object>
    )[method];
    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ??
      (Reflect.getMetadata(GUARDS_METADATA, UserAdminController) as unknown[]);
    expect(guards).toEqual(expect.arrayContaining([AuthGuard, AdminGuard]));
    for (const role of ['Arquitecto', 'Scrum Master']) {
      const context = {
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      } as ExecutionContext;
      try {
        new AdminGuard().canActivate(context);
        throw new Error('Permitido');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getStatus()).toBe(403);
      }
    }
  });
  it('usa el prefijo del plan', () =>
    expect(Reflect.getMetadata(PATH_METADATA, UserAdminController)).toBe(
      'v2/admin',
    ));
  it.each([0, 11])(
    'rechaza lote de %s con 400 antes del servicio',
    async (length) => {
      await expect(
        pipe.transform(
          { usuarios: Array.from({ length }, () => row) },
          { type: 'body', metatype: CreateUsersDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('rechaza rol Admin en alta y cambio', async () => {
    await expect(
      pipe.transform(
        { ...row, rol: 'Admin' },
        { type: 'body', metatype: CreateUserRowDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(
        { correo: row.correo, rol: 'Admin' },
        { type: 'body', metatype: RoleRowDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('createdBy no está expuesto en el DTO HTTP de Auth', async () => {
    await expect(
      pipe.transform(
        {
          name: 'Ana',
          email: row.correo,
          password: '12345678',
          role: row.rol,
          createdBy: 'otro',
        },
        { type: 'body', metatype: CreateAuthUserDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rechaza usuario como lista en la aplicación', async () => {
    await expect(
      pipe.transform(
        { usuario: [row], confirmationToken: 'token' },
        { type: 'body', metatype: ApplyCreateUserDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

it.each([DesignateRowDto, ApplyDesignateDto])(
  'valida origen opcional UUID en %p',
  async (metatype) => {
    const body = {
      correo: row.correo,
      rol: row.rol,
      equipo_id: row.equipo_id,
      ...(metatype === ApplyDesignateDto ? { confirmationToken: 'token' } : {}),
    };
    await expect(
      pipe.transform(body, { type: 'body', metatype }),
    ).resolves.toMatchObject(body);
    await expect(
      pipe.transform(
        { ...body, equipo_origen_id: row.equipo_id },
        { type: 'body', metatype },
      ),
    ).resolves.toHaveProperty('equipo_origen_id', row.equipo_id);
    await expect(
      pipe.transform(
        { ...body, equipo_origen_id: 'no' },
        { type: 'body', metatype },
      ),
    ).rejects.toMatchObject({ status: 400 });
  },
);

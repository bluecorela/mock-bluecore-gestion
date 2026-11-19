import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateSidebarModuleDto,
  UpdateSidebarModuleDto,
} from './sidebar-module.dto';

describe.each([CreateSidebarModuleDto, UpdateSidebarModuleDto])(
  '%s: roles vigentes',
  (Dto) => {
    it.each(['INTERN', 'WELLBEING_CREATOR'])(
      'rechaza el código histórico %s',
      async (roleCode) => {
        const dto = plainToInstance(Dto, {
          code: 'performance',
          name: 'Desempeño',
          route: '/performance',
          roleCodes: [roleCode],
        });
        const errors = await validate(dto);
        expect(
          errors.find((error) => error.property === 'roleCodes')?.constraints,
        ).toHaveProperty('isIn');
      },
    );

    it('acepta códigos vigentes', async () => {
      const dto = plainToInstance(Dto, {
        code: 'performance',
        name: 'Desempeño',
        route: '/performance',
        roleCodes: [
          'ADMIN',
          'ARCHITECT',
          'SCRUM_MASTER',
          'SOFTWARE_ENGINEER',
          'QA_ENGINEER',
        ],
      });
      expect(await validate(dto)).toEqual([]);
    });
  },
);

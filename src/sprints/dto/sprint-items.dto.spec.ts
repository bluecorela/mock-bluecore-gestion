import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateSprintUserStoryDto } from './sprint-items.dto';

describe('UpdateSprintUserStoryDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const metadata = {
    type: 'body' as const,
    metatype: UpdateSprintUserStoryDto,
  };

  it('rechaza code null con 400', async () => {
    const request = pipe.transform({ code: null }, metadata);
    await expect(request).rejects.toBeInstanceOf(BadRequestException);
    await expect(request).rejects.toMatchObject({ status: 400 });
  });

  it.each([{}, { code: 'HU-1' }, { name: 'Nombre actualizado' }])(
    'acepta un código omitido o válido: %j',
    async (body) => {
      await expect(pipe.transform(body, metadata)).resolves.toEqual(body);
    },
  );
});

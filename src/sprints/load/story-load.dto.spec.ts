import { ValidationPipe } from '@nestjs/common';
import { UpdateStoryByCodeDto, StoryLoadDto } from './story-load.dto';
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const validate = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: StoryLoadDto });
const row = { name: 'Historia', storyPoints: 0 };
describe('StoryLoadDto', () => {
  it('acepta descripciones de 5000 caracteres', async () => {
    await expect(
      validate({ stories: [{ ...row, description: 'a'.repeat(5000) }] }),
    ).resolves.toBeInstanceOf(StoryLoadDto);
  });
  it('rechaza descripciones de 5001 caracteres', async () => {
    await expect(
      validate({ stories: [{ ...row, description: 'a'.repeat(5001) }] }),
    ).rejects.toThrow();
  });
  it.each(['', '   '])('discards empty optional strings %j', async (empty) => {
    const result = (await validate({
      stories: [
        { ...row, code: empty, description: empty, assigneeEmail: empty },
      ],
    })) as StoryLoadDto;
    expect(result.stories[0]).toMatchObject({
      code: undefined,
      description: undefined,
      assigneeEmail: undefined,
    });
  });
  it('accepts zero and two decimals', async () => {
    await expect(
      validate({ stories: [{ ...row, estimatedWorkDays: 1.25 }] }),
    ).resolves.toBeInstanceOf(StoryLoadDto);
  });
  it.each([[[]], [Array(201).fill(row)]])(
    'rejects invalid story count',
    async (stories) => {
      await expect(validate({ stories })).rejects.toThrow();
    },
  );
  it.each([
    { storyPoints: 1 },
    { name: 'Historia' },
    { ...row, name: '   ' },
    { ...row, extra: true },
    { ...row, storyPoints: -1 },
    { ...row, storyPoints: 1.234 },
    { ...row, storyPoints: 100000000 },
    { ...row, estimatedWorkDays: 1.234 },
    { ...row, estimatedWorkDays: -1 },
    { ...row, status: 'cancelled' },
    { ...row, name: 'a'.repeat(181) },
    { ...row, code: 'a'.repeat(61) },
    { ...row, assigneeEmail: 'bad' },
  ])('rejects %j', async (invalid) => {
    await expect(validate({ stories: [invalid] })).rejects.toThrow();
  });
  it('rejects unknown top level fields', async () => {
    await expect(validate({ stories: [row], extra: true })).rejects.toThrow();
  });
});

describe('UpdateStoryByCodeDto', () => {
  const update = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: UpdateStoryByCodeDto });
  it.each(['code', 'sprintId'])('rejects %s', async (key) => {
    await expect(update({ [key]: 'x', name: 'Nueva' })).rejects.toThrow();
  });
  it('accepts partial updates with transforms', async () => {
    await expect(
      update({ description: '  texto  ', storyPoints: 0 }),
    ).resolves.toMatchObject({ description: 'texto', storyPoints: 0 });
  });
  it.each([
    { storyPoints: -1 },
    { estimatedWorkDays: 1.234 },
    { status: 'cancelled' },
    { name: ' ' },
    { assigneeEmail: 'bad' },
  ])('validates %j', async (value) => {
    await expect(update(value)).rejects.toThrow();
  });
});

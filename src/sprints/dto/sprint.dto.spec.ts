import { ValidationPipe } from '@nestjs/common';
import { CreateSprintDto, UpdateSprintDto } from './sprint.dto';
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const base = {
  projectId: '11111111-1111-4111-8111-111111111111',
  startDate: '2026-11-01',
  endDate: '2026-11-10',
};
describe('Sprint DTO', () => {
  it.each([0, undefined])('accepts count %s', async (userStoryCount) => {
    await expect(
      pipe.transform(
        { ...base, userStoryCount },
        { type: 'body', metatype: CreateSprintDto },
      ),
    ).resolves.toBeInstanceOf(CreateSprintDto);
  });
  it('rejects 201', async () => {
    await expect(
      pipe.transform(
        { ...base, userStoryCount: 201 },
        { type: 'body', metatype: CreateSprintDto },
      ),
    ).rejects.toThrow();
  });
  it.each([
    { stories: [{ name: 'Historia', storyPoints: 0 }] },
    { confirmationToken: 'token' },
  ])('rejects creation fields on update %j', async (input) => {
    await expect(
      pipe.transform(input, { type: 'body', metatype: UpdateSprintDto }),
    ).rejects.toThrow();
  });
});

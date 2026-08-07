import { BadRequestException } from '@nestjs/common';
import { PersonnelService } from './personnel.service';
import { SupabaseDataService } from '../supabase/supabase-data.service';

describe('PersonnelService', () => {
  const dataService = {
    createPersonnel: jest.fn(),
  } as unknown as SupabaseDataService;
  const service = new PersonnelService(dataService);

  beforeEach(() => jest.clearAllMocks());

  it('creates personnel with the authenticated administrator as creator', async () => {
    jest.spyOn(dataService, 'createPersonnel').mockResolvedValue({ id: 'employee-id' });

    await expect(service.create({
      name: 'Ana Pérez',
      email: 'ana@bluecorela.com',
      role: 'Ingeniero de Software',
      teamId: 'gb-web',
    }, 'auth-user-id')).resolves.toEqual({ id: 'employee-id' });

    expect(dataService.createPersonnel).toHaveBeenCalledWith({
      name: 'Ana Pérez',
      email: 'ana@bluecorela.com',
      role: 'Ingeniero de Software',
      teamId: 'gb-web',
      createdBy: 'auth-user-id',
    });
  });

  it('rejects an engineer without a team', async () => {
    await expect(service.create({
      name: 'Ana Pérez',
      email: 'ana@bluecorela.com',
      role: 'Ingeniero de QA',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows project-level roles without a team', async () => {
    jest.spyOn(dataService, 'createPersonnel').mockResolvedValue({ id: 'architect-id' });

    await service.create({
      name: 'Ana Pérez',
      email: 'ana@bluecorela.com',
      role: 'Arquitecto',
    });

    expect(dataService.createPersonnel).toHaveBeenCalled();
  });
});

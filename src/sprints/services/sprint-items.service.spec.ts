import { BadRequestException } from '@nestjs/common';
import { SprintItemsService } from './sprint-items.service';
import { SprintItemsRepository } from '../repositories/sprint-items.repository';
import { SprintsRepository } from '../repositories/sprints.repository';

describe('SprintItemsService', () => {
  const itemsRepository = {
    update: jest.fn(),
    findAll: jest.fn(),
    createInitiative: jest.fn(),
    updateInitiative: jest.fn(),
  };
  const sprintsRepository = {
    findById: jest.fn(),
  };
  let service: SprintItemsService;

  beforeEach(() => {
    jest.clearAllMocks();
    sprintsRepository.findById.mockResolvedValue({
      id: 'sprint-id',
      status: 'in_progress',
    });
    itemsRepository.update.mockResolvedValue({ id: 'item-id' });
    itemsRepository.createInitiative.mockResolvedValue({ id: 'item-id' });
    itemsRepository.updateInitiative.mockResolvedValue({ id: 'item-id' });
    service = new SprintItemsService(
      itemsRepository as unknown as SprintItemsRepository,
      sprintsRepository as unknown as SprintsRepository,
    );
  });

  it('rechaza modificar un sprint completado', async () => {
    sprintsRepository.findById.mockResolvedValue({ status: 'completed' });
    await expect(
      service.update('team-id', 'sprint-id', 'item-id', 'stories', {
        name: 'HU',
      }),
    ).rejects.toThrow('No se puede modificar un sprint completado');
  });

  it('rechaza cambiar el código de una HU sin escribir en el repositorio', async () => {
    itemsRepository.findAll.mockResolvedValue([
      { id: 'item-id', code: ' hu-1 ', status: 'pending' },
    ]);

    const request = service.update(
      'team-id',
      'sprint-id',
      'item-id',
      'stories',
      {
        code: ' HU-2 ',
      },
    );

    await expect(request).rejects.toBeInstanceOf(BadRequestException);
    await expect(request).rejects.toThrow(
      'El código de una HU no se puede cambiar',
    );
    expect(itemsRepository.update).not.toHaveBeenCalled();
  });

  it('actualiza una HU con código equivalente sin incluir code en el payload', async () => {
    itemsRepository.findAll.mockResolvedValue([
      { id: 'item-id', code: 'HU-1', status: 'pending' },
    ]);

    await expect(
      service.update('team-id', 'sprint-id', 'item-id', 'stories', {
        code: ' hu-1 ',
        name: 'Nombre actualizado',
      }),
    ).resolves.toEqual({ id: 'item-id' });

    expect(itemsRepository.update).toHaveBeenCalledWith(
      'sprint_user_stories',
      'sprint-id',
      'item-id',
      { name: 'Nombre actualizado' },
    );
    expect(itemsRepository.update.mock.calls[0][3]).not.toHaveProperty('code');
  });

  it('clears resolved_at when reopening a bug', async () => {
    await service.update('team-id', 'sprint-id', 'item-id', 'bugs', {
      status: 'open',
    });

    expect(itemsRepository.update).toHaveBeenCalledWith(
      'sprint_bugs',
      'sprint-id',
      'item-id',
      { status: 'open', resolved_at: null },
    );
  });

  it('creates the master and sprint initiative through one transactional call', async () => {
    await service.create('team-id', 'sprint-id', 'initiatives', {
      name: 'Initiative',
      startDate: '2026-09-01',
    });

    expect(itemsRepository.createInitiative).toHaveBeenCalledWith(
      'team-id',
      'sprint-id',
      {
        name: 'Initiative',
        start_date: '2026-09-01',
      },
    );
  });

  it('updates the master and sprint initiative through one transactional call', async () => {
    await service.update('team-id', 'sprint-id', 'item-id', 'initiatives', {
      progressPercentage: 50,
    });

    expect(itemsRepository.updateInitiative).toHaveBeenCalledWith(
      'team-id',
      'sprint-id',
      'item-id',
      { progress_percentage: 50 },
    );
    expect(itemsRepository.update).not.toHaveBeenCalled();
  });

  it('clears resolved_at when monitoring a previously resolved risk', async () => {
    await service.update('team-id', 'sprint-id', 'item-id', 'risks', {
      status: 'monitoring',
    });

    expect(itemsRepository.update).toHaveBeenCalledWith(
      'sprint_risks',
      'sprint-id',
      'item-id',
      { status: 'monitoring', resolved_at: null },
    );
  });
});

import { SprintItemsService } from './sprint-items.service';
import { SprintItemsRepository } from '../repositories/sprint-items.repository';
import { SprintsRepository } from '../repositories/sprints.repository';

describe('SprintItemsService', () => {
  const itemsRepository = {
    update: jest.fn(),
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

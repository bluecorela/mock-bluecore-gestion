import { Test, TestingModule } from '@nestjs/testing';
import { RotationHistoryService } from './rotation-history.service';

describe('HistorialRotacionesService', () => {
  let service: RotationHistoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RotationHistoryService],
    }).compile();

    service = module.get<RotationHistoryService>(RotationHistoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

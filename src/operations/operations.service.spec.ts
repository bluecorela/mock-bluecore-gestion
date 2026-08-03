import { Test, TestingModule } from '@nestjs/testing';
import { OperationsService } from './operations.service';

describe('OperacionesService', () => {
  let service: OperationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OperationsService],
    }).compile();

    service = module.get<OperationsService>(OperationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

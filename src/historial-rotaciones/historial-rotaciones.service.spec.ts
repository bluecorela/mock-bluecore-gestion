import { Test, TestingModule } from '@nestjs/testing';
import { HistorialRotacionesService } from './historial-rotaciones.service';

describe('HistorialRotacionesService', () => {
  let service: HistorialRotacionesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HistorialRotacionesService],
    }).compile();

    service = module.get<HistorialRotacionesService>(HistorialRotacionesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

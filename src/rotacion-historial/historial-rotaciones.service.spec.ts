import { Test, TestingModule } from '@nestjs/testing';
import { RotacionHistorialService } from './rotacion-historial.service';

describe('HistorialRotacionesService', () => {
  let service: RotacionHistorialService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RotacionHistorialService],
    }).compile();

    service = module.get<RotacionHistorialService>(RotacionHistorialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

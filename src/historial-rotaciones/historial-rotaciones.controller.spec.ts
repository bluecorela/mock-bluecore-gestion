import { Test, TestingModule } from '@nestjs/testing';
import { HistorialRotacionesController } from './historial-rotaciones.controller';

describe('HistorialRotacionesController', () => {
  let controller: HistorialRotacionesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistorialRotacionesController],
    }).compile();

    controller = module.get<HistorialRotacionesController>(HistorialRotacionesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

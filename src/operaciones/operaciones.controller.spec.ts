import { Test, TestingModule } from '@nestjs/testing';
import { OperacionesController } from './operaciones.controller';

describe('OperacionesController', () => {
  let controller: OperacionesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OperacionesController],
    }).compile();

    controller = module.get<OperacionesController>(OperacionesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

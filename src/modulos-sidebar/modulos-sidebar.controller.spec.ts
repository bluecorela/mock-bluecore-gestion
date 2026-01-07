import { Test, TestingModule } from '@nestjs/testing';
import { ModulosSidebarController } from './modulos-sidebar.controller';

describe('ModulosSidebarController', () => {
  let controller: ModulosSidebarController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModulosSidebarController],
    }).compile();

    controller = module.get<ModulosSidebarController>(ModulosSidebarController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

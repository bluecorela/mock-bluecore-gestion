import { Test, TestingModule } from '@nestjs/testing';
import { SidebarModulesController } from './sidebar-modules.controller';

describe('ModulosSidebarController', () => {
  let controller: SidebarModulesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SidebarModulesController],
    }).compile();

    controller = module.get<SidebarModulesController>(SidebarModulesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

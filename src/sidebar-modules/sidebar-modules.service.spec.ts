import { Test, TestingModule } from '@nestjs/testing';
import { SidebarModulesService } from './sidebar-modules.service';

describe('ModulosSidebarService', () => {
  let service: SidebarModulesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SidebarModulesService],
    }).compile();

    service = module.get<SidebarModulesService>(SidebarModulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

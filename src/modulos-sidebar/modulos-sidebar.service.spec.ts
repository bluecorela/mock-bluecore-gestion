import { Test, TestingModule } from '@nestjs/testing';
import { ModulosSidebarService } from './modulos-sidebar.service';

describe('ModulosSidebarService', () => {
  let service: ModulosSidebarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ModulosSidebarService],
    }).compile();

    service = module.get<ModulosSidebarService>(ModulosSidebarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Controller, Get } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { PublicRoute, SkipAppCheck } from '../auth/access.decorators';

@SkipAppCheck()
@PublicRoute()
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  async getStatus() {
    return this.maintenanceService.getStatus();
  }
}

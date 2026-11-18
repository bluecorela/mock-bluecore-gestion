import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PublicRoute } from './auth/access.decorators';

@PublicRoute()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}

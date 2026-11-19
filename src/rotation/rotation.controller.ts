import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { RotationService } from './rotation.service';
import {
  RotatePersonnelDto,
  VacationDto,
  ReintegrateDto,
} from './dto/rotation.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('Rotacion')
@Controller('rotation')
@UseGuards(AuthGuard, AdminGuard)
@ApiBearerAuth()
export class RotationController {
  constructor(private readonly rotationService: RotationService) {}

  @Get('context')
  @ApiOperation({ summary: 'Obtener contexto para la pantalla de rotación' })
  async context() {
    return this.rotationService.getContext();
  }

  @Post('rotate')
  @ApiOperation({ summary: 'Rotar personal a otro equipo' })
  @ApiResponse({ status: 200, description: 'Rotación existosa' })
  async rotar(
    @Body() data: RotatePersonnelDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rotationService.rotatePersonnel(data, user.supabaseUserId);
  }

  @Post('vacation')
  @ApiOperation({ summary: 'Enviar personal a vacaciones' })
  @ApiResponse({ status: 200, description: 'Enviado a vacaciones' })
  async onVacation(
    @Body() data: VacationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rotationService.sendOnVacation(data, user.supabaseUserId);
  }

  @Post('reintegrate')
  @ApiOperation({ summary: 'Reintegrar personal de vacaciones' })
  @ApiResponse({ status: 200, description: 'Reintegrado exitosamente' })
  async reintegrate(
    @Body() data: ReintegrateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rotationService.reintegratePersonnel(data, user.supabaseUserId);
  }
}

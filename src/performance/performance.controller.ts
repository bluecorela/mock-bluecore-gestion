import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  BadRequestException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { CreatePerformanceEvaluationDto } from './dto/performance-evaluation.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PerformanceConfigDto } from './dto/performance-config.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@ApiTags('Performance')
@Controller('performance')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class PerformanceController {
  constructor(
    private readonly performanceService: PerformanceService,
    private readonly dataService: SupabaseDataService,
  ) {}

  @Get('config')
  @ApiOperation({
    summary: 'Obtener configuración de preguntas y respuestas de evaluación',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuración obtenida con éxito',
    type: PerformanceConfigDto,
  })
  async getConfig() {
    return this.performanceService.getConfig();
  }

  @Get('admin-overview')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({
    summary:
      'Obtener equipos, habilitaciones, miembros e historial para revisión administrativa',
  })
  getAdminOverview() {
    return this.performanceService.getAdminOverview();
  }

  @Get('context/:teamId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin', 'Arquitecto')
  @ApiOperation({
    summary: 'Obtener contexto consolidado para evaluación de desempeño',
  })
  async getContext(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!teamId) throw new BadRequestException('El equipoId es obligatorio');
    await this.dataService.assertLegacyTeamAccess(teamId, user);
    return this.performanceService.getContext(teamId);
  }

  @Post('seed')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({
    summary: 'Importar configuración inicial de preguntas a Supabase',
  })
  @ApiResponse({ status: 201, description: 'Semilla ejecutada con éxito' })
  async seedConfig() {
    return this.performanceService.seedConfig();
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin', 'Arquitecto')
  @ApiOperation({ summary: 'Guardar una evaluación de desempeño' })
  @ApiResponse({ status: 201, description: 'Evaluación guardada' })
  async save(
    @Body() data: CreatePerformanceEvaluationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.dataService.assertLegacyTeamAccess(data.teamId, user);
    return this.performanceService.save({ ...data, evaluatorName: user.name! });
  }

  @Get('history/:teamId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin', 'Arquitecto')
  @ApiOperation({
    summary: 'Obtener historial de evaluaciones de desempeño por equipo',
  })
  async getHistory(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!teamId) throw new BadRequestException('El equipoId es obligatorio');
    await this.dataService.assertLegacyTeamAccess(teamId, user);
    return this.performanceService.getHistory(teamId);
  }

  @Post('enable')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({
    summary: 'Habilitar un nuevo periodo de evaluación para un equipo',
  })
  async enable(
    @Body() body: { teamId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.teamId) {
      throw new BadRequestException('equipoId es obligatorio');
    }
    return this.performanceService.enableEvaluation(body.teamId, user.name!);
  }

  @Get('enablements')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin', 'Arquitecto')
  @ApiOperation({
    summary: 'Listar historial de habilitaciones de evaluaciones',
  })
  async getEnablements(
    @Query('teamId') teamId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role !== 'Admin') {
      if (!teamId) throw new BadRequestException('teamId es obligatorio');
      await this.dataService.assertLegacyTeamAccess(teamId, user);
    }
    return this.performanceService.getEnablements(teamId);
  }

  @Get('active-enablement/:teamId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin', 'Arquitecto')
  @ApiOperation({ summary: 'Obtener la habilitación activa para un equipo' })
  async getActiveEnablement(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.dataService.assertLegacyTeamAccess(teamId, user);
    return this.performanceService.getActiveEnablement(teamId);
  }
}

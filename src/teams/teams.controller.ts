import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateTeamDto } from './dto/create-team.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import type { SaveEvaluationRequest } from '../supabase/interfaces/supabase-interface';

@ApiTags('Equipos')
@Controller('teams')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear un nuevo equipo' })
  @ApiResponse({ status: 201, description: 'Equipo creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un equipo con ese nombre',
  })
  async create(@Body() createTeamDto: CreateTeamDto) {
    try {
      return await this.teamsService.create(createTeamDto);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message === 'Ya existe un equipo con ese nombre'
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los equipos' })
  @ApiResponse({ status: 200, description: 'Listado de equipos' })
  @ApiResponse({ status: 404, description: 'No existen equipos' })
  async findAll(@Query('onlyWithEvaluations') onlyWithEvaluations?: string) {
    const data = await this.teamsService.findAll(
      onlyWithEvaluations === 'true',
    );

    if (!data || data.length === 0) {
      throw new NotFoundException('No existen equipos');
    }

    return data;
  }

  @Get('home-context')
  @ApiOperation({
    summary: 'Obtener usuario, equipos disponibles y dashboard inicial',
  })
  async getHomeContext(@CurrentUser() user: AuthenticatedUser) {
    return this.teamsService.getHomeContext(user);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Obtener equipos y sus integrantes' })
  async getOverview() {
    return this.teamsService.getOverview();
  }

  @Get(':teamId/home-dashboard')
  @ApiOperation({
    summary:
      'Obtener dashboard consolidado operativo y de rendimiento del Home',
  })
  async getHomeDashboard(@Param('teamId') teamId: string) {
    const data = await this.teamsService.getHomeDashboard(teamId);
    if (!data) throw new NotFoundException('Equipo no encontrado');
    return data;
  }

  @Get(':teamId/dashboard')
  @ApiOperation({
    summary: 'Obtener datos consolidados para el dashboard del equipo',
  })
  @ApiParam({ name: 'equipoId', type: String, example: 'sgb-evolucion' })
  @ApiResponse({ status: 200, description: 'Datos del dashboard' })
  @ApiResponse({ status: 404, description: 'Equipo no encontrado' })
  async getDashboard(@Param('teamId') teamId: string) {
    const data = await this.teamsService.getDashboardData(teamId);
    if (!data) {
      throw new NotFoundException('Equipo no encontrado');
    }
    return data;
  }

  @Get(':teamId/sprint-board-context')
  @ApiOperation({
    summary:
      'Obtener equipo, integrantes, rotaciones, sprints y estado de evaluación',
  })
  @ApiResponse({
    status: 200,
    description: 'Contexto consolidado del cuadro de sprints',
  })
  @ApiResponse({ status: 404, description: 'Equipo no encontrado' })
  async getSprintBoardContext(@Param('teamId') teamId: string) {
    const context = await this.teamsService.getSprintBoardContext(teamId);
    if (!context) throw new NotFoundException('No existe el equipo');
    return context;
  }

  @Get(':teamId/sprints')
  @ApiParam({
    name: 'equipoId',
    type: String,
    example: 'sgb-evolucion',
    description: 'ID del equipo',
  })
  @ApiOperation({ summary: 'Obtener sprints por equipo' })
  @ApiResponse({ status: 200, description: 'Listado de sprints del equipo' })
  @ApiResponse({ status: 400, description: 'equipoId inválido' })
  @ApiResponse({
    status: 404,
    description: 'No existen sprints para este equipo',
  })
  async getSprintsByTeam(@Param('teamId') teamId: string) {
    if (!teamId) {
      throw new BadRequestException('equipoId es obligatorio');
    }

    const sprints = await this.teamsService.getSprintsByTeam(teamId);
    return sprints;
  }

  @Get(':teamId/sprints/:sprintId/members')
  @ApiOperation({ summary: 'Obtener integrantes del equipo por sprint' })
  async getMembers(
    @Param('teamId') teamId: string,
    @Param('sprintId') sprintId: string,
  ) {
    return this.teamsService.getMembersBySprint(teamId, sprintId);
  }

  @Get(':teamId/sprints/:sprintId')
  @ApiOperation({ summary: 'Obtener un sprint por equipo' })
  @ApiParam({
    name: 'equipoId',
    type: String,
    example: 'sgb-evolucion',
    description: 'ID del equipo',
  })
  @ApiParam({
    name: 'sprintId',
    type: String,
    example: 'sprint-1',
    description: 'ID del sprint',
  })
  @ApiResponse({ status: 200, description: 'Datos del sprint' })
  @ApiResponse({ status: 400, description: 'equipoId o sprintId inválido' })
  @ApiResponse({
    status: 404,
    description: 'No existe el sprint para este equipo',
  })
  async getSprint(
    @Param('teamId') teamId: string,
    @Param('sprintId') sprintId: string,
  ) {
    if (!teamId || !sprintId) {
      throw new BadRequestException('equipoId y sprintId son obligatorios');
    }

    const sprint = await this.teamsService.getSprint(teamId, sprintId);

    if (!sprint) {
      throw new NotFoundException('No existe el sprint para este equipo');
    }

    return sprint;
  }

  @Get(':teamId')
  @ApiOperation({ summary: 'Obtener un equipo por ID' })
  @ApiParam({
    name: 'equipoId',
    type: String,
    example: 'sgb-evolucion',
    description: 'ID del equipo',
  })
  @ApiResponse({ status: 200, description: 'Datos del equipo' })
  @ApiResponse({ status: 400, description: 'equipoId inválido' })
  @ApiResponse({ status: 404, description: 'No existe el equipo' })
  async getTeam(@Param('teamId') teamId: string) {
    if (!teamId) {
      throw new BadRequestException('equipoId es obligatorio');
    }

    const team = await this.teamsService.getTeam(teamId);

    if (!team) {
      throw new NotFoundException('No existe el equipo');
    }

    return team;
  }

  @Get(':teamId/sprints/:sprintId/metrics')
  @ApiOperation({ summary: 'Obtener métricas del equipo por sprint' })
  @ApiParam({ name: 'equipoId', type: String })
  @ApiParam({ name: 'sprintId', type: String })
  @ApiResponse({ status: 200 })
  async getMetricas(
    @Param('teamId') teamId: string,
    @Param('sprintId') sprintId: string,
  ) {
    if (!teamId || !sprintId) {
      throw new BadRequestException('equipoId y sprintId son obligatorios');
    }

    const metrics = await this.teamsService.getMetricas(teamId, sprintId);

    if (!metrics || metrics.summary.length === 0) {
      throw new NotFoundException('No existen métricas para este sprint');
    }

    return metrics;
  }

  @Get(':teamId/evaluation-status')
  @ApiOperation({
    summary: 'Obtener estado actual de evaluación para el equipo',
  })
  async getEvaluationStatus(
    @Param('teamId') teamId: string,
    @Query('sprintId') sprintId?: string,
  ) {
    return this.teamsService.getSprintEvaluationStatus(teamId, sprintId);
  }

  @Post('sprint-evaluation')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin', 'Arquitecto')
  @ApiOperation({ summary: 'Guardar evaluación de sprint para un integrante' })
  @ApiResponse({
    status: 201,
    description: 'Evaluación de sprint guardada exitosamente',
  })
  async saveSprintEvaluation(
    @Body() body: Partial<SaveEvaluationRequest>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teamsService.saveEvaluation({
      ...body,
      evaluatorEmail: user.email,
    });
  }
}

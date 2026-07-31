import { Controller, Get, Post, Body, Param, NotFoundException, BadRequestException, ConflictException, Query } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTeamDto } from './dto/create-team.dto';

@ApiTags('Equipos')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) { }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo equipo' })
  @ApiResponse({ status: 201, description: 'Equipo creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Ya existe un equipo con ese nombre' })
  async create(@Body() createTeamDto: CreateTeamDto) {
    try {
      return await this.teamsService.create(createTeamDto);
    } catch (error: any) {
      if (error.message === 'Ya existe un equipo con ese nombre') {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los equipos' })
  @ApiResponse({ status: 200, description: 'Listado de equipos', })
  @ApiResponse({ status: 404, description: 'No existen equipos', })
  async findAll(@Query('onlyWithEvaluations') onlyWithEvaluations?: string) {
    const data = await this.teamsService.findAll(onlyWithEvaluations === 'true');

    if (!data || data.length === 0) {
      throw new NotFoundException('No existen equipos');
    }

    return data
  }

  @Get(':teamId/dashboard')
  @ApiOperation({ summary: 'Obtener datos consolidados para el dashboard del equipo' })
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


  @Get(':teamId/sprints')
  @ApiParam({
    name: 'equipoId',
    type: String,
    example: 'sgb-evolucion',
    description: 'ID del equipo',
  })
  @ApiOperation({ summary: 'Obtener sprints por equipo' })

  @ApiResponse({ status: 200, description: 'Listado de sprints del equipo', })
  @ApiResponse({ status: 400, description: 'equipoId inválido', })
  @ApiResponse({ status: 404, description: 'No existen sprints para este equipo', })

  async getSprintsByTeam(@Param('teamId') teamId: string) {
    if (!teamId) {
      throw new BadRequestException('equipoId es obligatorio');
    }

    const sprints = await this.teamsService.getSprintsByTeam(teamId);
    return sprints;
  }

  @Get(':teamId/sprints/:sprintId/members')
  @ApiOperation({ summary: 'Obtener integrantes del equipo por sprint' })
  async getMembers(@Param('teamId') teamId: string,
    @Param('sprintId') sprintId: string,) {
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

  @ApiResponse({ status: 200, description: 'Datos del sprint', })
  @ApiResponse({ status: 400, description: 'equipoId o sprintId inválido', })
  @ApiResponse({ status: 404, description: 'No existe el sprint para este equipo', })

  async getSprint(@Param('teamId') teamId: string, @Param('sprintId') sprintId: string) {
    if (!teamId || !sprintId) {
      throw new BadRequestException('equipoId y sprintId son obligatorios');
    }

    const sprint = await this.teamsService.getSprint(teamId, sprintId,);

    if (!sprint) {
      throw new NotFoundException(
        'No existe el sprint para este equipo',
      );
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

  @ApiResponse({ status: 200, description: 'Datos del equipo', })
  @ApiResponse({ status: 400, description: 'equipoId inválido', })
  @ApiResponse({ status: 404, description: 'No existe el equipo', })

  async getTeam(@Param('teamId') teamId: string) {
    if (!teamId) {
      throw new BadRequestException('equipoId es obligatorio');
    }

    const team = await this.teamsService.getTeam(teamId);

    if (!team) {
      throw new NotFoundException(
        'No existe el equipo',
      );
    }

    return team;
  }

  //Obtener metricas del equipo por sprint --> Buscador Métricas
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
  @ApiOperation({ summary: 'Obtener estado actual de evaluación para el equipo' })
  async getEvaluationStatus(
    @Param('teamId') teamId: string,
    @Query('sprintId') sprintId?: string
  ) {
    return this.teamsService.getSprintEvaluationStatus(teamId, sprintId);
  }

  @Post('sprint-evaluation')
  @ApiOperation({ summary: 'Guardar evaluación de sprint para un integrante' })
  @ApiResponse({ status: 201, description: 'Evaluación de sprint guardada exitosamente' })
  async saveSprintEvaluation(@Body() body: any) {
    return this.teamsService.saveEvaluation(body);
  }
}

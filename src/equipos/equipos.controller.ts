import { Controller, Get, Post, Body, Param, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { EquiposService } from './equipos.service';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'; import { FirebaseClient } from '../firebase/firebase.client';
import { CreateEquipoDto } from './dto/create-equipo.dto';

@ApiTags('Equipos')
@Controller('equipos')
export class EquiposController {
  constructor(private readonly equiposService: EquiposService) { }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo equipo' })
  @ApiResponse({ status: 201, description: 'Equipo creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Ya existe un equipo con ese nombre' })
  async create(@Body() createEquipoDto: CreateEquipoDto) {
    try {
      return await this.equiposService.create(createEquipoDto);
    } catch (error) {
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

  async findAll() {
    const data = await this.equiposService.findAll();

    if (!data || data.length === 0) {
      throw new NotFoundException('No existen equipos');
    }

    return data
  }

  @Get(':equipoId/sprints')
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

  async getSprintsByEquipo(@Param('equipoId') equipoId: string) {
    if (!equipoId) {
      throw new BadRequestException('equipoId es obligatorio');
    }

    const sprints = await this.equiposService.getSprintsByEquipo(equipoId);

    if (!sprints || sprints.length === 0) {
      throw new NotFoundException('No existen sprints para este equipo');
    }

    return sprints;
  }

  @Get(':equipoId/sprints/:sprintId/integrantes')
  @ApiOperation({ summary: 'Obtener integrantes del equipo por sprint' })
  async getIntegrantes(@Param('equipoId') equipoId: string,
    @Param('sprintId') sprintId: string,) {
    return this.equiposService.getIntegrantesBySprint(equipoId, sprintId);
  }


  @Get(':equipoId/sprints/:sprintId')
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

  async getSprint(@Param('equipoId') equipoId: string, @Param('sprintId') sprintId: string) {
    if (!equipoId || !sprintId) {
      throw new BadRequestException('equipoId y sprintId son obligatorios');
    }

    const sprint = await this.equiposService.getSprint(equipoId, sprintId,);

    if (!sprint) {
      throw new NotFoundException(
        'No existe el sprint para este equipo',
      );
    }

    return sprint;
  }

  @Get(':equipoId')
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

  async getEquipo(@Param('equipoId') equipoId: string) {
    if (!equipoId) {
      throw new BadRequestException('equipoId es obligatorio');
    }

    const equipo = await this.equiposService.getEquipo(equipoId);

    if (!equipo) {
      throw new NotFoundException(
        'No existe el equipo',
      );
    }

    return equipo;
  }

  //Obtener metricas del equipo por sprint --> Buscador Métricas
  @Get(':equipoId/sprints/:sprintId/metricas')
  @ApiOperation({ summary: 'Obtener métricas del equipo por sprint' })
  @ApiParam({ name: 'equipoId', type: String })
  @ApiParam({ name: 'sprintId', type: String })
  @ApiResponse({ status: 200 })
  async getMetricas(
    @Param('equipoId') equipoId: string,
    @Param('sprintId') sprintId: string,
  ) {
    if (!equipoId || !sprintId) {
      throw new BadRequestException('equipoId y sprintId son obligatorios');
    }

    const metricas = await this.equiposService.getMetricas(equipoId, sprintId);

    if (!metricas || metricas.resumen.length === 0) {
      throw new NotFoundException('No existen métricas para este sprint');
    }

    return metricas;
  }



}

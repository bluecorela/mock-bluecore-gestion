import { Controller, Get, Param, NotFoundException, BadRequestException } from '@nestjs/common';
import { EquiposService } from './equipos.service';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Equipos')
@Controller('equipos')
export class EquiposController {
  constructor(private readonly equiposService: EquiposService) { }

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
  @ApiOperation({ summary: 'Obtener integrantes de un equipo por sprint' })
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

  @ApiResponse({ status: 200, description: 'Listado de integrantes del equipo en el sprint', })
  @ApiResponse({ status: 400, description: 'equipoId o sprintId inválido', })
  @ApiResponse({ status: 404, description: 'No existen integrantes para este equipo en el sprint', })

  async getIntegrantes(@Param('equipoId') equipoId: string, @Param('sprintId') sprintId: string) {
    if (!equipoId || !sprintId) {
      throw new BadRequestException('equipoId y sprintId son obligatorios');
    }

    const integrantes = await this.equiposService.getIntegrantesBySprint( equipoId, sprintId,);

    if (!integrantes || integrantes.length === 0) {
      throw new NotFoundException(
        'No existen integrantes para este equipo en el sprint',
      );
    }

    return integrantes;
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

    const sprint = await this.equiposService.getSprint( equipoId, sprintId,);

    if (!sprint) {
      throw new NotFoundException(
        'No existe el sprint para este equipo',
      );
    }

    return sprint;
  }
}

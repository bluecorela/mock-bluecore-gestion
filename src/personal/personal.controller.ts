import { Controller, Get, Query, BadRequestException, NotFoundException, } from '@nestjs/common';
import { PersonalService } from './personal.service';
import { ApiParam, ApiOperation, ApiTags, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { get } from 'http';

@ApiTags('Personal')
@Controller('personal')
export class PersonalController {
  constructor(private readonly personalService: PersonalService) { }

  @Get()
  @ApiOperation({ summary: 'Obtener información del usuario' })
  @ApiQuery({
    name: 'correo',
    required: true,
    type: String,
    example: 'ccharpentier@bluecorela.com',
    description: 'Correo del usuario',
  })

  @ApiResponse({ status: 200, description: 'Usuario encontrado' })
  @ApiResponse({ status: 400, description: 'El correo del usuario es obligatorio' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })

  async find(@Query('correo') correo?: string) {

    if (!correo) {
      throw new BadRequestException('El parámetro "correo" es obligatorio');
    }
    const personal = await this.personalService.findOne(correo);

    if (!personal) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return personal;
  }
  @Get('equipo')
  @ApiOperation({ summary: 'Obtener personal por equipo' })
  @ApiQuery({
    name: 'equipoId',
    required: true,
    type: String,
    example: 'sgb-evolucion',
    description: 'ID del equipo',
  })
  @ApiResponse({ status: 200, description: 'Personal del equipo encontrado' })
  @ApiResponse({ status: 400, description: 'El ID del equipo es obligatorio' })
  @ApiResponse({ status: 404, description: 'Equipo no encontrado' })

  async findEquipo(@Query('equipoId') equipoId?: string) {
    if (!equipoId) {
      throw new BadRequestException('El parámetro "equipoId" es obligatorio');
    }
    const personal = await this.personalService.findEquipo(equipoId);

    if (!personal || personal.length === 0) {
      throw new NotFoundException('Equipo no encontrado');
    }
    return personal;
  }

  @Get('personal')
  @ApiOperation({ summary: 'Obtener todo el personal' })
  @ApiResponse({ status: 200, description: 'Lista de todo el personal' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  @ApiResponse({ status: 404, description: 'No se encontró personal' })
  async findAll() {

    const personal = await this.personalService.findAll();

    if (!personal) {
      throw new NotFoundException('No se encontró personal');
    }

    return personal;

  }
}
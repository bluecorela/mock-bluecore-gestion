import { Controller, Get, Query, BadRequestException, NotFoundException, } from '@nestjs/common';
import { PersonalService } from './personal.service';
import { ApiParam, ApiOperation, ApiTags, ApiQuery, ApiResponse } from '@nestjs/swagger';

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
}

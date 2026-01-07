import { Controller, Get, Param, BadRequestException, NotFoundException, } from '@nestjs/common';
import { ModulosSidebarService } from './modulos-sidebar.service';
import { ApiParam, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';

@ApiTags('Modulos Sidebar')
@Controller('modulos-sidebar')
export class ModulosSidebarController {
    constructor(private readonly modulosSidebarService: ModulosSidebarService) { }

    @Get(':rol')
    @ApiOperation({ summary: 'Obtener módulos del sidebar por rol' })
    @ApiParam({
        name: 'rol',
        type: String,
        example: 'Arquitecto',
        description: 'Rol del usuario',
    })

    @ApiResponse({ status: 200, description: 'Módulos encontrados' })
    @ApiResponse({ status: 400, description: 'El rol es obligatorio' })
    @ApiResponse({ status: 404, description: 'No existen módulos para este rol' })

    async getModulosRol(@Param('rol') rol: string) {
    if (!rol) {
      throw new BadRequestException('El parámetro rol es obligatorio');
    }

    const modulos = await this.modulosSidebarService.getModulosRol(rol);

    if (!modulos || modulos.length === 0) {
      throw new NotFoundException(
        `No existen módulos para el rol ${rol}`,
      );
    }

    return modulos;
    }
}

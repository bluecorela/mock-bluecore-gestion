import { Controller, Get, Param, BadRequestException, NotFoundException, } from '@nestjs/common';
import { SidebarModulesService } from './sidebar-modules.service';
import { ApiParam, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';

@ApiTags('Modulos Sidebar')
@Controller('sidebar-modules')
export class SidebarModulesController {
    constructor(private readonly sidebarModulesService: SidebarModulesService) { }

    @Get(':role')
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

    async getModulesByRole(@Param('role') role: string) {
    if (!role) {
      throw new BadRequestException('El parámetro rol es obligatorio');
    }

    const modules = await this.sidebarModulesService.getModulesByRole(role);

    if (!modules || modules.length === 0) {
      throw new NotFoundException(
        `No existen módulos para el rol ${role}`,
      );
    }

    return modules;
    }
}

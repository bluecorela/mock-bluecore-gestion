import { Controller, Get, Param, BadRequestException, NotFoundException, UseGuards, ForbiddenException } from '@nestjs/common';
import { SidebarModulesService } from './sidebar-modules.service';
import { ApiBearerAuth, ApiParam, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('Modulos Sidebar')
@Controller('sidebar-modules')
@UseGuards(AuthGuard)
@ApiBearerAuth()
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

    async getModulesByRole(@Param('role') role: string, @CurrentUser() user: AuthenticatedUser) {
    if (!role) {
      throw new BadRequestException('El parámetro rol es obligatorio');
    }

    if (user.role !== 'Admin' && user.role !== role) {
      throw new ForbiddenException('No puede consultar módulos de otro rol');
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

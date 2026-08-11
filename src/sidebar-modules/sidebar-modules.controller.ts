import { Body, Controller, Get, Param, BadRequestException, NotFoundException, UseGuards, ForbiddenException, Post, Patch } from '@nestjs/common';
import { SidebarModulesService } from './sidebar-modules.service';
import { ApiBearerAuth, ApiParam, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { AdminGuard } from '../auth/admin.guard';
import { CreateSidebarModuleDto, UpdateSidebarModuleDto } from './dto/sidebar-module.dto';

@ApiTags('Modulos Sidebar')
@Controller('sidebar-modules')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class SidebarModulesController {
    constructor(private readonly sidebarModulesService: SidebarModulesService) { }

    @Get('admin/configuration')
    @UseGuards(AuthGuard, AdminGuard)
    @ApiOperation({ summary: 'Listar configuración completa del sidebar (solo Admin)' })
    getConfiguration() {
      return this.sidebarModulesService.getConfiguration();
    }

    @Post()
    @UseGuards(AuthGuard, AdminGuard)
    @ApiOperation({ summary: 'Crear un módulo del sidebar y asignarlo a roles (solo Admin)' })
    createModule(@Body() body: CreateSidebarModuleDto) {
      return this.sidebarModulesService.createModule(body);
    }

    @Patch(':moduleId')
    @UseGuards(AuthGuard, AdminGuard)
    @ApiOperation({ summary: 'Editar un módulo del sidebar y sus roles (solo Admin)' })
    updateModule(@Param('moduleId') moduleId: string, @Body() body: UpdateSidebarModuleDto) {
      return this.sidebarModulesService.updateModule(moduleId, body);
    }

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

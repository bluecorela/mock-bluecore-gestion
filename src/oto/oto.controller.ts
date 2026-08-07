import { Controller, Post, Get, Body, Param, BadRequestException, UseGuards } from '@nestjs/common';
import { OtoService } from './oto.service';
import { CreateOtoEvaluationDto } from './dto/create-oto-evaluation.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('One to One')
@Controller('oto')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class OtoController {
    constructor(private readonly otoService: OtoService) { }

    @Get('config')
    @ApiOperation({ summary: 'Obtener configuración de secciones y preguntas de One to One' })
    @ApiResponse({ status: 200, description: 'Configuración obtenida con éxito' })
    async getConfig() {
        return this.otoService.getConfig();
    }

    @Post('seed')
    @UseGuards(AuthGuard, AdminGuard)
    @ApiOperation({ summary: 'Importar configuración inicial de One to One a Supabase (ejecutar una sola vez)' })
    @ApiResponse({ status: 201, description: 'Semilla ejecutada con éxito' })
    async seedConfig() {
        return this.otoService.seedConfig();
    }

    @Post()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles('Admin', 'Arquitecto')
    @ApiOperation({ summary: 'Guardar una evaluación One to One' })
    @ApiResponse({ status: 201, description: 'Evaluación guardada' })
    async save(@Body() data: CreateOtoEvaluationDto, @CurrentUser() user: AuthenticatedUser) {
        return this.otoService.save({ ...data, evaluatorName: user.name! });
    }

    @Get('history/:teamId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles('Admin', 'Arquitecto')
    @ApiOperation({ summary: 'Obtener historial de evaluaciones One to One por equipo' })
    async getHistory(@Param('teamId') teamId: string) {
        if (!teamId) throw new BadRequestException('El equipoId es obligatorio');
        return this.otoService.getHistory(teamId);
    }
}

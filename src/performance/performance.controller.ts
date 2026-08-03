import { Controller, Post, Get, Body, Param, BadRequestException, Query } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { CreatePerformanceEvaluationDto } from './dto/performance-evaluation.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PerformanceConfigDto } from './dto/performance-config.dto';

@ApiTags('Performance')
@Controller('performance')
export class PerformanceController {
    constructor(private readonly performanceService: PerformanceService) { }

    @Get('config')
    @ApiOperation({ summary: 'Obtener configuración de preguntas y respuestas de evaluación' })
    @ApiResponse({ status: 200, description: 'Configuración obtenida con éxito', type: PerformanceConfigDto })
    async getConfig() {
        return this.performanceService.getConfig();
    }

    @Post('seed')
    @ApiOperation({ summary: 'Importar configuración inicial de preguntas a Supabase' })
    @ApiResponse({ status: 201, description: 'Semilla ejecutada con éxito' })
    async seedConfig() {
        return this.performanceService.seedConfig();
    }

    @Post()
    @ApiOperation({ summary: 'Guardar una evaluación de desempeño' })
    @ApiResponse({ status: 201, description: 'Evaluación guardada' })
    async save(@Body() data: CreatePerformanceEvaluationDto) {
        return this.performanceService.save(data);
    }

    @Get('history/:teamId')
    @ApiOperation({ summary: 'Obtener historial de evaluaciones de desempeño por equipo' })
    async getHistory(@Param('teamId') teamId: string) {
        if (!teamId) throw new BadRequestException('El equipoId es obligatorio');
        return this.performanceService.getHistory(teamId);
    }

    @Post('enable')
    @ApiOperation({ summary: 'Habilitar un nuevo periodo de evaluación para un equipo' })
    async enable(@Body() body: { teamId: string, adminName: string }) {
        if (!body.teamId || !body.adminName) {
            throw new BadRequestException('equipoId y nombreAdmin son obligatorios');
        }
        return this.performanceService.enableEvaluation(body.teamId, body.adminName);
    }

    @Get('enablements')
    @ApiOperation({ summary: 'Listar historial de habilitaciones de evaluaciones' })
    async getEnablements(@Query('teamId') teamId?: string) {
        return this.performanceService.getEnablements(teamId);
    }

    @Get('active-enablement/:teamId')
    @ApiOperation({ summary: 'Obtener la habilitación activa para un equipo' })
    async getActiveEnablement(@Param('teamId') teamId: string) {
        return this.performanceService.getActiveEnablement(teamId);
    }
}

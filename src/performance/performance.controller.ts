import { Controller, Post, Get, Body, Param, BadRequestException, Query } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { CreatePerformanceEvaluacionDto } from './dto/performance-evaluacion.dto';
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
    @ApiOperation({ summary: 'Importar configuración inicial de preguntas a Firestore' })
    @ApiResponse({ status: 201, description: 'Semilla ejecutada con éxito' })
    async seedConfig() {
        return this.performanceService.seedConfig();
    }

    @Post()
    @ApiOperation({ summary: 'Guardar una evaluación de desempeño' })
    @ApiResponse({ status: 201, description: 'Evaluación guardada' })
    async save(@Body() data: CreatePerformanceEvaluacionDto) {
        return this.performanceService.save(data);
    }

    @Get('historial/:equipoId')
    @ApiOperation({ summary: 'Obtener historial de evaluaciones de desempeño por equipo' })
    async getHistorial(@Param('equipoId') equipoId: string) {
        if (!equipoId) throw new BadRequestException('El equipoId es obligatorio');
        return this.performanceService.getHistorial(equipoId);
    }

    @Post('habilitar')
    @ApiOperation({ summary: 'Habilitar un nuevo periodo de evaluación para un equipo' })
    async habilitar(@Body() body: { equipoId: string, nombreAdmin: string }) {
        if (!body.equipoId || !body.nombreAdmin) {
            throw new BadRequestException('equipoId y nombreAdmin son obligatorios');
        }
        return this.performanceService.habilitarEvaluacion(body.equipoId, body.nombreAdmin);
    }

    @Get('habilitaciones')
    @ApiOperation({ summary: 'Listar historial de habilitaciones de evaluaciones' })
    async getHabilitaciones(@Query('equipoId') equipoId?: string) {
        return this.performanceService.getHabilitaciones(equipoId);
    }

    @Get('habilitacion-activa/:equipoId')
    @ApiOperation({ summary: 'Obtener la habilitación activa para un equipo' })
    async getHabilitacionActiva(@Param('equipoId') equipoId: string) {
        return this.performanceService.getHabilitacionActiva(equipoId);
    }
}

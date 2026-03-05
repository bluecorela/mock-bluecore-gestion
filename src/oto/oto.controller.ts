import { Controller, Post, Get, Body, Param, BadRequestException } from '@nestjs/common';
import { OtoService } from './oto.service';
import { CreateOtoEvaluacionDto } from './dto/create-oto-evaluacion.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('One to One')
@Controller('oto')
export class OtoController {
    constructor(private readonly otoService: OtoService) { }

    @Get('config')
    @ApiOperation({ summary: 'Obtener configuración de secciones y preguntas de One to One' })
    @ApiResponse({ status: 200, description: 'Configuración obtenida con éxito' })
    async getConfig() {
        return this.otoService.getConfig();
    }

    @Post('seed')
    @ApiOperation({ summary: 'Importar configuración inicial de One to One a Firestore (ejecutar una sola vez)' })
    @ApiResponse({ status: 201, description: 'Semilla ejecutada con éxito' })
    async seedConfig() {
        return this.otoService.seedConfig();
    }

    @Post()
    @ApiOperation({ summary: 'Guardar una evaluación One to One' })
    @ApiResponse({ status: 201, description: 'Evaluación guardada' })
    async save(@Body() data: CreateOtoEvaluacionDto) {
        return this.otoService.save(data);
    }

    @Get('historial/:equipoId')
    @ApiOperation({ summary: 'Obtener historial de evaluaciones One to One por equipo' })
    async getHistorial(@Param('equipoId') equipoId: string) {
        if (!equipoId) throw new BadRequestException('El equipoId es obligatorio');
        return this.otoService.getHistorial(equipoId);
    }
}

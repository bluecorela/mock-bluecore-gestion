import { Controller, Post, Body } from '@nestjs/common';
import { RotacionService } from './rotacion.service';
import { RotarPersonalDto, VacacionesDto, ReintegrarDto } from './dto/rotacion.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Rotacion')
@Controller('rotacion')
export class RotacionController {
    constructor(private readonly rotacionService: RotacionService) { }

    @Post('rotar')
    @ApiOperation({ summary: 'Rotar personal a otro equipo' })
    @ApiResponse({ status: 200, description: 'Rotación existosa' })
    async rotar(@Body() data: RotarPersonalDto) {
        return this.rotacionService.rotarPersonal(data);
    }

    @Post('vacaciones')
    @ApiOperation({ summary: 'Enviar personal a vacaciones' })
    @ApiResponse({ status: 200, description: 'Enviado a vacaciones' })
    async vacaciones(@Body() data: VacacionesDto) {
        return this.rotacionService.enviarVacaciones(data);
    }

    @Post('reintegrar')
    @ApiOperation({ summary: 'Reintegrar personal de vacaciones' })
    @ApiResponse({ status: 200, description: 'Reintegrado exitosamente' })
    async reintegrar(@Body() data: ReintegrarDto) {
        return this.rotacionService.reintegrarPersonal(data);
    }
}

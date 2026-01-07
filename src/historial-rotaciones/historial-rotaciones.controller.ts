import { Controller, Get, NotFoundException } from '@nestjs/common';
import { HistorialRotacionesService } from './historial-rotaciones.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Historial Rotaciones')
@Controller('historial-rotaciones')
export class HistorialRotacionesController {
    constructor(
        private readonly historialRotacionesService: HistorialRotacionesService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Obtener historial de rotaciones' })

    @ApiResponse({ status: 200, description: 'Listado de historial de rotaciones', })
    @ApiResponse({ status: 404, description: 'No existen registros de historial', })
    
    async findAll() {
        const data = await this.historialRotacionesService.findAll();

        if (!data || data.length === 0) {
            throw new NotFoundException('No existen registros de historial');
        }

        return data;
    }
}

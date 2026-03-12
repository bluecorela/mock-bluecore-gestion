import { Controller, Get, NotFoundException } from '@nestjs/common';
import { RotacionHistorialService } from './rotacion-historial.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Historial Rotaciones')
@Controller('rotacion-historial')
export class RotacionHistorialController {
    constructor(
        private readonly rotacionHistorialService: RotacionHistorialService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Obtener historial de rotaciones' })

    @ApiResponse({ status: 200, description: 'Listado de historial de rotaciones', })
    @ApiResponse({ status: 404, description: 'No existen registros de historial', })

    async findAll() {
        const data = await this.rotacionHistorialService.findAll();

        if (!data || data.length === 0) {
            throw new NotFoundException('No existen registros de historial');
        }

        return data;
    }
}

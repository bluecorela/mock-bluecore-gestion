import { Controller, Get, NotFoundException } from '@nestjs/common';
import { RotationHistoryService } from './rotation-history.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Historial Rotaciones')
@Controller('rotation-history')
export class RotationHistoryController {
    constructor(
        private readonly rotationHistoryService: RotationHistoryService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Obtener historial de rotaciones' })

    @ApiResponse({ status: 200, description: 'Listado de historial de rotaciones', })
    @ApiResponse({ status: 404, description: 'No existen registros de historial', })

    async findAll() {
        const data = await this.rotationHistoryService.findAll();

        if (!data || data.length === 0) {
            throw new NotFoundException('No existen registros de historial');
        }

        return data;
    }
}

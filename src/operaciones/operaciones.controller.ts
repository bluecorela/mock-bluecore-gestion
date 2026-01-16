import { Controller, Post, Body } from '@nestjs/common';
import { OperacionesService } from './operaciones.service';

@Controller('operaciones')
export class OperacionesController {
    constructor(private readonly operacionesService: OperacionesService) { }

    @Post('rendimiento/ultimo-sprint')
    calcularRendimientoUltimoSprint(
        @Body() body: {
            sprints: any[];
            historialData: any[];
            ingenierosActuales: any[];
        }
    ) {
        const { sprints, historialData, ingenierosActuales } = body;

        return this.operacionesService.calcularRendimientoUltimoSprintCerrado(
            sprints,
            historialData,
            ingenierosActuales
        );
    }

    @Post('rendimiento/sprints')
    calcularRendimientoSprints(
        @Body() body: {
            sprints: any[];
            historialData: any[];
            ingenierosActuales: any[];
        }
    ) {
        const { sprints, historialData, ingenierosActuales } = body;

        return this.operacionesService.calcularRendimientoSprints(
            sprints,
            historialData,
            ingenierosActuales
        );
    }
}

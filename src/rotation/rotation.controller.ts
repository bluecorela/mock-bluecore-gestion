import { Controller, Post, Body } from '@nestjs/common';
import { RotationService } from './rotation.service';
import { RotatePersonnelDto, VacationDto, ReintegrateDto } from './dto/rotation.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Rotacion')
@Controller('rotation')
export class RotationController {
    constructor(private readonly rotationService: RotationService) { }

    @Post('rotate')
    @ApiOperation({ summary: 'Rotar personal a otro equipo' })
    @ApiResponse({ status: 200, description: 'Rotación existosa' })
    async rotar(@Body() data: RotatePersonnelDto) {
        return this.rotationService.rotatePersonnel(data);
    }

    @Post('vacation')
    @ApiOperation({ summary: 'Enviar personal a vacaciones' })
    @ApiResponse({ status: 200, description: 'Enviado a vacaciones' })
    async onVacation(@Body() data: VacationDto) {
        return this.rotationService.sendOnVacation(data);
    }

    @Post('reintegrate')
    @ApiOperation({ summary: 'Reintegrar personal de vacaciones' })
    @ApiResponse({ status: 200, description: 'Reintegrado exitosamente' })
    async reintegrate(@Body() data: ReintegrateDto) {
        return this.rotationService.reintegratePersonnel(data);
    }
}

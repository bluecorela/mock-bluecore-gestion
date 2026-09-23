import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { RotationHistoryService } from './rotation-history.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('Historial Rotaciones')
@Controller('rotation-history')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class RotationHistoryController {
  constructor(
    private readonly rotationHistoryService: RotationHistoryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener historial de rotaciones' })
  @ApiResponse({
    status: 200,
    description: 'Listado de historial de rotaciones',
  })
  @ApiResponse({
    status: 404,
    description: 'No existen registros de historial',
  })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.rotationHistoryService.findAll();
    const accessibleTeams = new Set(
      [user.teamId, ...(user.teamIds ?? [])]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase()),
    );
    const visible =
      user.role === 'Admin'
        ? data
        : data.filter(
            (event) =>
              (event.fromTeam &&
                accessibleTeams.has(event.fromTeam.toLowerCase())) ||
              (event.toTeam && accessibleTeams.has(event.toTeam.toLowerCase())),
          );

    if (!visible.length) {
      throw new NotFoundException('No existen registros de historial');
    }

    return visible;
  }
}

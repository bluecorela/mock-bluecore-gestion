import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/auth-user.interface';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { OrganizationService } from '../../organization/services/organization.service';
import { UpdateStoryByCodeDto, StoryLoadDto } from './story-load.dto';
import { StoryUpdateService } from './story-update.service';
import { StoryLoadService } from './story-load.service';

@ApiTags('Sprint operational data')
@ApiBearerAuth()
@Controller('v2/teams/:teamId/sprints/:sprintId/stories/bulk')
@UseGuards(AuthGuard, RolesGuard)
@Roles('Admin', 'Scrum Master', 'Arquitecto')
export class StoryLoadController {
  constructor(
    private readonly service: StoryLoadService,
    private readonly organizationService: OrganizationService,
  ) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vista previa de la carga de historias' })
  @ApiOkResponse({
    description: 'Plan de carga y confirmación si no hay errores',
  })
  async preview(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StoryLoadDto,
  ) {
    await this.organizationService.assertTeamLeader(teamId, user, [
      'ARCHITECT',
      'SCRUM_MASTER',
    ]);
    return this.service.preview(teamId, sprintId, user, dto);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Confirmar la carga de historias' })
  @ApiCreatedResponse({ description: 'Historias creadas y actualizadas' })
  async apply(
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Param('sprintId', new ParseUUIDPipe()) sprintId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StoryLoadDto,
  ) {
    await this.organizationService.assertTeamLeader(teamId, user, [
      'ARCHITECT',
      'SCRUM_MASTER',
    ]);
    return this.service.apply(teamId, sprintId, user, dto);
  }
}

@ApiTags('Sprint operational data')
@ApiBearerAuth()
@Controller('v2/stories')
@UseGuards(AuthGuard, RolesGuard)
@Roles('Admin', 'Scrum Master', 'Arquitecto')
export class StoryByCodeController {
  constructor(private readonly service: StoryUpdateService) {}

  @Post('by-code/:code/preview')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Vista previa de la actualización de una HU por código',
  })
  @ApiOkResponse({ description: 'Cambios y confirmación si no hay errores' })
  preview(
    @Param('code') code: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStoryByCodeDto,
  ) {
    return this.service.previewByCode(code, user, dto);
  }

  @Patch('by-code/:code')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmar la actualización de una HU por código' })
  @ApiOkResponse({ description: 'HU actualizada' })
  apply(
    @Param('code') code: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStoryByCodeDto,
  ) {
    return this.service.applyByCode(code, user, dto);
  }
}

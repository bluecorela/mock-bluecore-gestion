import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import {
  ApplyCreateUserDto,
  ApplyDesignateDto,
  ApplyMoveDto,
  ApplyRoleDto,
  CreateUsersDto,
  DesignateRowDto,
  FindUsersDto,
  MoveRowDto,
  RoleRowDto,
} from './user-admin.dto';
import { UserAdminService } from './user-admin.service';

@ApiTags('Administración de usuarios')
@ApiResponse({
  status: 403,
  description: 'Solo administradores pueden realizar esta acción',
})
@ApiResponse({ status: 400, description: 'Datos o confirmación no válidos' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('v2/admin')
export class UserAdminController {
  constructor(private readonly service: UserAdminService) {}

  @Post('users/preview')
  @ApiOperation({ summary: 'Vista previa de altas de usuarios' })
  @ApiResponse({
    status: 201,
    description: 'Vista previa con errores, avisos y confirmaciones por fila',
  })
  previewCreate(
    @Body() body: CreateUsersDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.service.previewCreate(body.usuarios, admin);
  }
  @Post('users')
  @ApiOperation({ summary: 'Aplicar un alta confirmada' })
  @ApiResponse({ status: 201, description: 'Resultado de la fila' })
  applyCreate(
    @Body() body: ApplyCreateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.service.applyCreate(
      body.usuario,
      body.confirmationToken,
      admin,
    );
  }
  @Post('users/role/preview')
  @ApiOperation({ summary: 'Vista previa de cambio de rol' })
  @ApiResponse({ status: 201, description: 'Vista previa del cambio de rol' })
  previewRole(
    @Body() body: RoleRowDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.service.previewRole(body, admin);
  }
  @Post('users/role')
  @ApiOperation({ summary: 'Aplicar un cambio de rol confirmado' })
  @ApiResponse({ status: 201, description: 'Resultado de la fila' })
  applyRole(
    @Body() body: ApplyRoleDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const { confirmationToken, ...row } = body;
    return this.service.applyRole(row, confirmationToken, admin);
  }
  @Post('users/move/preview')
  @ApiOperation({ summary: 'Vista previa de movimiento de equipo' })
  @ApiResponse({ status: 201, description: 'Vista previa del movimiento' })
  previewMove(
    @Body() body: MoveRowDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.service.previewMove(body, admin);
  }
  @Post('users/move')
  @ApiOperation({ summary: 'Aplicar un movimiento confirmado' })
  @ApiResponse({ status: 201, description: 'Resultado de la fila' })
  applyMove(
    @Body() body: ApplyMoveDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const { confirmationToken, ...row } = body;
    return this.service.applyMove(row, confirmationToken, admin);
  }
  @Post('team-leaders/preview')
  @ApiOperation({ summary: 'Vista previa de designación de líder' })
  @ApiResponse({ status: 201, description: 'Vista previa de la designación' })
  previewDesignate(
    @Body() body: DesignateRowDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.service.previewDesignate(body, admin);
  }
  @Post('team-leaders')
  @ApiOperation({ summary: 'Aplicar una designación confirmada' })
  @ApiResponse({ status: 201, description: 'Resultado de la fila' })
  applyDesignate(
    @Body() body: ApplyDesignateDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const { confirmationToken, ...row } = body;
    return this.service.applyDesignate(row, confirmationToken, admin);
  }
  @Get('users')
  @ApiOperation({ summary: 'Buscar usuarios por nombre, correo o equipo' })
  @ApiResponse({
    status: 200,
    description: 'Hasta 50 usuarios con sus roles y equipos',
  })
  findUsers(@Query() query: FindUsersDto) {
    return this.service.findUsers(query);
  }
}

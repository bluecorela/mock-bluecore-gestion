import { Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './interfaces/auth-user.interface';
import { AdminGuard } from './admin.guard';
import { CreateAuthUserDto } from './dto/create-auth-user.dto';
import { UpdateAuthUserDto } from './dto/update-auth-user.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('validate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validar access token de Supabase' })
  @ApiResponse({ status: 200, description: 'Token válido' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  async validate(@Headers('authorization') authorization?: string) {
    return this.authService.validateAuthorizationHeader(authorization);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener usuario autenticado y perfil de personal' })
  @ApiResponse({ status: 200, description: 'Usuario autenticado' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('users')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar usuarios/personal para administración' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  @ApiResponse({ status: 403, description: 'Solo administradores' })
  getUsers() {
    return this.authService.getUsers();
  }

  @Get('users/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener usuario/personal por ID' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async getUser(@Param('id') id: string) {
    const user = await this.authService.getUser(id);

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  @Post('users')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear usuario en Supabase Auth y tabla personal' })
  @ApiResponse({ status: 201, description: 'Usuario creado' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  @ApiResponse({ status: 403, description: 'Solo administradores' })
  createUser(@Body() body: CreateAuthUserDto) {
    return this.authService.createUser(body);
  }

  @Patch('password/change-completed')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Marcar cambio de contraseña inicial como completado' })
  @ApiResponse({ status: 200, description: 'Cambio marcado como completado' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  markPasswordChanged(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.markPasswordChanged(user);
  }

  @Patch('users/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar usuario/personal y su estado' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  @ApiResponse({ status: 403, description: 'Solo administradores' })
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdateAuthUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const result = await this.authService.updateUser(id, body, currentUser.supabaseUserId);

    if (!result) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return result;
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { PersonnelService } from './personnel.service';
import {
  ApiOperation,
  ApiTags,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CreatePersonnelDto } from './dto/create-personnel.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('Personal')
@Controller('personnel')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class PersonnelController {
  constructor(private readonly personnelService: PersonnelService) {}

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear un nuevo miembro del personal' })
  @ApiResponse({ status: 201, description: 'Miembro creado exitosamente' })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o validación de negocio fallida',
  })
  async create(
    @Body() createPersonnelDto: CreatePersonnelDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return await this.personnelService.create(
      createPersonnelDto,
      user.supabaseUserId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Obtener información del usuario' })
  @ApiQuery({
    name: 'email',
    required: true,
    type: String,
    example: 'ccharpentier@bluecorela.com',
    description: 'Correo del usuario',
  })
  @ApiResponse({ status: 200, description: 'Usuario encontrado' })
  @ApiResponse({
    status: 400,
    description: 'El correo del usuario es obligatorio',
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async find(
    @Query('email') email: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!email) {
      throw new BadRequestException('El parámetro "correo" es obligatorio');
    }
    if (
      user.role !== 'Admin' &&
      email.toLowerCase() !== user.email.toLowerCase()
    ) {
      throw new ForbiddenException('No tiene acceso a este perfil');
    }
    const personnel = await this.personnelService.findOne(email);

    if (!personnel) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return personnel;
  }
  @Get('team')
  @ApiOperation({ summary: 'Obtener personal por equipo' })
  @ApiQuery({
    name: 'teamId',
    required: true,
    type: String,
    example: 'sgb-evolucion',
    description: 'ID del equipo',
  })
  @ApiResponse({
    status: 200,
    description: 'Personal del equipo encontrado (puede ser un array vacío)',
  })
  @ApiResponse({ status: 400, description: 'El ID del equipo es obligatorio' })
  async findByTeam(
    @Query('teamId') teamId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!teamId) {
      throw new BadRequestException('El parámetro "equipoId" es obligatorio');
    }
    const accessibleTeams = new Set(
      [user.teamId, ...(user.teamIds ?? [])]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase()),
    );
    if (
      user.role !== 'Admin' &&
      !accessibleTeams.has(teamId.toLowerCase())
    ) {
      throw new ForbiddenException('No tiene acceso a este equipo');
    }
    const personnel = await this.personnelService.findByTeam(teamId);
    return personnel || [];
  }

  @Get('vacations')
  @ApiOperation({ summary: 'Obtener personal actualmente en vacaciones' })
  @ApiResponse({ status: 200, description: 'Lista de personal en vacaciones' })
  @UseGuards(AuthGuard, AdminGuard)
  async getVacationingPersonnel() {
    return await this.personnelService.getVacationingPersonnel();
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener todo el personal' })
  @ApiResponse({ status: 200, description: 'Lista de todo el personal' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  @ApiResponse({ status: 404, description: 'No se encontró personal' })
  @UseGuards(AuthGuard, AdminGuard)
  async findAll() {
    const personnel = await this.personnelService.findAll();

    if (!personnel) {
      throw new NotFoundException('No se encontró personal');
    }

    return personnel;
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';
import { CreatePersonalDto } from './dto/create-personal.dto';

@Injectable()
export class PersonalService {
  constructor(private readonly firebaseClient: FirebaseClient) { }

  async findOne(correo: string) {
    return this.firebaseClient.getPersonalByEmail(decodeURIComponent(correo));
  }

  async findEquipo(equipoId: string) {
    return this.firebaseClient.getPersonalByEquipo(equipoId);
  }

  async findAll() {
    return this.firebaseClient.getPersonal();
  }

  async create(createPersonalDto: CreatePersonalDto) {
    const { nombre, rol, correo, equipoId } = createPersonalDto;

    // Validaciones de negocio según el rol
    if (rol === 'Admin' && !correo) {
      throw new BadRequestException('El rol Admin requiere correo');
    }

    if (rol === 'Arquitecto' && (!correo || !equipoId)) {
      throw new BadRequestException('El rol Arquitecto requiere correo y equipo');
    }

    if (['Ingeniero de Software', 'Ingeniero de QA', 'Pasante'].includes(rol) && !equipoId) {
      throw new BadRequestException(`El rol ${rol} requiere equipo`);
    }

    return this.firebaseClient.createPersonal({ nombre, rol, correo, equipoId });
  }

}
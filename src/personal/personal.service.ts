import { Injectable } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';

@Injectable()
export class PersonalService {
  constructor(private readonly firebaseClient: FirebaseClient) {}

  async findOne(correo: string) {
    return this.firebaseClient.getPersonalByEmail(decodeURIComponent(correo));
  }

  async findEquipo(equipoId: string) {
    return this.firebaseClient.getPersonalByEquipo(equipoId);
  }
}
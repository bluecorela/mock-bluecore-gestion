import { Injectable } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';

@Injectable()
export class ModulosSidebarService {
constructor(private readonly firebaseClient: FirebaseClient) { }

  async getModulosRol(rol: string) {
    return this.firebaseClient.getModulosRol(rol);
  }

}

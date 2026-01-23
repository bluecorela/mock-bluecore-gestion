import { Injectable } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';

@Injectable()
export class AdministracionDatosService {
    constructor(private readonly firebaseClient: FirebaseClient) { }

      async guardarEvaluacion(data: any) {
    return this.firebaseClient.guardarEvaluacion(data);
  }

}

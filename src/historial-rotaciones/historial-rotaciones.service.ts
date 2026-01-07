import { Injectable } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';

@Injectable()
export class HistorialRotacionesService {
  constructor(private readonly firebaseClient: FirebaseClient) {}

  async findAll() {
    const historial = await this.firebaseClient.getHistorialRotaciones();

    return historial.map((item: any) => ({
      ...item,
      fecha: item.fecha?.toDate
        ? item.fecha.toDate()
        : item.fecha?.seconds
          ? new Date(item.fecha.seconds * 1000)
          : null,
    }));
  }
}

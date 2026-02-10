import { Injectable } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';

@Injectable()
export class EquiposService {
  constructor(private readonly firebaseClient: FirebaseClient) { }

  async findAll() {
    return this.firebaseClient.getEquipos();
  }
  async getSprintsByEquipo(equipoId: string) {
    const sprints = await this.firebaseClient.getSprintsByEquipo(equipoId);
    return sprints.map((s: any) => ({
      id: s.id,
      nombre: s.id,
      fechaInicio: s.fecha_inicio?.toDate?.() ?? null,
      fechaFin: s.fecha_fin?.toDate?.() ?? null,
      sprintsCerrado:s.sprint_cerrado?.toDate?.() ?? null,
    }));
  }
  async getIntegrantesBySprint(equipoId: string, sprintId: string) {
    return this.firebaseClient.getIntegrantesBySprint(equipoId, sprintId);
  }
  async getSprint(equipoId: string, sprintId: string) {
    return this.firebaseClient.getSprint(equipoId, sprintId);
  }

  async getEquipo(equipoId: string) {
    return this.firebaseClient.getEquipo(equipoId);
  }

  async getMetricas(equipoId: string, sprintId: string){
    return this.firebaseClient.obtenerMetricas(equipoId, sprintId);
  }
  
}

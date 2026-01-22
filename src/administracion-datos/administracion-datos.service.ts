import { Injectable } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';

@Injectable()
export class AdministracionDatosService {
    constructor(private readonly firebaseClient: FirebaseClient) { }

    async guardarEvaluacion(data: any) {
        console.log('Payload recibido:', data);

        try {
            const {
                equipoId,
                sprintId,
                fechaInicio,
                fechaFin,
                ingeniero,
                metricas,
                puntuacionFinal,
                calificacionTexto,
                comentarios,
                evaluadorCorreo,
            } = data;

            const nombreIngeniero = ingeniero.split(' – ')[0];
            const integranteId = nombreIngeniero.toLowerCase().replace(/\s/g, '-');

            const db = (this.firebaseClient as any).db;

            const sprintRef = db
                .collection('equipos')
                .doc(equipoId)
                .collection('sprints')
                .doc(sprintId);

            const sprintSnap = await sprintRef.get();

            if (!sprintSnap.exists) {
                await sprintRef.set({
                    fecha_inicio: new Date(fechaInicio),
                    fecha_fin: new Date(fechaFin),
                });
            }

            await sprintRef.collection('Integrantes').doc(integranteId).set(
                {
                    nombre: nombreIngeniero,
                    ...metricas,
                    total_final: puntuacionFinal,
                    calificacion: calificacionTexto,
                    comentarios: comentarios ?? '',
                    evaluado_por: evaluadorCorreo,
                    fecha_evaluacion: new Date(),
                },
                { merge: true }
            );

            return { ok: true };
        } catch (error) {
            console.error('❌ Error guardando evaluación', error);
            throw error;
        }
    }

}

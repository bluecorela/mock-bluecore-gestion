import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';
import { RotarPersonalDto, VacacionesDto, ReintegrarDto } from './dto/rotacion.dto';

@Injectable()
export class RotacionService {
    constructor(private readonly firebaseClient: FirebaseClient) { }

    async rotarPersonal(data: RotarPersonalDto) {
        // 1. Validar equipos (opcional, pero buena práctica)
        const equipoDestino = await this.firebaseClient.getEquipo(data.equipoDestinoId) as any;
        if (!equipoDestino) throw new Error('Equipo destino no encontrado');

        // 2. Actualizar equipo del personal
        // 2. Actualizar equipo del personal
        await this.firebaseClient.updatePersonalEquipo(data.personalId, data.equipoDestinoId);

        // 3. Registrar historial
        const personal = await this.firebaseClient.getPersonalById(data.personalId) as any;
        const equipoOrigen = await this.firebaseClient.getEquipo(data.equipoOrigenId) as any;
        const equipoDestinoObj = await this.firebaseClient.getEquipo(data.equipoDestinoId) as any;

        await this.firebaseClient.addHistorialRotacion({
            personalId: data.personalId,
            nombre: personal ? personal.nombre : 'Desconocido',
            desde: data.equipoOrigenId,
            hacia: data.equipoDestinoId,
            desdeNombre: equipoOrigen ? equipoOrigen.nombre : data.equipoOrigenId,
            haciaNombre: equipoDestinoObj ? equipoDestinoObj.nombre : data.equipoDestinoId,
            fecha: new Date(),
            tipo: 'rotacion',
        });

        return { message: 'Rotación existosa' };
    }

    async enviarVacaciones(data: VacacionesDto) {
        await this.firebaseClient.updatePersonalVacaciones(data.personalId, true);

        const personal = await this.firebaseClient.getPersonalById(data.personalId) as any;

        // Fetch explícito para asegurar nombres
        const equipoOrigen = await this.firebaseClient.getEquipo(data.equipoOrigenId) as any;
        if (!equipoOrigen) console.warn(`Vacaciones: Equipo origen ${data.equipoOrigenId} no encontrado`);

        // Logic for replacement if any
        if (data.reemplazoId) {
            const reemplazo = await this.firebaseClient.getPersonalById(data.reemplazoId) as any;

            await this.firebaseClient.updatePersonalEquipo(data.reemplazoId, data.equipoOrigenId);

            await this.firebaseClient.addHistorialRotacion({
                personalId: data.reemplazoId,
                nombre: reemplazo ? reemplazo.nombre : 'Reemplazo',
                tipo: 'cubriendo-vacaciones',
                desde: 'pool-de-vacaciones',
                hacia: data.equipoOrigenId,
                desdeNombre: 'Pool de vacaciones',
                haciaNombre: equipoOrigen ? equipoOrigen.nombre : data.equipoOrigenId,
                fecha: new Date()
            });
        }

        await this.firebaseClient.addHistorialRotacion({
            personalId: data.personalId,
            nombre: personal ? personal.nombre : 'Desconocido',
            tipo: 'vacaciones',
            desde: data.equipoOrigenId,
            hacia: 'pool-de-vacaciones',
            desdeNombre: equipoOrigen ? equipoOrigen.nombre : data.equipoOrigenId,
            haciaNombre: 'Pool de vacaciones',
            fecha: new Date()
        });

        return { message: 'Enviado a vacaciones' };
    }

    async reintegrarPersonal(data: ReintegrarDto) {
        await this.firebaseClient.updatePersonalVacaciones(data.personalId, false);

        const personal = await this.firebaseClient.getPersonalById(data.personalId) as any;
        let equipoDestinoObj: any = null;
        let equipoDestinoId = data.equipoDestinoId;

        if (equipoDestinoId) {
            // Caso 1: Se especifica un nuevo equipo destino
            await this.firebaseClient.updatePersonalEquipo(data.personalId, equipoDestinoId);
            equipoDestinoObj = await this.firebaseClient.getEquipo(equipoDestinoId) as any;
        } else {
            // Caso 2: No se especifica, vuelve a su equipo original (resolviendo referencia)
            if (personal && personal.equipo && personal.equipo.id) {
                // personal.equipo es un DocumentReference
                equipoDestinoId = personal.equipo.id;
                equipoDestinoObj = await this.firebaseClient.getEquipo(equipoDestinoId!) as any;
            } else {
                console.warn(`Reintegrar: No se pudo determinar el equipo origen para ${data.personalId}`);
                equipoDestinoId = 'indefinido';
            }
        }

        await this.firebaseClient.addHistorialRotacion({
            personalId: data.personalId,
            nombre: personal ? personal.nombre : 'Desconocido',
            tipo: 'reintegracion',
            desde: 'pool-de-vacaciones',
            hacia: equipoDestinoId || 'indefinido',
            desdeNombre: 'Pool de vacaciones',
            haciaNombre: equipoDestinoObj ? equipoDestinoObj.nombre : (equipoDestinoId || 'Indefinido'),
            fecha: new Date()
        });

        return { message: 'Reintegrado exitosamente' };
    }
}

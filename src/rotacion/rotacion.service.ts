import { Injectable } from '@nestjs/common';
import { RotarPersonalDto, VacacionesDto, ReintegrarDto } from './dto/rotacion.dto';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class RotacionService {
    constructor(private readonly supabaseDataService: SupabaseDataService) { }

    async rotarPersonal(data: RotarPersonalDto) {
        // 1. Validar equipos (opcional, pero buena práctica)
        const equipoDestino = await this.supabaseDataService.getEquipo(data.equipoDestinoId);
        if (!equipoDestino) throw new Error('Equipo destino no encontrado');

        // 2. Actualizar equipo del personal
        await this.supabaseDataService.updatePersonalEquipo(data.personalId, data.equipoDestinoId);

        // 3. Registrar historial
        const personal = await this.supabaseDataService.getPersonalById(data.personalId);
        const equipoOrigen = await this.supabaseDataService.getEquipo(data.equipoOrigenId);
        const equipoDestinoObj = await this.supabaseDataService.getEquipo(data.equipoDestinoId);

        await this.supabaseDataService.addHistorialRotacion({
            personalId: data.personalId,
            nombre: personal?.nombre ?? 'Desconocido',
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
        await this.supabaseDataService.updatePersonalVacaciones(data.personalId, true);

        const personal = await this.supabaseDataService.getPersonalById(data.personalId);

        // Fetch explícito para asegurar nombres
        const equipoOrigen = await this.supabaseDataService.getEquipo(data.equipoOrigenId);
        if (!equipoOrigen) console.warn(`Vacaciones: Equipo origen ${data.equipoOrigenId} no encontrado`);

        // Logic for replacement if any
        if (data.reemplazoId) {
            const reemplazo = await this.supabaseDataService.getPersonalById(data.reemplazoId);

            await this.supabaseDataService.updatePersonalEquipo(data.reemplazoId, data.equipoOrigenId);

            await this.supabaseDataService.addHistorialRotacion({
                personalId: data.reemplazoId,
                nombre: reemplazo?.nombre ?? 'Reemplazo',
                tipo: 'cubriendo-vacaciones',
                desde: 'pool-de-vacaciones',
                hacia: data.equipoOrigenId,
                desdeNombre: 'Pool de vacaciones',
                haciaNombre: equipoOrigen ? equipoOrigen.nombre : data.equipoOrigenId,
                fecha: new Date()
            });
        }

        await this.supabaseDataService.addHistorialRotacion({
            personalId: data.personalId,
            nombre: personal?.nombre ?? 'Desconocido',
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
        await this.supabaseDataService.updatePersonalVacaciones(data.personalId, false);

        const personal = await this.supabaseDataService.getPersonalById(data.personalId);
        let equipoDestinoObj: any = null;
        let equipoDestinoId = data.equipoDestinoId;

        if (equipoDestinoId) {
            // Caso 1: Se especifica un nuevo equipo destino
            await this.supabaseDataService.updatePersonalEquipo(data.personalId, equipoDestinoId);
            equipoDestinoObj = await this.supabaseDataService.getEquipo(equipoDestinoId);
        } else {
            // Caso 2: No se especifica, vuelve a su equipo original (resolviendo referencia)
            if (personal && personal.equipo && personal.equipo.id) {
                // personal.equipo es un DocumentReference
                equipoDestinoId = personal.equipo.id;
                equipoDestinoObj = await this.supabaseDataService.getEquipo(equipoDestinoId!);
            } else {
                console.warn(`Reintegrar: No se pudo determinar el equipo origen para ${data.personalId}`);
                equipoDestinoId = 'indefinido';
            }
        }

        await this.supabaseDataService.addHistorialRotacion({
            personalId: data.personalId,
            nombre: personal?.nombre ?? 'Desconocido',
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

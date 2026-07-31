import { Injectable } from '@nestjs/common';
import { RotatePersonnelDto, VacationDto, ReintegrateDto } from './dto/rotation.dto';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class RotationService {
    constructor(private readonly supabaseDataService: SupabaseDataService) { }

    async rotatePersonnel(data: RotatePersonnelDto) {
        // 1. Validar equipos (opcional, pero buena práctica)
        const destinationTeam = await this.supabaseDataService.getTeam(data.destinationTeamId);
        if (!destinationTeam) throw new Error('Equipo destino no encontrado');

        // 2. Actualizar equipo del personal
        await this.supabaseDataService.updatePersonnelTeam(data.personnelId, data.destinationTeamId);

        // 3. Registrar historial
        const personnel = await this.supabaseDataService.getPersonnelById(data.personnelId);
        const sourceTeam = await this.supabaseDataService.getTeam(data.sourceTeamId);
        const destinationTeamRecord = await this.supabaseDataService.getTeam(data.destinationTeamId);

        await this.supabaseDataService.addRotationHistory({
            personnelId: data.personnelId,
            name: personnel?.name ?? 'Desconocido',
            fromTeam: data.sourceTeamId,
            toTeam: data.destinationTeamId,
            sourceName: sourceTeam ? sourceTeam.name : data.sourceTeamId,
            destinationName: destinationTeamRecord ? destinationTeamRecord.name : data.destinationTeamId,
            date: new Date(),
            type: 'rotacion',
        });

        return { message: 'Rotación existosa' };
    }

    async sendOnVacation(data: VacationDto) {
        await this.supabaseDataService.updatePersonnelVacation(data.personnelId, true);

        const personnel = await this.supabaseDataService.getPersonnelById(data.personnelId);

        // Fetch explícito para asegurar nombres
        const sourceTeam = await this.supabaseDataService.getTeam(data.sourceTeamId);
        if (!sourceTeam) console.warn(`Vacaciones: Equipo origen ${data.sourceTeamId} no encontrado`);

        // Logic for replacement if any
        if (data.replacementId) {
            const replacement = await this.supabaseDataService.getPersonnelById(data.replacementId);

            await this.supabaseDataService.updatePersonnelTeam(data.replacementId, data.sourceTeamId);

            await this.supabaseDataService.addRotationHistory({
                personnelId: data.replacementId,
                name: replacement?.name ?? 'Reemplazo',
                type: 'cubriendo-vacaciones',
                fromTeam: 'pool-de-vacaciones',
                toTeam: data.sourceTeamId,
                sourceName: 'Pool de vacaciones',
                destinationName: sourceTeam ? sourceTeam.name : data.sourceTeamId,
                date: new Date()
            });
        }

        await this.supabaseDataService.addRotationHistory({
            personnelId: data.personnelId,
            name: personnel?.name ?? 'Desconocido',
            type: 'vacaciones',
            fromTeam: data.sourceTeamId,
            toTeam: 'pool-de-vacaciones',
            sourceName: sourceTeam ? sourceTeam.name : data.sourceTeamId,
            destinationName: 'Pool de vacaciones',
            date: new Date()
        });

        return { message: 'Enviado a vacaciones' };
    }

    async reintegratePersonnel(data: ReintegrateDto) {
        await this.supabaseDataService.updatePersonnelVacation(data.personnelId, false);

        const personnel = await this.supabaseDataService.getPersonnelById(data.personnelId);
        let destinationTeamRecord: any = null;
        let destinationTeamId = data.destinationTeamId;

        if (destinationTeamId) {
            // Caso 1: Se especifica un nuevo equipo destino
            await this.supabaseDataService.updatePersonnelTeam(data.personnelId, destinationTeamId);
            destinationTeamRecord = await this.supabaseDataService.getTeam(destinationTeamId);
        } else {
            // Caso 2: No se especifica, vuelve a su equipo original (resolviendo referencia)
            if (personnel && personnel.team && personnel.team.id) {
                // personal.equipo es un DocumentReference
                destinationTeamId = personnel.team.id;
                destinationTeamRecord = await this.supabaseDataService.getTeam(destinationTeamId!);
            } else {
                console.warn(`Reintegrar: No se pudo determinar el team origen para ${data.personnelId}`);
                destinationTeamId = 'indefinido';
            }
        }

        await this.supabaseDataService.addRotationHistory({
            personnelId: data.personnelId,
            name: personnel?.name ?? 'Desconocido',
            type: 'reintegracion',
            fromTeam: 'pool-de-vacaciones',
            toTeam: destinationTeamId || 'indefinido',
            sourceName: 'Pool de vacaciones',
            destinationName: destinationTeamRecord ? destinationTeamRecord.name : (destinationTeamId || 'Indefinido'),
            date: new Date()
        });

        return { message: 'Reintegrado exitosamente' };
    }
}

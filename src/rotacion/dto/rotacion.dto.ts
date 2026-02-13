export class RotarPersonalDto {
    personalId: string;
    equipoDestinoId: string;
    equipoOrigenId: string; // Para el historial
}

export class VacacionesDto {
    personalId: string;
    equipoOrigenId: string;
    reemplazoId?: string; // Opcional, si hay reemplazo
}

export class ReintegrarDto {
    personalId: string;
    equipoDestinoId?: string; // Opcional, si cambia de equipo al volver
    equipoOrigenId?: string; // Debería ser 'pool-de-vacaciones'
}

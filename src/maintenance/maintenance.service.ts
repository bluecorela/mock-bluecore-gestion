import { Injectable } from '@nestjs/common';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class MaintenanceService {
    constructor(private readonly supabaseDataService: SupabaseDataService) { }

    async getStatus() {
        const status = await this.supabaseDataService.getMaintenanceStatus();
        return {
            active: status?.active ?? false,
        };
    }
}

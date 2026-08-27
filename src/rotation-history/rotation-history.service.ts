import { Injectable } from '@nestjs/common';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class RotationHistoryService {
  constructor(private readonly supabaseDataService: SupabaseDataService) {}

  async findAll() {
    const history = await this.supabaseDataService.getRotationHistory();

    return history.map((item) => ({
      ...item,
      date: item.date ? new Date(item.date) : null,
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { SupabaseDataService } from '../supabase/supabase-data.service';

@Injectable()
export class RotationHistoryService {
  constructor(private readonly supabaseDataService: SupabaseDataService) {}

  findTeamsForUser(
    user: import('../auth/interfaces/auth-user.interface').AuthenticatedUser,
  ) {
    return this.supabaseDataService.findLegacyTeamsForUser(user);
  }

  async findAll() {
    const history = await this.supabaseDataService.getRotationHistory();

    return history.map((item) => ({
      ...item,
      date: item.date ? new Date(item.date) : null,
    }));
  }
}

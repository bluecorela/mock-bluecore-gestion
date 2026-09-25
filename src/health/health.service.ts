import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseClient } from '../supabase/supabase.client';

@Injectable()
export class HealthService {
  constructor(private readonly supabase: SupabaseClient) {}

  async check() {
    const query = this.supabase
      .getV2Client()
      .from('roles')
      .select('id')
      .limit(1);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database health check timed out')), 3000),
    );

    try {
      const { error } = await Promise.race([query, timeout]);
      if (error) throw error;
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'down',
      });
    }
  }
}

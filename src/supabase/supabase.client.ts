import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient as SupabaseJsClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseClient {
  private readonly client: SupabaseJsClient;
  private readonly publicClient: SupabaseJsClient | null;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios');
    }

    this.client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.publicClient = supabaseAnonKey
      ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
      : null;
  }

  getClient() {
    return this.client;
  }

  getPublicClient() {
    if (!this.publicClient) {
      throw new Error('SUPABASE_ANON_KEY es obligatorio para enviar correos de recuperación');
    }

    return this.publicClient;
  }
}

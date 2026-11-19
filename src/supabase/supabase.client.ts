import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  SupabaseClient as SupabaseJsClient,
} from '@supabase/supabase-js';

@Injectable()
export class SupabaseClient {
  private readonly client: SupabaseJsClient;
  private readonly publicClient: SupabaseJsClient | null;
  private readonly v2Schema: string;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceRoleKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    this.v2Schema =
      this.configService.get<string>('SUPABASE_V2_SCHEMA') || 'bluecore_v2';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(
        'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios',
      );
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

  /**
   * Database access for the normalized schema.
   */
  getV2Client() {
    return this.client.schema(this.v2Schema);
  }

  getV2SchemaName() {
    return this.v2Schema;
  }

  getPublicClient() {
    if (!this.publicClient) {
      throw new Error(
        'SUPABASE_ANON_KEY es obligatorio para enviar correos de recuperación',
      );
    }

    return this.publicClient;
  }
}

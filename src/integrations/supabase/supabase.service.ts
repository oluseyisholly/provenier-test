import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly clientInstance: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('supabase.url');
    const key = this.configService.get<string>('supabase.serviceRoleKey');

    if (!url || !key) {
      throw new Error('Supabase configuration is missing.');
    }

    this.clientInstance = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  get client(): SupabaseClient {
    return this.clientInstance;
  }
}

import { handleRequest } from './handler.mjs';

Deno.serve((request: Request) => handleRequest(request, {
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  allowedOrigins: Deno.env.get('ALLOWED_ORIGINS') || 'https://miaogemiao.xin',
}));

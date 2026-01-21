export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
  redis: {
    url: process.env.REDIS_URL ?? '',
  },
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  simulator: {
    matchCount: parseInt(process.env.SIM_MATCH_COUNT ?? '5', 10),
    minuteMs: parseInt(process.env.SIM_MINUTE_MS ?? '1000', 10),
  },
  realtime: {
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL ?? '25000', 10),
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT ?? '20000', 10),
  },
});

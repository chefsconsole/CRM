type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = order[(process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === 'test' ? 'warn' : 'info')] ?? 20;

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (order[level] < min) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => emit('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};

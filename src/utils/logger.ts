// ============================================================
//  LOGGER — Structured Timestamped Console Logger
// ============================================================

export type LogLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'DEBUG' | 'CHAIN' | 'SETTLE' | 'TX';

const LEVEL_COLORS: Record<LogLevel, string> = {
  INFO:    '\x1b[36m',   // Cyan
  SUCCESS: '\x1b[32m',   // Green
  WARN:    '\x1b[33m',   // Yellow
  ERROR:   '\x1b[31m',   // Red
  DEBUG:   '\x1b[35m',   // Magenta
  CHAIN:   '\x1b[34m',   // Blue  - blockchain events
  SETTLE:  '\x1b[33m',   // Yellow - settlement events
  TX:      '\x1b[92m',   // Bright Green - transaction events
};

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

function now(): string {
  return new Date().toISOString();
}

function pad(level: LogLevel): string {
  return level.padEnd(7);
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    return '\n' + JSON.stringify(value, null, 2)
      .split('\n')
      .map(l => '         ' + l)
      .join('\n');
  }
  return String(value);
}

export const logger = {
  log(level: LogLevel, message: string, data?: unknown): void {
    const color = LEVEL_COLORS[level] ?? '';
    const ts = `\x1b[90m${now()}\x1b[0m`;
    const tag = `${color}${BOLD}[${pad(level)}]${RESET}`;
    const msg = `${color}${message}${RESET}`;
    const extra = data !== undefined ? formatValue(data) : '';
    console.log(`${ts} ${tag} ${msg}${extra}`);
  },

  info(message: string, data?: unknown): void {
    this.log('INFO', message, data);
  },

  success(message: string, data?: unknown): void {
    this.log('SUCCESS', message, data);
  },

  warn(message: string, data?: unknown): void {
    this.log('WARN', message, data);
  },

  error(message: string, data?: unknown): void {
    this.log('ERROR', message, data);
  },

  debug(message: string, data?: unknown): void {
    if (process.env.NODE_ENV !== 'production') {
      this.log('DEBUG', message, data);
    }
  },

  // Domain-specific loggers
  tx(message: string, data?: unknown): void {
    this.log('TX', `💸 ${message}`, data);
  },

  settle(message: string, data?: unknown): void {
    this.log('SETTLE', `📦 ${message}`, data);
  },

  chain(message: string, data?: unknown): void {
    this.log('CHAIN', `⛓  ${message}`, data);
  },

  separator(): void {
    console.log('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
  },

  banner(text: string): void {
    const line = '═'.repeat(60);
    console.log(`\x1b[36m${line}\x1b[0m`);
    console.log(`\x1b[36m${BOLD}  ${text}\x1b[0m`);
    console.log(`\x1b[36m${line}\x1b[0m`);
  },
};

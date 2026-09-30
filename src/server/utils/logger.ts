import pino from 'pino';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Ensure logs directory exists
const logsDir = join(process.cwd(), 'logs');
try {
  mkdirSync(logsDir, { recursive: true });
} catch (err) {
  // Directory already exists or permission issue
}

// Determine environment
const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Create base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: logLevel,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pid: process.pid,
    hostname: undefined, // Remove hostname for cleaner logs
  },
};

// Create multiple transports for different log files
const transport = pino.transport({
  targets: [
    // Console output with pretty printing in development
    {
      target: 'pino-pretty',
      level: logLevel,
      options: {
        colorize: isDevelopment,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
        destination: 1, // stdout
      },
    },
    // All logs to combined.log
    {
      target: 'pino-roll',
      level: 'debug',
      options: {
        file: join(logsDir, 'combined.log'),
        frequency: 'daily',
        mkdir: true,
      },
    },
    // Error logs to error.log
    {
      target: 'pino-roll',
      level: 'error',
      options: {
        file: join(logsDir, 'error.log'),
        frequency: 'daily',
        mkdir: true,
      },
    },
    // HTTP request logs to http.log
    {
      target: 'pino-roll',
      level: 'info',
      options: {
        file: join(logsDir, 'http.log'),
        frequency: 'daily',
        mkdir: true,
      },
    },
  ],
});

// Create main logger
export const logger = pino(baseConfig, transport);

// Create child loggers for different components
export const createChildLogger = (component: string) => {
  return logger.child({ component });
};

// Specific loggers for different parts of the application
export const serverLogger = createChildLogger('server');
export const httpLogger = createChildLogger('http-x402');
export const discoveryLogger = createChildLogger('discovery');
export const toolLogger = createChildLogger('tool');
export const paymentLogger = createChildLogger('payment');
export const compilerLogger = createChildLogger('compiler');

// Helper function to log errors with full context
export const logError = (logger: pino.Logger, error: Error | unknown, context?: Record<string, any>) => {
  if (error instanceof Error) {
    logger.error({
      err: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...context,
    }, error.message);
  } else {
    logger.error({ error, ...context }, 'An unknown error occurred');
  }
};

// Helper function to log HTTP requests
export interface HttpLogData {
  method: string;
  url: string;
  statusCode?: number;
  responseTime?: number;
  userAgent?: string | undefined;
  ip?: string;
  error?: Error;
}

export const logHttpRequest = (data: HttpLogData) => {
  const { method, url, statusCode, responseTime, userAgent, ip, error } = data;

  if (error || (statusCode && statusCode >= 400)) {
    httpLogger.error({
      method,
      url,
      statusCode,
      responseTime,
      userAgent,
      ip,
      err: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : undefined,
    }, `${method} ${url} ${statusCode || 'ERROR'}`);
  } else {
    httpLogger.info({
      method,
      url,
      statusCode,
      responseTime,
      userAgent,
      ip,
    }, `${method} ${url} ${statusCode || 200}`);
  }
};

// Export default logger
export default logger;

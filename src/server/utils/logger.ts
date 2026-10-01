import pino from 'pino';
import pretty from 'pino-pretty';
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

// Create multiple streams for different outputs
// CRITICAL: Console stream must be SYNCHRONOUS to show logs immediately
// File streams can be async workers for performance
const streams: pino.StreamEntry[] = [
  // Console output with pretty printing (SYNCHRONOUS - no worker threads)
  {
    level: logLevel as pino.Level,
    stream: pretty({
      colorize: isDevelopment,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      singleLine: false,
      sync: true, // Force synchronous output
    }),
  },
  // File transports for audit trails (async workers are OK for files)
  // combined.log: Complete audit trail of all operations (payments, requests, errors, etc.)
  {
    level: 'debug' as pino.Level,
    stream: pino.transport({
      target: 'pino-roll',
      options: {
        file: join(logsDir, 'combined.log'),
        frequency: 'daily',
        mkdir: true,
      },
    }),
  },
  // error.log: Errors only for quick troubleshooting
  {
    level: 'error' as pino.Level,
    stream: pino.transport({
      target: 'pino-roll',
      options: {
        file: join(logsDir, 'error.log'),
        frequency: 'daily',
        mkdir: true,
      },
    }),
  },
];

// Create main logger with multistream
export const logger = pino(baseConfig, pino.multistream(streams));

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

// Helper to log request received
export const logRequestReceived = (method: string, path: string, hasPayment: boolean) => {
  httpLogger.info({
    method,
    path,
    hasPayment,
    stage: 'request_received'
  }, `Request received: ${method} ${path}`);
};

// Helper to log payment verification result
export const logPaymentVerification = (success: boolean, reason?: string) => {
  if (success) {
    paymentLogger.info({ stage: 'payment_verified' }, 'Payment verification successful');
  } else {
    paymentLogger.error({
      stage: 'payment_failed',
      reason: reason || 'Unknown reason'
    }, 'Payment verification failed');
  }
};

// Helper to log response completion
export const logResponseSent = (method: string, path: string, statusCode: number, durationMs: number, success: boolean) => {
  const logData = {
    method,
    path,
    statusCode,
    durationMs,
    success,
    stage: 'response_sent'
  };

  if (statusCode >= 400) {
    httpLogger.error(logData, `Response sent: ${method} ${path} - ${statusCode} (${durationMs}ms)`);
  } else {
    httpLogger.info(logData, `Response sent: ${method} ${path} - ${statusCode} (${durationMs}ms)`);
  }
};

// Export default logger
export default logger;

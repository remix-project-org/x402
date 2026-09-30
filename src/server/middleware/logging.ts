import type { Context, Next } from 'koa';
import { logHttpRequest } from '../utils/logger.js';

/**
 * Koa middleware for logging HTTP requests and responses
 */
export const loggingMiddleware = async (ctx: Context, next: Next) => {
  const startTime = Date.now();
  const { method, url, ip, headers } = ctx.request;

  try {
    await next();

    const responseTime = Date.now() - startTime;
    const statusCode = ctx.status;

    logHttpRequest({
      method,
      url,
      statusCode,
      responseTime,
      userAgent: headers['user-agent'],
      ip: ip || ctx.ip,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logHttpRequest({
      method,
      url,
      statusCode: ctx.status || 500,
      responseTime,
      userAgent: headers['user-agent'],
      ip: ip || ctx.ip,
      error: error instanceof Error ? error : new Error(String(error)),
    });

    // Re-throw the error so Koa can handle it
    throw error;
  }
};

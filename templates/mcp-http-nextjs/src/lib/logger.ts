/**
 * Structured logger for production use
 * 
 * In production, replace with a proper logging service
 * (e.g., Pino, Winston, or Datadog)
 * 
 * Design:
 * - Log detailed errors internally for debugging
 * - Return generic messages to clients (security)
 * - Include request IDs for correlation
 */

export interface LogContext {
  requestId?: string;
  [key: string]: unknown;
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

function createLogger() {
  return {
    error: (message: string, error: unknown, context?: LogContext) => {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : { error: String(error) };

      // In production, send to logging service
      // For now, log to stderr
      console.error(JSON.stringify({
        level: "error",
        message,
        ...errorDetails,
        ...context,
        timestamp: new Date().toISOString(),
      }));
    },

    warn: (message: string, context?: LogContext) => {
      console.warn(JSON.stringify({
        level: "warn",
        message,
        ...context,
        timestamp: new Date().toISOString(),
      }));
    },

    info: (message: string, context?: LogContext) => {
      console.log(JSON.stringify({
        level: "info",
        message,
        ...context,
        timestamp: new Date().toISOString(),
      }));
    },
  };
}

export const logger = createLogger();

/**
 * Sanitize error for client response
 * Returns a generic message to prevent information disclosure
 */
export function sanitizeError(error: unknown): string {
  // Log the actual error for debugging
  logger.error("Request failed", error);
  
  // Return generic message to client
  return "An error occurred. Please try again later.";
}

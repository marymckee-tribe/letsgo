import 'server-only'
import pino, { type Logger, type DestinationStream } from 'pino'

const LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

export function createLogger(destination?: DestinationStream): Logger {
  const transport =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, singleLine: false } }

  const opts = {
    level: LEVEL,
    base: { service: 'the-hub' },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport,
  }

  return destination ? pino(opts, destination) : pino(opts)
}

export function withRequestId(base: Logger, reqId: string): Logger {
  return base.child({ reqId })
}

export const logger = createLogger()

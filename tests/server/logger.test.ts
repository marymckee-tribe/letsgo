import { Writable } from 'stream'
import { createLogger, withRequestId } from '@/lib/server/logger'

describe('logger', () => {
  it('createLogger returns an object with info/warn/error/debug', () => {
    const log = createLogger()
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.error).toBe('function')
    expect(typeof log.debug).toBe('function')
  })

  it('withRequestId produces a child logger that includes reqId in emitted records', () => {
    const records: string[] = []
    const dest = new Writable({
      write(chunk, _enc, cb) {
        records.push(chunk.toString())
        cb()
      },
    })
    const log = createLogger(dest)
    const child = withRequestId(log, 'abc-123')
    child.info({ uid: 'mary-uid' }, 'hello')
    const last = records.at(-1) as string
    expect(last).toContain('"reqId":"abc-123"')
    expect(last).toContain('"uid":"mary-uid"')
    expect(last).toContain('"msg":"hello"')
  })
})

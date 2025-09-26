import { spawn } from 'node:child_process'

// Simple in-process mutex to serialize duckdb CLI access per database file to reduce lock conflicts
class AsyncMutex {
  private queue: Array<() => void> = []
  private locked = false

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return Promise.resolve()
    }
    return new Promise((resolve) => this.queue.push(resolve))
  }

  private release() {
    const next = this.queue.shift()
    if (next) next()
    else this.locked = false
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __duckdbMutexes: Map<string, AsyncMutex> | undefined
}

const mutexes: Map<string, AsyncMutex> =
  globalThis.__duckdbMutexes ?? new Map<string, AsyncMutex>()
if (!globalThis.__duckdbMutexes) {
  globalThis.__duckdbMutexes = mutexes
}

function getMutexFor(dbPath: string): AsyncMutex {
  const key = dbPath || ':memory:'
  let m = mutexes.get(key)
  if (!m) {
    m = new AsyncMutex()
    mutexes.set(key, m)
  }
  return m
}

export async function runDuckDbCli(options: {
  dbPath: string
  args: string[]
  cwd?: string
  json?: boolean
  retries?: number
  retryDelayMs?: number
}): Promise<{ code: number; stdout: string; stderr: string }> {
  const { dbPath, args, cwd, json = false, retries = 3, retryDelayMs = 150 } = options
  const mutex = getMutexFor(dbPath)

  return mutex.runExclusive(async () => {
    let attempt = 0
    while (true) {
      const cliArgs = [dbPath || ':memory:']
      if (json && !args.some((arg) => arg === '--json' || arg === '-json')) {
        cliArgs.push('--json')
      }
      cliArgs.push(...args)

      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        let out = ''
        let err = ''
        const proc = spawn('duckdb', cliArgs, {
          cwd,
          stdio: 'pipe',
        })
        proc.stdout?.on('data', (d) => {
          out += d.toString()
        })
        proc.stderr?.on('data', (d) => {
          err += d.toString()
        })
        proc.on('close', (code) => resolve({ code: code ?? 0, stdout: out, stderr: err }))
        proc.on('error', (e) => resolve({ code: 1, stdout: '', stderr: String(e) }))
      })

      // If successful or the error is not a lock error, return immediately
      const isLockError = /Could not set lock on file|Conflicting lock is held/i.test(result.stderr)
      if (result.code === 0 || !isLockError || attempt >= retries) {
        return result
      }

      // Brief backoff then retry
      attempt += 1
      await new Promise((r) => setTimeout(r, retryDelayMs * attempt))
    }
  })
}



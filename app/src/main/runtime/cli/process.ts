import { spawn } from 'node:child_process'

export type RunCaptureResult = {
  code: number | null
  stdout: string
  stderr: string
}

export function runCapture(
  command: string,
  args: string[],
  options: {
    cwd?: string
    env: NodeJS.ProcessEnv
    shell: boolean
    stdin?: string
    timeoutMs: number
  }
): Promise<RunCaptureResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell,
      stdio: [options.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      resolve({ code: null, stdout, stderr: stderr || 'Command timed out.' })
    }, options.timeoutMs)

    if (!child.stdout || !child.stderr) {
      clearTimeout(timeout)
      reject(new Error('Command output streams could not be opened.'))
      return
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    if (options.stdin) {
      if (!child.stdin) {
        clearTimeout(timeout)
        reject(new Error('Command input stream could not be opened.'))
        return
      }
      child.stdin.write(options.stdin)
      child.stdin.end()
    }
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      resolve({ code, stdout, stderr })
    })
  })
}

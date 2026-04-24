import { spawn } from 'node:child_process';
export async function runChildProcess(opts) {
    return new Promise((resolve) => {
        const child = spawn(opts.command, opts.args, {
            cwd: opts.cwd,
            env: opts.env,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let timer = null;
        child.on('error', (err) => {
            resolve({
                stdout,
                stderr: stderr + `\nSpawn error: ${err.message}`,
                exitCode: 127,
                signal: null,
                timedOut: false,
            });
        });
        if (child.pid)
            opts.onSpawn(child.pid);
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdout += text;
            opts.onLog('stdout', text).catch(() => { });
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            opts.onLog('stderr', text).catch(() => { });
        });
        if (opts.stdin) {
            child.stdin.write(opts.stdin);
            child.stdin.end();
        }
        if (opts.timeoutSec > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
                setTimeout(() => child.kill('SIGKILL'), 20_000);
            }, opts.timeoutSec * 1000);
        }
        if (opts.signal) {
            opts.signal.addEventListener('abort', () => {
                child.kill('SIGTERM');
            });
        }
        child.on('close', (code, signal) => {
            if (timer)
                clearTimeout(timer);
            resolve({ stdout, stderr, exitCode: code, signal: signal ?? null, timedOut });
        });
    });
}
//# sourceMappingURL=child-process.js.map
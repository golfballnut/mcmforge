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
        // M0.1: line-buffer stdout/stderr so onLog fires once per complete line.
        // Claude/Codex emit JSONL via --output-format stream-json; downstream
        // run_events handler expects one DB row per JSON event, not per arbitrary
        // chunk boundary that may split a line across two events.
        let stdoutBuf = '';
        let stderrBuf = '';
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
            stdoutBuf += text;
            let nl;
            while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
                const line = stdoutBuf.slice(0, nl);
                stdoutBuf = stdoutBuf.slice(nl + 1);
                if (line.length > 0)
                    opts.onLog('stdout', line).catch(() => { });
            }
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            stderrBuf += text;
            let nl;
            while ((nl = stderrBuf.indexOf('\n')) !== -1) {
                const line = stderrBuf.slice(0, nl);
                stderrBuf = stderrBuf.slice(nl + 1);
                if (line.length > 0)
                    opts.onLog('stderr', line).catch(() => { });
            }
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
            // Flush any remaining buffered partial lines (no trailing newline).
            if (stdoutBuf.length > 0)
                opts.onLog('stdout', stdoutBuf).catch(() => { });
            if (stderrBuf.length > 0)
                opts.onLog('stderr', stderrBuf).catch(() => { });
            resolve({ stdout, stderr, exitCode: code, signal: signal ?? null, timedOut });
        });
    });
}
//# sourceMappingURL=child-process.js.map
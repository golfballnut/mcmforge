export interface RunOptions {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    stdin?: string;
    timeoutSec: number;
    signal?: AbortSignal;
    onLog: (stream: 'stdout' | 'stderr', chunk: string) => Promise<void>;
    onSpawn: (pid: number) => void;
}
export interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
}
export declare function runChildProcess(opts: RunOptions): Promise<RunResult>;
//# sourceMappingURL=child-process.d.ts.map
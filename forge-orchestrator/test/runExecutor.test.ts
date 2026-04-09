import { describe, it, expect } from 'vitest';
import { classifyOutcome } from '../src/services/artifactCollector.js';
import type { RunArtifacts } from '../src/services/artifactCollector.js';

/**
 * Unit tests for outcome_class classification.
 *
 * These tests verify that classifyOutcome() correctly identifies:
 *   - silent_failure: exit 0, no PR, no substantive comments
 *   - idle_loop_exit: last 2+ comments matched idle patterns
 *   - shipped: has PR URL (or substantive comments)
 *   - timeout: timed_out flag set
 *   - build_fail / tests_fail: pattern detected in output
 */

const NO_ARTIFACTS: RunArtifacts = {
  pr: null,
  substantiveComments: [],
  lastComments: [],
  outputText: '',
};

describe('classifyOutcome — silent_failure', () => {
  it('marks exit-0 run with no artifacts as silent_failure', () => {
    const result = classifyOutcome(false, 0, NO_ARTIFACTS);
    expect(result.outcomeClass).toBe('silent_failure');
  });

  it('marks exit-0 run with only short comments as silent_failure', () => {
    const artifacts: RunArtifacts = {
      ...NO_ARTIFACTS,
      lastComments: ['OK', 'Done'],
      substantiveComments: [],
      outputText: 'OK\nDone',
    };
    const result = classifyOutcome(false, 0, artifacts);
    expect(result.outcomeClass).toBe('silent_failure');
  });
});

describe('classifyOutcome — idle_loop_exit', () => {
  it('marks run with 2 consecutive idle comments as idle_loop_exit', () => {
    const artifacts: RunArtifacts = {
      ...NO_ARTIFACTS,
      lastComments: [
        'nothing to do right now',
        'awaiting review from the team before proceeding further',
      ],
      outputText: 'nothing to do\nawaiting review',
    };
    const result = classifyOutcome(false, 0, artifacts);
    expect(result.outcomeClass).toBe('idle_loop_exit');
  });

  it('marks run with 3 idle comments (last 2 checked) as idle_loop_exit', () => {
    const artifacts: RunArtifacts = {
      ...NO_ARTIFACTS,
      lastComments: [
        'Ran health checks successfully across all 8 checkpoints, all passed.',
        'nothing to do right now, no work assigned',
        'no pending work in the queue at this time',
      ],
      substantiveComments: [],
      outputText: '',
    };
    const result = classifyOutcome(false, 0, artifacts);
    expect(result.outcomeClass).toBe('idle_loop_exit');
  });

  it('does NOT mark idle_loop_exit if only 1 idle comment', () => {
    const artifacts: RunArtifacts = {
      ...NO_ARTIFACTS,
      lastComments: ['nothing to do right now'],
      outputText: 'nothing to do',
    };
    // Falls through to silent_failure since 1 comment and no artifacts
    const result = classifyOutcome(false, 0, artifacts);
    expect(result.outcomeClass).not.toBe('idle_loop_exit');
  });

  it('does NOT mark idle_loop_exit if last comment is substantive', () => {
    const artifacts: RunArtifacts = {
      ...NO_ARTIFACTS,
      lastComments: [
        'nothing to do right now',
        'Pushed commit abc1234. PR #42 opened against feature/d-and-c-fixes with full build passing.',
      ],
      pr: 'https://github.com/golfballnut/mcmforge/pull/42',
      substantiveComments: [
        'Pushed commit abc1234. PR #42 opened against feature/d-and-c-fixes with full build passing.',
      ],
      outputText: 'https://github.com/golfballnut/mcmforge/pull/42',
    };
    const result = classifyOutcome(false, 0, artifacts);
    expect(result.outcomeClass).toBe('shipped');
  });
});

describe('classifyOutcome — shipped', () => {
  it('marks run with PR URL as shipped', () => {
    const artifacts: RunArtifacts = {
      pr: 'https://github.com/golfballnut/mcmforge/pull/42',
      substantiveComments: ['Opened PR #42 with dedup guard and 5 passing tests.'],
      lastComments: ['Opened PR #42 with dedup guard and 5 passing tests.'],
      outputText: 'https://github.com/golfballnut/mcmforge/pull/42',
    };
    const result = classifyOutcome(false, 0, artifacts);
    expect(result.outcomeClass).toBe('shipped');
  });

  it('marks run with substantive comments but no PR as shipped', () => {
    const artifacts: RunArtifacts = {
      pr: null,
      substantiveComments: [
        'Fleet health check complete: 8/8 checks passed. All agents idle. No failures detected this cycle.',
      ],
      lastComments: [
        'Fleet health check complete: 8/8 checks passed. All agents idle. No failures detected this cycle.',
      ],
      outputText: 'Fleet health check complete',
    };
    const result = classifyOutcome(false, 0, artifacts);
    expect(result.outcomeClass).toBe('shipped');
  });
});

describe('classifyOutcome — timeout', () => {
  it('marks timed-out runs as timeout regardless of other signals', () => {
    const result = classifyOutcome(true, null, NO_ARTIFACTS);
    expect(result.outcomeClass).toBe('timeout');
  });

  it('timeout takes priority over idle_loop_exit', () => {
    const artifacts: RunArtifacts = {
      ...NO_ARTIFACTS,
      lastComments: ['nothing to do', 'awaiting review from team'],
    };
    const result = classifyOutcome(true, null, artifacts);
    expect(result.outcomeClass).toBe('timeout');
  });
});

describe('classifyOutcome — build_fail / tests_fail', () => {
  it('detects build failure in output', () => {
    const artifacts: RunArtifacts = {
      ...NO_ARTIFACTS,
      outputText: 'xcodebuild error: Compilation failed for target DirtSyncApp',
    };
    const result = classifyOutcome(false, 1, artifacts);
    expect(result.outcomeClass).toBe('build_fail');
  });

  it('detects test failure in output', () => {
    const artifacts: RunArtifacts = {
      ...NO_ARTIFACTS,
      outputText: '** TEST FAILED ** (3 tests failed)',
    };
    const result = classifyOutcome(false, 1, artifacts);
    expect(result.outcomeClass).toBe('tests_fail');
  });

  it('falls back to error for non-zero exit with no pattern match', () => {
    const artifacts: RunArtifacts = {
      ...NO_ARTIFACTS,
      outputText: 'Something went wrong with the network connection',
    };
    const result = classifyOutcome(false, 1, artifacts);
    expect(result.outcomeClass).toBe('error');
  });
});

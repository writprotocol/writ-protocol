// The engine factory: binds a configuration to the engine surface.

import { check } from "./check.js";
import { finalize, loadWrit, record, startRun } from "./run.js";
import { publish } from "./publish.js";
import type { Engine, EngineConfig } from "./types.js";

/** Version of this reference engine implementation. */
export const ENGINE_VERSION = "0.1.0";

/** Create an engine bound to the given configuration. */
export function createEngine(config: EngineConfig): Engine {
  return {
    loadWrit: (path) => loadWrit(path),
    startRun: (writ, opts) => startRun(config, writ, opts),
    check: (run, action, target, details) => check(run, action, target, details),
    record: (run, input) => record(run, input),
    finalize: (run, outcome) => finalize(config, run, outcome),
    publish: (artifact) => {
      if (!config.registry) {
        throw new Error("publish: no registry is configured");
      }
      return publish(config.registry, artifact);
    },
  };
}

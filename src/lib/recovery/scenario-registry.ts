/**
 * Versioned scenario configurations known to the app, keyed by id + version
 * (demo_state.scenario_id / scenario_version). Add new versions here; never
 * edit a published version in place.
 */

import terminalAOutageV1 from "../../../data/scenario/terminal-a-outage.v1.json";
import { assertScenarioConfig, type ScenarioConfig } from "./scenario-config";

const configs: unknown[] = [terminalAOutageV1];

const registry = new Map<string, ScenarioConfig>(
  configs.map((c) => {
    assertScenarioConfig(c);
    return [`${c.id}@${c.version}`, c];
  }),
);

export function getScenarioConfig(id: string, version: number): ScenarioConfig | null {
  return registry.get(`${id}@${version}`) ?? null;
}

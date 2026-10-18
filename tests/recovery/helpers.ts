import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertScenarioConfig, type ScenarioConfig } from "../../src/lib/recovery/scenario-config.ts";
import { buildScenarioDataset, type ScenarioDataset } from "../../src/lib/recovery/scenario-dataset.ts";

const root = new URL("../../", import.meta.url);

export function readRepoFile(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function loadScenarioConfig(): ScenarioConfig {
  const config: unknown = JSON.parse(readRepoFile("data/scenario/terminal-a-outage.v1.json"));
  assertScenarioConfig(config);
  return config;
}

export function loadSourceCsvs() {
  return {
    customers: readRepoFile("data/source/gaterescue_customers.csv"),
    drivers: readRepoFile("data/source/gaterescue_drivers.csv"),
    jobs: readRepoFile("data/source/gaterescue_jobs.csv"),
  };
}

export function loadDataset(): { dataset: ScenarioDataset; config: ScenarioConfig } {
  const config = loadScenarioConfig();
  return { dataset: buildScenarioDataset(loadSourceCsvs(), config), config };
}

export interface FixtureCallState {
  status: string;
  blocker: string | null;
  proposedDriverId: string | null;
  nextAction: string | null;
}

export interface RankingFixture {
  source: { file: string; sha256: string };
  rows: {
    rank: number;
    jobId: string;
    criticalityTier: number;
    harmDeadline: string;
    beforeCall: FixtureCallState;
    afterCall: FixtureCallState;
    owner: string;
  }[];
}

export function loadRankingFixture(): RankingFixture {
  return JSON.parse(readRepoFile("tests/fixtures/expected-ranking.json")) as RankingFixture;
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  CONDITION_IDS,
  CONTRACT_IDS,
  EXPECTED_CONFIG_SHA256,
  ORDINARY_CONTROL_IDS,
  PREREGISTRATION_COMMIT,
  loadBenchmarkConfig,
  runContractBenchmark,
  stableBenchmarkJson,
  type BenchmarkConditionId,
  type ConditionResult,
  type ContractBenchmarkResult
} from "../src/benchmark.js";

const CONFIG_PATH = "artifacts/benchmarks/v0.8-contract/config.json";
const PUBLIC_SURFACE_GROUPS = [
  "public_snapshot",
  "audit",
  "observations",
  "relations",
  "assemblies",
  "insights",
  "derived_views",
  "tokens",
  "retrieval",
  "traces"
] as const;
const C10_SENTINELS = [
  "payloadsecret9x",
  "speakersecret8v",
  "observersecret7k",
  "sourcesecret6m",
  "relationsecret5q",
  "cuesecret4r",
  "insightsecret3t",
  "uncertaintysecret2w",
  "falsifiersecret1z"
] as const;

function benchmark(): ContractBenchmarkResult {
  return runContractBenchmark(loadBenchmarkConfig(CONFIG_PATH));
}

function condition(result: ContractBenchmarkResult, id: BenchmarkConditionId): ConditionResult {
  const found = result.conditions.find((item) => item.condition_id === id);
  assert.ok(found, id);
  return found;
}

function failedContracts(result: ConditionResult): string[] {
  return result.contracts.filter((contract) => !contract.passed).map((contract) => contract.contract_id);
}

describe("v0.8 pre-registered contract benchmark", () => {
  it("uses exactly the fixed conditions, contracts, controls, hash, and commit", () => {
    const result = benchmark();
    assert.equal(result.config_sha256, EXPECTED_CONFIG_SHA256);
    assert.equal(result.preregistration_commit, PREREGISTRATION_COMMIT);
    assert.deepEqual(result.conditions.map((item) => item.condition_id), [...CONDITION_IDS]);
    for (const item of result.conditions) {
      assert.deepEqual(item.contracts.map((contract) => contract.contract_id), [...CONTRACT_IDS]);
      assert.deepEqual(item.ordinary_controls.map((control) => control.control_id), [...ORDINARY_CONTROL_IDS]);
    }
  });

  it("complete condition passes all ten contracts and six controls without violation counters", () => {
    const complete = condition(benchmark(), "h2o_complete");
    assert.equal(complete.contract_pass_count, 10);
    assert.equal(complete.ordinary_control_pass_count, 6);
    assert.equal(complete.ordinary_control_total, 6);
    assert.equal(complete.stale_authority_count, 0);
    assert.equal(complete.cross_axis_mutation_count, 0);
    assert.equal(complete.public_disclosure_count, 0);
    assert.equal(complete.trace_mismatch_count, 0);
    assert.equal(complete.admissible, true);
  });

  it("records the fixed counterfactual outcomes without repairing an invalid condition after the fact", () => {
    const result = benchmark();
    const derivedAuthority = condition(result, "derived_authority");
    const coupledAxes = condition(result, "coupled_axes");
    const delayedGovernance = condition(result, "delayed_governance");

    assert.deepEqual(failedContracts(derivedAuthority), ["C01", "C02"]);
    assert.deepEqual(failedContracts(coupledAxes), ["C06", "C07", "C10"]);
    assert.deepEqual(failedContracts(delayedGovernance), ["C02", "C09", "C10"]);
    assert.equal(derivedAuthority.admissible, true);
    assert.equal(delayedGovernance.admissible, true);
    assert.equal(coupledAxes.admissible, false);
    assert.equal(coupledAxes.ordinary_control_pass_count, 5);
    assert.equal(coupledAxes.ordinary_control_total, 6);
    assert.equal(coupledAxes.ordinary_controls.find((control) => control.control_id === "O03")?.passed, false);
    for (const item of [derivedAuthority, coupledAxes, delayedGovernance]) {
      assert.equal(item.ordinary_control_total, 6);
      const evaluableFailures = item.contracts.filter((entry) => !entry.passed && entry.evaluation_preconditions_met);
      for (const contract of evaluableFailures) {
        assert.equal(contract.evaluation_preconditions_met, true);
        assert.ok(contract.mechanism_events.length > 0, `${item.condition_id}/${contract.contract_id}`);
        assert.ok(
          contract.mechanism_events.every((event) => contract.causal_step_ids.includes(event.step_id)),
          `${item.condition_id}/${contract.contract_id} included a non-causal mechanism event`
        );
        assert.ok(
          contract.mechanism_events.every((event) =>
            event.entity_ids.some((entityId) => contract.causal_entity_ids.includes(entityId))
          ),
          `${item.condition_id}/${contract.contract_id} included an event for an unrelated entity`
        );
        const mechanisms = [...new Set(contract.mechanism_events.map((event) => event.mechanism))];
        assert.deepEqual(mechanisms, [item.removed_mechanism]);
        assert.equal(contract.mechanism_trace, item.removed_mechanism);
      }
    }
    assert.equal(derivedAuthority.trace_mismatch_count, 0);
    assert.equal(delayedGovernance.trace_mismatch_count, 0);
    assert.equal(coupledAxes.trace_mismatch_count, 1);
    const coupledC10 = coupledAxes.contracts.find((contract) => contract.contract_id === "C10");
    assert.ok(coupledC10);
    assert.equal(coupledC10.evaluation_preconditions_met, false);
    assert.equal(coupledC10.preforget_public_disclosures.length, 0);
  });

  it("replays byte-identical operation tapes and argument hashes across all conditions", () => {
    const result = benchmark();
    const complete = condition(result, "h2o_complete");
    for (const other of result.conditions.slice(1)) {
      for (const completeContract of complete.contracts) {
        const compared = other.contracts.find((contract) => contract.contract_id === completeContract.contract_id);
        assert.ok(compared, completeContract.contract_id);
        assert.equal(compared.operation_tape_hash, completeContract.operation_tape_hash);
        assert.deepEqual(compared.operation_sequence, completeContract.operation_sequence);
      }
      for (const completeControl of complete.ordinary_controls) {
        const compared = other.ordinary_controls.find((control) => control.control_id === completeControl.control_id);
        assert.ok(compared, completeControl.control_id);
        assert.equal(compared.operation_tape_hash, completeControl.operation_tape_hash);
      }
    }
  });

  it("enumerates all ten public surface groups for forgotten-text checks", () => {
    for (const item of benchmark().conditions) {
      const c10 = item.contracts.find((contract) => contract.contract_id === "C10");
      assert.ok(c10, item.condition_id);
      assert.deepEqual(c10.public_surface_groups_evaluated, [...PUBLIC_SURFACE_GROUPS]);
      assert.deepEqual(c10.sentinels_evaluated, [...C10_SENTINELS]);
      if (item.condition_id === "coupled_axes") {
        assert.equal(c10.evaluation_preconditions_met, false);
        assert.equal(c10.preforget_public_disclosures.length, 0);
      } else {
        assert.equal(c10.evaluation_preconditions_met, true);
        assert.deepEqual(
          [...new Set(c10.preforget_public_disclosures.map((entry) => entry.sentinel))].sort(),
          [...C10_SENTINELS].sort()
        );
      }
    }
  });

  it("keeps delayed-governance leakage out of live canonical public surfaces", () => {
    const delayed = condition(benchmark(), "delayed_governance");
    const c10 = delayed.contracts.find((contract) => contract.contract_id === "C10");
    assert.ok(c10);
    assert.equal(c10.public_disclosures.length, c10.public_disclosure_count);
    assert.ok(c10.public_disclosures.length > 0);
    const liveCanonicalGroups = new Set(["public_snapshot", "audit", "observations", "relations"]);
    assert.ok(c10.public_disclosures.every((entry) => !liveCanonicalGroups.has(entry.surface_group)));
  });

  it("freezes the loaded config and refuses any byte-changed config", () => {
    const config = loadBenchmarkConfig(CONFIG_PATH);
    assert.equal(Object.isFrozen(config), true);
    assert.equal(Object.isFrozen(config.conditions), true);
    assert.throws(() => {
      (config as { random_seed: number }).random_seed = 1;
    }, TypeError);

    const temp = mkdtempSync(join(tmpdir(), "h2o-v08-config-"));
    const altered = join(temp, "config.json");
    try {
      writeFileSync(altered, `${readFileSync(CONFIG_PATH, "utf8")} `, "utf8");
      assert.throws(() => loadBenchmarkConfig(altered), /refusing changed v0\.8 config/);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("is byte-deterministic and writes a matching SHA-256 manifest", () => {
    const first = stableBenchmarkJson(benchmark());
    const second = stableBenchmarkJson(benchmark());
    assert.equal(first, second);
    assert.equal(JSON.parse(first).overall_result, "FAIL");

    const temp = mkdtempSync(join(tmpdir(), "h2o-v08-result-"));
    const resultPath = join(temp, "result.json");
    try {
      const execution = spawnSync(
        process.execPath,
        [resolve("dist/src/run-v08-contract-benchmark.js"), "--output", resultPath],
        { encoding: "utf8" }
      );
      assert.equal(execution.status, 1);
      assert.equal(execution.signal, null);
      const bytes = readFileSync(resultPath);
      const digest = createHash("sha256").update(bytes).digest("hex");
      assert.equal(bytes.toString("utf8"), first);
      assert.equal(readFileSync(join(temp, "SHA256SUMS"), "utf8"), `${digest}  ${basename(resultPath)}\n`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { InvariantId } from "./invariants.js";
import type {
  AssemblyRecord,
  CanonicalPayload,
  CrystallizeInput,
  EngineState,
  EvidencePlan,
  InsightRecord,
  ObservationRecord,
  ObserveInput
} from "./types.js";
import {
  CompleteAdapter,
  CoupledAxesAdapter,
  DelayedGovernanceAdapter,
  DerivedAuthorityAdapter,
  sha256,
  stableJson,
  type BenchmarkAdapter,
  type BenchmarkCommand,
  type CommandExecution,
  type MechanismEvent,
  type PublicSurfaceBundle,
  type PublicSurfaceRequest
} from "./benchmark-adapters.js";

export const CONDITION_IDS = ["h2o_complete", "derived_authority", "coupled_axes", "delayed_governance"] as const;
export const CONTRACT_IDS = ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10"] as const;
export const ORDINARY_CONTROL_IDS = ["O01", "O02", "O03", "O04", "O05", "O06"] as const;
export const PREREGISTRATION_COMMIT = "dcac71fc6e0cf12aba8b0f524a238075592802ad";
export const EXPECTED_CONFIG_SHA256 = "102889a3045019919ad0f6b854164da5b42d956f6ddb942facdfc6c8fa947f8e";

export type BenchmarkConditionId = (typeof CONDITION_IDS)[number];
export type ContractId = (typeof CONTRACT_IDS)[number];
export type OrdinaryControlId = (typeof ORDINARY_CONTROL_IDS)[number];

interface ConfigCondition {
  id: BenchmarkConditionId;
  removed_mechanism: string | null;
}

interface ConfigContract {
  id: ContractId;
  target_conditions: BenchmarkConditionId[];
}

export interface BenchmarkConfig {
  benchmark_id: string;
  version: string;
  runtime: string;
  network_allowed: boolean;
  paid_api_allowed: boolean;
  random_seed: number;
  conditions: ConfigCondition[];
  contracts: ConfigContract[];
  complete_acceptance: {
    contract_pass_count: number;
    ordinary_controls_all_pass: boolean;
    stale_authority_count: number;
    cross_axis_mutation_count: number;
    public_disclosure_count: number;
    trace_mismatch_count: number;
  };
  counterfactual_admissibility: {
    ordinary_controls_all_pass: boolean;
    non_target_contracts_all_pass: boolean;
    minimum_target_contract_failures: number;
    failures_must_trace_to_removed_mechanism: boolean;
  };
  claim_boundary: string;
  source_sha256: string;
}

export interface OperationSequenceEntry {
  step_id: string;
  operation: string;
  arguments_hash: string;
}

export interface ContractResult {
  contract_id: ContractId;
  passed: boolean;
  invariant_ids: InvariantId[];
  diagnostic: string;
  operation_tape_hash: string;
  operation_sequence: OperationSequenceEntry[];
  stale_authority_count: number;
  cross_axis_mutation_count: number;
  public_disclosure_count: number;
  trace_mismatch_count: number;
  mechanism_trace: string | null;
  mechanism_events: MechanismEvent[];
  causal_step_ids: string[];
  causal_entity_ids: string[];
  evaluation_preconditions_met: boolean;
  public_surface_groups_evaluated: string[];
  sentinels_evaluated: string[];
  preforget_public_disclosures: Array<{ surface_group: string; sentinel: string }>;
  public_disclosures: Array<{ surface_group: string; sentinel: string }>;
}

export interface OrdinaryControlResult {
  control_id: OrdinaryControlId;
  passed: boolean;
  diagnostic: string;
  operation_tape_hash: string;
}

export interface ConditionResult {
  condition_id: BenchmarkConditionId;
  removed_mechanism: string | null;
  adapter_implementation: string;
  contract_pass_count: number;
  ordinary_control_pass_count: number;
  ordinary_control_total: number;
  stale_authority_count: number;
  cross_axis_mutation_count: number;
  public_disclosure_count: number;
  trace_mismatch_count: number;
  admissible: boolean;
  ordinary_controls: OrdinaryControlResult[];
  contracts: ContractResult[];
}

export interface ContractBenchmarkResult {
  schema_version: "2.1.0";
  benchmark_id: string;
  config_version: string;
  preregistration_commit: string;
  config_sha256: string;
  deterministic: true;
  overall_result: "PASS" | "FAIL";
  claim_boundary: string;
  conditions: ConditionResult[];
}

interface TapeRun {
  tape: BenchmarkCommand[];
  tapeHash: string;
  executions: CommandExecution[];
  byStep: Map<string, CommandExecution>;
}

interface Evaluation {
  passed: boolean;
  diagnostic: string;
  invariantIds: InvariantId[];
  publicDisclosureCount?: number;
  surfaceGroupsEvaluated?: string[];
  sentinelsEvaluated?: string[];
  preforgetPublicDisclosures?: Array<{ surface_group: string; sentinel: string }>;
  publicDisclosures?: Array<{ surface_group: string; sentinel: string }>;
  causalStepIds?: string[];
  causalEntityIds?: string[];
  preconditionsMet?: boolean;
}

interface ContractDefinition {
  id: ContractId;
  tape: BenchmarkCommand[];
  evaluate: (run: TapeRun) => Evaluation;
}

interface ControlDefinition {
  id: OrdinaryControlId;
  tape: BenchmarkCommand[];
  evaluate: (run: TapeRun) => { passed: boolean; diagnostic: string };
}

function payload(data: CanonicalPayload["data"], kind: CanonicalPayload["kind"] = "structured"): CanonicalPayload {
  return { kind, data, representationLossDeclared: false };
}

function command(stepId: string, operation: BenchmarkCommand["operation"], argumentsValue: Record<string, unknown> = {}): BenchmarkCommand {
  return { step_id: stepId, operation, arguments: argumentsValue };
}

function observeInput(observationId: string, data: CanonicalPayload["data"], extra: Partial<ObserveInput> = {}): ObserveInput {
  return {
    observationId,
    kind: "observed_evidence",
    observer: "benchmark-observer",
    sourceRef: "synthetic-v0.8-contract-fixture",
    speaker: null,
    payload: payload(data),
    ...extra
  };
}

function crystallizeInput(
  insightId: string,
  assemblyId: string,
  evidenceIds: string[],
  statement: string,
  extra: Partial<CrystallizeInput> = {}
): CrystallizeInput {
  return {
    insightId,
    assemblyId,
    evidenceIds,
    statement,
    uncertainty: { declared: true, note: "synthetic candidate", recognizerConfidence: null },
    falsificationConditions: ["synthetic counterexample"],
    ...extra
  };
}

function surfaceRequest(): PublicSurfaceRequest {
  return {
    observation_id: "obs_secret",
    observation_version: 1,
    assembly_id: "asm_secret",
    insight_id: "ins_secret",
    retrieval_tokens: ["alpha-payload-secret"]
  };
}

function output<T>(run: TapeRun, stepId: string): T | null {
  const record = run.byStep.get(stepId);
  return record?.ok === true ? record.output as T : null;
}

function failed(run: TapeRun, stepId: string, invariantId?: string): boolean {
  const record = run.byStep.get(stepId);
  return record?.ok === false
    && record.failure !== null
    && (invariantId === undefined || record.failure.invariant_id === invariantId);
}

function retrievalCount(run: TapeRun, stepId: string): number {
  return output<unknown[]>(run, stepId)?.length ?? 0;
}

function evidenceUsable(run: TapeRun, stepId: string): boolean {
  return output<EvidencePlan>(run, stepId)?.usable === true;
}

function canonical(value: unknown): string {
  return stableJson(value);
}

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

function disclosureMatches(
  bundle: PublicSurfaceBundle | null,
  sentinels: readonly string[]
): Array<{ surface_group: string; sentinel: string }> {
  if (!bundle) return [];
  return Object.entries(bundle).flatMap(([surfaceGroup, surface]) => {
    const serialised = canonical(surface);
    return sentinels
      .filter((sentinel) => serialised.includes(sentinel))
      .map((sentinel) => ({ surface_group: surfaceGroup, sentinel }));
  });
}

const CONTRACT_DEFINITIONS: ContractDefinition[] = [
  {
    id: "C01",
    tape: [
      command("observe_address", "OBSERVE", { input: observeInput("obs_address", { address: "12 Old Street" }) }),
      command("move_address_cold", "MOVE_TIER", { input: { target: { kind: "observation", id: "obs_address" }, storageTier: "cold" } }),
      command("correct_address", "CORRECT", { input: { observationId: "obs_address", payload: payload({ address: "90 New Avenue" }), note: "synthetic correction" } }),
      command("restore_old_address", "RESTORE", { input: { observationId: "obs_address", version: 1, targetTier: "hot" } }),
      command("read_address_after_old_restore", "READ_OBSERVATION", { observation_id: "obs_address" }),
      command("restore_current_address", "RESTORE", { input: { observationId: "obs_address", version: 2, targetTier: "hot" } }),
      command("read_address_current", "READ_OBSERVATION", { observation_id: "obs_address" }),
      command("read_address_v1", "READ_OBSERVATION", { observation_id: "obs_address", version: 1 })
    ],
    evaluate: (run) => {
      const afterOldRestore = output<ObservationRecord>(run, "read_address_after_old_restore");
      const current = output<ObservationRecord>(run, "read_address_current");
      const previous = output<ObservationRecord>(run, "read_address_v1");
      const oldRestoreWasBlocked = failed(run, "restore_old_address", "restoration_and_re_presentation")
        && afterOldRestore?.version === 2 && afterOldRestore.current;
      const lineage = current?.version === 2 && current.current && current.payload.data.address === "90 New Avenue"
        && previous?.version === 1 && !previous.current && previous.invalidatedByCorrection;
      const passed = oldRestoreWasBlocked && lineage;
      return {
        passed,
        invariantIds: ["correction_lineage", "restoration_and_re_presentation"],
        diagnostic: passed ? "old corrected value remained non-current" : "an old representation became current or correction lineage was lost",
        causalStepIds: ["restore_old_address", "read_address_after_old_restore"],
        causalEntityIds: ["obs_address"]
      };
    }
  },
  {
    id: "C02",
    tape: [
      command("observe_private", "OBSERVE", { input: observeInput("obs_private", { topic: "alpha-topic" }) }),
      command("retrieve_private_before", "RETRIEVE", { input: { tokens: ["alpha"] } }),
      command("trace_private_before", "TRACE_INDEX", { observation_id: "obs_private" }),
      command("withdraw_private", "WITHDRAW_CONSENT", { input: { observationId: "obs_private", permittedUses: [] } }),
      command("retrieve_private_after", "RETRIEVE", { input: { tokens: ["alpha"] } }),
      command("trace_private_after", "TRACE_INDEX", { observation_id: "obs_private" })
    ],
    evaluate: (run) => {
      const passed = retrievalCount(run, "retrieve_private_before") === 1
        && evidenceUsable(run, "trace_private_before")
        && retrievalCount(run, "retrieve_private_after") === 0
        && !evidenceUsable(run, "trace_private_after");
      return {
        passed,
        invariantIds: ["deletion_and_consent", "representation_loss_declaration"],
        diagnostic: passed ? "consent withdrawal blocked the materialised index and its trace" : "a materialised index remained usable after consent withdrawal",
        causalStepIds: ["withdraw_private", "retrieve_private_after", "trace_private_after"],
        causalEntityIds: ["obs_private"]
      };
    }
  },
  {
    id: "C03",
    tape: [
      command("observe_delayed_old", "OBSERVE", {
        input: observeInput("obs_old", { fragment: "amber rare note", frequency: 1 }, { occurrenceTime: "2024-01-01T00:00:00.000Z", epistemicPhase: "dispersed" })
      }),
      command("observe_delayed_later", "OBSERVE", {
        input: observeInput("obs_later", { fragment: "amber matching cue", frequency: 1 }, { occurrenceTime: "2025-02-04T00:00:00.000Z", epistemicPhase: "dispersed" })
      }),
      command("assemble_delayed_by_cue", "ASSEMBLE_BY_CUE", { input: { assemblyId: "asm_delayed", cue: "amber after 400 days", tokens: ["amber"] } }),
      command("read_delayed_assembly", "READ_ASSEMBLY", { assembly_id: "asm_delayed" }),
      command("read_delayed_old", "READ_OBSERVATION", { observation_id: "obs_old" }),
      command("read_delayed_later", "READ_OBSERVATION", { observation_id: "obs_later" })
    ],
    evaluate: (run) => {
      const assembly = output<AssemblyRecord>(run, "read_delayed_assembly");
      const old = output<ObservationRecord>(run, "read_delayed_old");
      const later = output<ObservationRecord>(run, "read_delayed_later");
      const elapsedDays = old && later ? (Date.parse(later.occurrenceTime) - Date.parse(old.occurrenceTime)) / 86_400_000 : 0;
      const passed = canonical([...(assembly?.memberIds ?? [])].sort()) === canonical(["obs_later", "obs_old"])
        && assembly?.epistemicPhase === "assembling"
        && old?.epistemicPhase === "assembling"
        && later?.epistemicPhase === "assembling"
        && elapsedDays >= 400;
      return {
        passed,
        invariantIds: ["identity", "temporal_validity"],
        diagnostic: passed ? "a delayed cue discovered and assembled both dispersed fragments" : "the delayed cue did not discover, retain, and assemble both fragments"
      };
    }
  },
  {
    id: "C04",
    tape: [
      command("observe_voice_drop", "OBSERVE", {
        input: observeInput("obs_voice", { voiceLevelChange: "drop" }, { payload: payload({ voiceLevelChange: "drop" }, "prosody") })
      }),
      command("observe_voice_as_sad", "OBSERVE", {
        input: observeInput("obs_voice_as_sad", { voiceLevelChange: "drop", emotion: "sad" }, { payload: payload({ voiceLevelChange: "drop", emotion: "sad" }, "prosody") })
      })
    ],
    evaluate: (run) => {
      const passed = run.byStep.get("observe_voice_drop")?.ok === true && failed(run, "observe_voice_as_sad", "representation_loss_declaration");
      return {
        passed,
        invariantIds: ["provenance", "representation_loss_declaration"],
        diagnostic: passed ? "observed prosody remained distinct from an inferred emotion" : "prosody was accepted as an emotion fact"
      };
    }
  },
  {
    id: "C05",
    tape: [
      command("observe_claim", "OBSERVE", { input: observeInput("obs_claim", { value: "claimed-route" }) }),
      command("observe_counter", "OBSERVE", { input: observeInput("obs_counter", { value: "contradictory-route", frequency: 1, similarity: 0.01 }) }),
      command("relate_contradiction", "RELATE", { input: { type: "contradiction", fromRef: { kind: "observation", id: "obs_claim" }, toRef: { kind: "observation", id: "obs_counter" } } }),
      command("prune_counter_frequency", "CONSIDER_PRUNE", { observation_id: "obs_counter", reason: "low_frequency" }),
      command("prune_counter_similarity", "CONSIDER_PRUNE", { observation_id: "obs_counter", reason: "low_similarity" }),
      command("read_counter", "READ_OBSERVATION", { observation_id: "obs_counter" }),
      command("snapshot_counter", "SNAPSHOT")
    ],
    evaluate: (run) => {
      const counter = output<ObservationRecord>(run, "read_counter");
      const snapshot = output<EngineState>(run, "snapshot_counter");
      const passed = failed(run, "prune_counter_frequency", "simultaneity_and_ordering")
        && failed(run, "prune_counter_similarity", "simultaneity_and_ordering")
        && snapshot?.relations.some((relation) => relation.type === "contradiction") === true
        && counter?.payload.data.frequency === 1 && counter.payload.data.similarity === 0.01 && !counter.forgotten;
      return {
        passed,
        invariantIds: ["simultaneity_and_ordering", "deletion_and_consent"],
        diagnostic: passed ? "low-frequency and low-similarity contradiction remained available" : "a contradiction was pruned or lost"
      };
    }
  },
  {
    id: "C06",
    tape: [
      command("observe_tier_phase", "OBSERVE", { input: observeInput("obs_tier_phase", { note: "held" }) }),
      command("read_tier_phase_initial", "READ_OBSERVATION", { observation_id: "obs_tier_phase" }),
      command("move_tier_phase_warm", "MOVE_TIER", { input: { target: { kind: "observation", id: "obs_tier_phase" }, storageTier: "warm" } }),
      command("read_tier_phase_warm", "READ_OBSERVATION", { observation_id: "obs_tier_phase" }),
      command("move_tier_phase_cold", "MOVE_TIER", { input: { target: { kind: "observation", id: "obs_tier_phase" }, storageTier: "cold" } }),
      command("read_tier_phase_cold", "READ_OBSERVATION", { observation_id: "obs_tier_phase" }),
      command("move_tier_phase_hot", "MOVE_TIER", { input: { target: { kind: "observation", id: "obs_tier_phase" }, storageTier: "hot" } }),
      command("read_tier_phase_hot", "READ_OBSERVATION", { observation_id: "obs_tier_phase" })
    ],
    evaluate: (run) => {
      const records = ["initial", "warm", "cold", "hot"].map((suffix) => output<ObservationRecord>(run, `read_tier_phase_${suffix}`));
      const expected = records[0]?.epistemicPhase;
      const passed = expected !== undefined && records.every((record) => record?.epistemicPhase === expected);
      return {
        passed,
        invariantIds: ["identity", "restoration_and_re_presentation"],
        diagnostic: passed ? "storage-tier movement preserved epistemic phase" : `tier movement changed phases to ${records.map((record) => record?.epistemicPhase ?? "missing").join(",")}`,
        causalStepIds: ["move_tier_phase_warm", "move_tier_phase_cold", "move_tier_phase_hot"],
        causalEntityIds: ["obs_tier_phase"]
      };
    }
  },
  {
    id: "C07",
    tape: [
      command("observe_phase_ops", "OBSERVE", { input: observeInput("obs_phase_ops", { note: "canonical-body" }) }),
      command("move_phase_ops_warm", "MOVE_TIER", { input: { target: { kind: "observation", id: "obs_phase_ops" }, storageTier: "warm" } }),
      command("read_phase_ops_baseline", "READ_OBSERVATION", { observation_id: "obs_phase_ops" }),
      command("assemble_phase_ops", "ASSEMBLE", { input: { assemblyId: "asm_phase_ops", memberIds: ["obs_phase_ops"], cue: "phase shift" } }),
      command("read_phase_ops_assembled", "READ_OBSERVATION", { observation_id: "obs_phase_ops" }),
      command("crystallize_phase_ops", "CRYSTALLIZE", { input: crystallizeInput("ins_phase_ops", "asm_phase_ops", ["obs_phase_ops"], "candidate") }),
      command("read_phase_ops_crystallized", "READ_OBSERVATION", { observation_id: "obs_phase_ops" }),
      command("reopen_phase_ops", "REOPEN", { input: { insightId: "ins_phase_ops", targetPhase: "dispersed" } }),
      command("read_phase_ops_reopened", "READ_OBSERVATION", { observation_id: "obs_phase_ops" })
    ],
    evaluate: (run) => {
      const records = ["baseline", "assembled", "crystallized", "reopened"].map((suffix) => output<ObservationRecord>(run, `read_phase_ops_${suffix}`));
      const baseline = records[0];
      const passed = baseline !== null && records.every((record) => record !== null
        && canonical(record.payload) === canonical(baseline?.payload) && record.storageTier === baseline?.storageTier);
      return {
        passed,
        invariantIds: ["identity", "representation_loss_declaration"],
        diagnostic: passed ? "epistemic operations preserved canonical payload and storage tier" : `epistemic operations produced tiers ${records.map((record) => record?.storageTier ?? "missing").join(",")}`,
        causalStepIds: ["assemble_phase_ops", "crystallize_phase_ops", "reopen_phase_ops"],
        causalEntityIds: ["obs_phase_ops", "asm_phase_ops", "ins_phase_ops"]
      };
    }
  },
  {
    id: "C08",
    tape: [
      command("observe_atomic", "OBSERVE", { input: observeInput("obs_atomic", { address: "12 Old Street" }) }),
      command("assemble_atomic", "ASSEMBLE", { input: { assemblyId: "asm_atomic", memberIds: ["obs_atomic"], cue: "keep assembling" } }),
      command("snapshot_atomic_before", "SNAPSHOT"), command("audit_atomic_before", "AUDIT"),
      command("inject_atomic_failure", "INJECT_FAILURE", { point: "mid_correct_after_new_version" }),
      command("correct_atomic", "CORRECT", { input: { observationId: "obs_atomic", payload: payload({ address: "90 New Avenue" }) } }),
      command("snapshot_atomic_after", "SNAPSHOT"), command("audit_atomic_after", "AUDIT")
    ],
    evaluate: (run) => {
      const passed = failed(run, "correct_atomic")
        && canonical(output(run, "snapshot_atomic_before")) === canonical(output(run, "snapshot_atomic_after"))
        && canonical(output(run, "audit_atomic_before")) === canonical(output(run, "audit_atomic_after"));
      return {
        passed,
        invariantIds: ["identity", "correction_lineage"],
        diagnostic: passed ? "forced failure left canonical, phase, and audit state unchanged" : "forced failure left a partial mutation"
      };
    }
  },
  {
    id: "C09",
    tape: [
      command("observe_reject_evidence", "OBSERVE", { input: observeInput("obs_reject_evidence", { claim: "candidate-fact" }) }),
      command("assemble_reject", "ASSEMBLE", { input: { assemblyId: "asm_reject", memberIds: ["obs_reject_evidence"], cue: "candidate group" } }),
      command("crystallize_reject_original", "CRYSTALLIZE", { input: crystallizeInput("ins_reject", "asm_reject", ["obs_reject_evidence"], "same crystallized claim") }),
      command("observe_rejection", "OBSERVE", { input: observeInput("obs_rejection", { statement: "I reject this insight" }, { kind: "user_self_report", speaker: "user" }) }),
      command("reject_insight", "REJECT", { input: { fromRef: { kind: "observation", id: "obs_rejection" }, toRef: { kind: "insight", id: "ins_reject" }, note: "synthetic user rejection" } }),
      command("reopen_rejected", "REOPEN", { input: { insightId: "ins_reject", targetPhase: "assembling" } }),
      command("recreate_rejected", "CRYSTALLIZE", { input: crystallizeInput("ins_reject_recreated", "asm_reject", ["obs_reject_evidence"], "same crystallized claim") })
    ],
    evaluate: (run) => {
      const passed = failed(run, "reopen_rejected", "restoration_and_re_presentation")
        && failed(run, "recreate_rejected", "restoration_and_re_presentation");
      return {
        passed,
        invariantIds: ["restoration_and_re_presentation", "provenance"],
        diagnostic: passed ? "user rejection blocked reopening and semantic recreation" : "a rejected insight remained usable or was recreated",
        causalStepIds: ["reject_insight", "reopen_rejected", "recreate_rejected"],
        causalEntityIds: ["ins_reject", "ins_reject_recreated"]
      };
    }
  },
  {
    id: "C10",
    tape: [
      command("observe_secret", "OBSERVE", { input: observeInput("obs_secret", { secret: "payloadsecret9x" }, { speaker: "speakersecret8v", observer: "observersecret7k", sourceRef: "sourcesecret6m" }) }),
      command("observe_secret_peer", "OBSERVE", { input: observeInput("obs_secret_peer", { note: "keep-visible-beta" }) }),
      command("relate_secret", "RELATE", { input: { type: "simultaneity", fromRef: { kind: "observation", id: "obs_secret" }, toRef: { kind: "observation", id: "obs_secret_peer" }, note: "relationsecret5q" } }),
      command("assemble_secret", "ASSEMBLE", { input: { assemblyId: "asm_secret", memberIds: ["obs_secret", "obs_secret_peer"], cue: "cuesecret4r" } }),
      command("crystallize_secret", "CRYSTALLIZE", { input: crystallizeInput("ins_secret", "asm_secret", ["obs_secret", "obs_secret_peer"], "insightsecret3t", { uncertainty: { declared: true, note: "uncertaintysecret2w", recognizerConfidence: null }, falsificationConditions: ["falsifiersecret1z"] }) }),
      command("materialise_secret_surfaces", "MATERIALISE_PUBLIC_SURFACES", { request: surfaceRequest() }),
      command("read_secret_surfaces_before", "READ_PUBLIC_SURFACES", { request: surfaceRequest() }),
      command("forget_secret", "FORGET", { input: { observationId: "obs_secret", note: "synthetic deletion contract" } }),
      command("read_secret_surfaces", "READ_PUBLIC_SURFACES", { request: surfaceRequest() })
    ],
    evaluate: (run) => {
      const setupSteps = ["observe_secret", "observe_secret_peer", "relate_secret", "assemble_secret", "crystallize_secret", "materialise_secret_surfaces", "read_secret_surfaces_before"];
      const setupSucceeded = setupSteps.every((stepId) => run.byStep.get(stepId)?.ok === true);
      const before = output<PublicSurfaceBundle>(run, "read_secret_surfaces_before");
      const surfaces = output<PublicSurfaceBundle>(run, "read_secret_surfaces");
      const beforeSurfaceGroups = before === null ? [] : Object.keys(before);
      const surfaceGroups = surfaces === null ? [] : Object.keys(surfaces);
      const completeSurfaceSet = canonical(surfaceGroups) === canonical([...PUBLIC_SURFACE_GROUPS])
        && canonical(beforeSurfaceGroups) === canonical([...PUBLIC_SURFACE_GROUPS]);
      const preforgetDisclosures = disclosureMatches(before, C10_SENTINELS);
      const preforgetSentinels = new Set(preforgetDisclosures.map((entry) => entry.sentinel));
      const preconditionsMet = setupSucceeded
        && before !== null
        && surfaces !== null
        && completeSurfaceSet
        && preforgetSentinels.size === C10_SENTINELS.length;
      const disclosures = disclosureMatches(surfaces, C10_SENTINELS);
      const count = disclosures.length;
      const passed = preconditionsMet && count === 0;
      return {
        passed,
        invariantIds: ["deletion_and_consent", "provenance", "restoration_and_re_presentation"],
        diagnostic: !preconditionsMet
          ? "public-surface evaluation was incomplete or a fixture setup operation failed"
          : count === 0
            ? "forgotten text was absent from every enumerated public surface"
            : `${count} public-surface/sentinel pairs disclosed forgotten text`,
        publicDisclosureCount: count,
        surfaceGroupsEvaluated: surfaceGroups,
        sentinelsEvaluated: [...C10_SENTINELS],
        preforgetPublicDisclosures: preforgetDisclosures,
        publicDisclosures: disclosures,
        causalStepIds: ["forget_secret", "read_secret_surfaces"],
        causalEntityIds: ["obs_secret", "asm_secret", "ins_secret"],
        preconditionsMet
      };
    }
  }
];

const CONTROL_DEFINITIONS: ControlDefinition[] = [
  {
    id: "O01",
    tape: [
      command("o1_observe", "OBSERVE", { input: observeInput("o1_current", { topic: "ordinary-current" }) }),
      command("o1_read", "READ_OBSERVATION", { observation_id: "o1_current" }),
      command("o1_retrieve", "RETRIEVE", { input: { tokens: ["ordinary", "current"] } })
    ],
    evaluate: (run) => ({ passed: output<ObservationRecord>(run, "o1_read")?.current === true && retrievalCount(run, "o1_retrieve") === 1, diagnostic: "current observation read and retrieval" })
  },
  {
    id: "O02",
    tape: [
      command("o2_observe", "OBSERVE", { input: observeInput("o2_consent", { topic: "ordinary-consent" }) }),
      command("o2_retrieve", "RETRIEVE", { input: { tokens: ["ordinary", "consent"], use: "retrieve" } }),
      command("o2_present", "RETRIEVE", { input: { tokens: ["ordinary", "consent"], use: "present" } }),
      command("o2_trace", "TRACE_INDEX", { observation_id: "o2_consent" })
    ],
    evaluate: (run) => ({ passed: retrievalCount(run, "o2_retrieve") === 1 && retrievalCount(run, "o2_present") === 1 && evidenceUsable(run, "o2_trace"), diagnostic: "pre-withdrawal retrieval, presentation, and trace" })
  },
  {
    id: "O03",
    tape: [
      command("o3_observe_a", "OBSERVE", { input: observeInput("o3_a", { fragment: "ordinary pair a" }) }),
      command("o3_observe_b", "OBSERVE", { input: observeInput("o3_b", { fragment: "ordinary pair b" }) }),
      command("o3_assemble", "ASSEMBLE", { input: { assemblyId: "o3_asm", memberIds: ["o3_a", "o3_b"], cue: "ordinary pair" } }),
      command("o3_crystallize", "CRYSTALLIZE", { input: crystallizeInput("o3_ins", "o3_asm", ["o3_a", "o3_b"], "ordinary candidate") }),
      command("o3_read_assembly", "READ_ASSEMBLY", { assembly_id: "o3_asm" }),
      command("o3_read_insight", "READ_INSIGHT", { insight_id: "o3_ins" }),
      command("o3_trace", "TRACE", { input: { from: { kind: "insight", id: "o3_ins" } } })
    ],
    evaluate: (run) => {
      const assembly = output<AssemblyRecord>(run, "o3_read_assembly");
      const insight = output<InsightRecord>(run, "o3_read_insight");
      return {
        passed: assembly?.memberIds.length === 2 && insight?.uncertainty.declared === true
          && insight.falsificationConditions.length === 1 && evidenceUsable(run, "o3_trace"),
        diagnostic: "two-fragment assembly and evidence-bearing crystallisation"
      };
    }
  },
  {
    id: "O04",
    tape: [
      command("o4_observe", "OBSERVE", { input: observeInput("o4_tier", { topic: "ordinary-tier" }) }),
      command("o4_move_cold", "MOVE_TIER", { input: { target: { kind: "observation", id: "o4_tier" }, storageTier: "cold" } }),
      command("o4_restore", "RESTORE", { input: { observationId: "o4_tier", version: 1, targetTier: "hot" } }),
      command("o4_read", "READ_OBSERVATION", { observation_id: "o4_tier" })
    ],
    evaluate: (run) => ({ passed: run.byStep.get("o4_restore")?.ok === true && output<ObservationRecord>(run, "o4_read")?.storageTier === "hot", diagnostic: "normal storage movement and current-version restoration" })
  },
  {
    id: "O05",
    tape: [
      command("o5_observe", "OBSERVE", { input: observeInput("o5_trace", { topic: "ordinary-trace" }) }),
      command("o5_trace", "TRACE", { input: { from: { kind: "observation", id: "o5_trace" } } }),
      command("o5_audit", "AUDIT")
    ],
    evaluate: (run) => ({ passed: evidenceUsable(run, "o5_trace") && (output<unknown[]>(run, "o5_audit")?.length ?? 0) >= 2, diagnostic: "pre-governance trace and audit" })
  },
  {
    id: "O06",
    tape: [
      command("o6_observe", "OBSERVE", { input: observeInput("o6_voice", { voiceLevelChange: "drop" }, { payload: payload({ voiceLevelChange: "drop" }, "prosody") }) }),
      command("o6_read", "READ_OBSERVATION", { observation_id: "o6_voice" }),
      command("o6_tokens", "TOKENS", { observation_id: "o6_voice" })
    ],
    evaluate: (run) => ({ passed: output<ObservationRecord>(run, "o6_read")?.payload.kind === "prosody" && !(output<string[]>(run, "o6_tokens") ?? []).includes("sad"), diagnostic: "ordinary non-verbal observation remained non-interpretive" })
  }
];

function createAdapter(conditionId: BenchmarkConditionId): BenchmarkAdapter {
  switch (conditionId) {
    case "h2o_complete": return new CompleteAdapter();
    case "derived_authority": return new DerivedAuthorityAdapter();
    case "coupled_axes": return new CoupledAxesAdapter();
    case "delayed_governance": return new DelayedGovernanceAdapter();
  }
}

function adapterName(conditionId: BenchmarkConditionId): string {
  switch (conditionId) {
    case "h2o_complete": return "CompleteAdapter";
    case "derived_authority": return "DerivedAuthorityAdapter";
    case "coupled_axes": return "CoupledAxesAdapter";
    case "delayed_governance": return "DelayedGovernanceAdapter";
  }
}

function executeTape(conditionId: BenchmarkConditionId, tape: BenchmarkCommand[]): TapeRun {
  const adapter = createAdapter(conditionId);
  const executions = tape.map((entry) => adapter.execute(entry));
  return { tape, tapeHash: sha256(tape), executions, byStep: new Map(executions.map((entry) => [entry.step_id, entry])) };
}

function events(run: TapeRun): MechanismEvent[] {
  return run.executions.flatMap((execution) => execution.mechanism_events);
}

function mechanismTrace(passed: boolean, observedEvents: MechanismEvent[]): string | null {
  if (passed) return null;
  const mechanisms = [...new Set(observedEvents.map((event) => event.mechanism))];
  return mechanisms.length === 1 ? mechanisms[0] ?? null : null;
}

function contractResult(conditionId: BenchmarkConditionId, definition: ContractDefinition): ContractResult {
  const run = executeTape(conditionId, definition.tape);
  const evaluation = definition.evaluate(run);
  const causalStepIds = evaluation.causalStepIds ?? definition.tape.map((command) => command.step_id);
  const causalStepSet = new Set(causalStepIds);
  const causalEntityIds = evaluation.causalEntityIds ?? [];
  const causalEntitySet = new Set(causalEntityIds);
  const observedEvents = events(run).filter((event) =>
    causalStepSet.has(event.step_id)
    && (causalEntitySet.size === 0 || event.entity_ids.some((entityId) => causalEntitySet.has(entityId)))
  );
  const trace = mechanismTrace(evaluation.passed, observedEvents);
  return {
    contract_id: definition.id,
    passed: evaluation.passed,
    invariant_ids: evaluation.invariantIds,
    diagnostic: evaluation.diagnostic,
    operation_tape_hash: run.tapeHash,
    operation_sequence: run.executions.map((execution) => ({ step_id: execution.step_id, operation: execution.operation, arguments_hash: execution.arguments_hash })),
    stale_authority_count: observedEvents.filter((event) => event.kind === "derived_view_used_as_authority" || event.kind === "stale_governed_view_used").length,
    cross_axis_mutation_count: observedEvents.filter((event) => event.kind === "phase_changed_by_tier_move" || event.kind === "tier_changed_by_phase_operation").length,
    public_disclosure_count: evaluation.publicDisclosureCount ?? 0,
    trace_mismatch_count: evaluation.passed || trace !== null ? 0 : 1,
    mechanism_trace: trace,
    mechanism_events: observedEvents,
    causal_step_ids: causalStepIds,
    causal_entity_ids: causalEntityIds,
    evaluation_preconditions_met: evaluation.preconditionsMet ?? true,
    public_surface_groups_evaluated: evaluation.surfaceGroupsEvaluated ?? [],
    sentinels_evaluated: evaluation.sentinelsEvaluated ?? [],
    preforget_public_disclosures: evaluation.preforgetPublicDisclosures ?? [],
    public_disclosures: evaluation.publicDisclosures ?? []
  };
}

function controlResult(conditionId: BenchmarkConditionId, definition: ControlDefinition): OrdinaryControlResult {
  const run = executeTape(conditionId, definition.tape);
  const evaluation = definition.evaluate(run);
  return { control_id: definition.id, passed: evaluation.passed, diagnostic: evaluation.diagnostic, operation_tape_hash: run.tapeHash };
}

function conditionResult(config: BenchmarkConfig, condition: ConfigCondition): ConditionResult {
  const contracts = CONTRACT_DEFINITIONS.map((definition) => contractResult(condition.id, definition));
  const controls = CONTROL_DEFINITIONS.map((definition) => controlResult(condition.id, definition));
  const targetIds = new Set(config.contracts.filter((contract) => contract.target_conditions.includes(condition.id)).map((contract) => contract.id));
  const failures = contracts.filter((contract) => !contract.passed);
  const nonTargetsPass = contracts.filter((contract) => !targetIds.has(contract.contract_id)).every((contract) => contract.passed);
  const targetFailureCount = failures.filter((contract) => targetIds.has(contract.contract_id)).length;
  const traceMismatchCount = failures.filter((contract) => contract.mechanism_trace !== condition.removed_mechanism).length;
  const ordinaryPass = controls.every((control) => control.passed);
  const staleAuthorityCount = contracts.reduce((sum, contract) => sum + contract.stale_authority_count, 0);
  const crossAxisMutationCount = contracts.reduce((sum, contract) => sum + contract.cross_axis_mutation_count, 0);
  const publicDisclosureCount = contracts.reduce((sum, contract) => sum + contract.public_disclosure_count, 0);
  const complete = condition.id === "h2o_complete";
  const admissible = complete
    ? contracts.every((contract) => contract.passed) && ordinaryPass
      && staleAuthorityCount === config.complete_acceptance.stale_authority_count
      && crossAxisMutationCount === config.complete_acceptance.cross_axis_mutation_count
      && publicDisclosureCount === config.complete_acceptance.public_disclosure_count
      && traceMismatchCount === config.complete_acceptance.trace_mismatch_count
    : ordinaryPass && nonTargetsPass
      && targetFailureCount >= config.counterfactual_admissibility.minimum_target_contract_failures
      && traceMismatchCount === 0;
  return {
    condition_id: condition.id,
    removed_mechanism: condition.removed_mechanism,
    adapter_implementation: adapterName(condition.id),
    contract_pass_count: contracts.filter((contract) => contract.passed).length,
    ordinary_control_pass_count: controls.filter((control) => control.passed).length,
    ordinary_control_total: controls.length,
    stale_authority_count: staleAuthorityCount,
    cross_axis_mutation_count: crossAxisMutationCount,
    public_disclosure_count: publicDisclosureCount,
    trace_mismatch_count: traceMismatchCount,
    admissible,
    ordinary_controls: controls,
    contracts
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  }
  return value;
}

function assertFixedConfig(config: BenchmarkConfig): void {
  if (config.source_sha256 !== EXPECTED_CONFIG_SHA256) throw new Error(`v0.8 config hash changed: ${config.source_sha256}`);
  if (canonical(config.conditions.map((condition) => condition.id)) !== canonical(CONDITION_IDS)) throw new Error("v0.8 condition order does not match the pre-registration");
  if (canonical(config.contracts.map((contract) => contract.id)) !== canonical(CONTRACT_IDS)) throw new Error("v0.8 contract order does not match the pre-registration");
  if (config.network_allowed || config.paid_api_allowed || config.random_seed !== 20260901) throw new Error("v0.8 execution boundary does not match the pre-registration");
}

export function loadBenchmarkConfig(path: string): BenchmarkConfig {
  const raw = readFileSync(path);
  const sourceSha256 = createHash("sha256").update(raw).digest("hex");
  if (sourceSha256 !== EXPECTED_CONFIG_SHA256) {
    throw new Error(`refusing changed v0.8 config: expected ${EXPECTED_CONFIG_SHA256}, received ${sourceSha256}`);
  }
  const parsed = JSON.parse(raw.toString("utf8")) as Omit<BenchmarkConfig, "source_sha256">;
  const config: BenchmarkConfig = { ...parsed, source_sha256: sourceSha256 };
  assertFixedConfig(config);
  return deepFreeze(config);
}

export function runContractBenchmark(config: BenchmarkConfig): ContractBenchmarkResult {
  assertFixedConfig(config);
  const conditions = config.conditions.map((condition) => conditionResult(config, condition));
  return {
    schema_version: "2.1.0",
    benchmark_id: config.benchmark_id,
    config_version: config.version,
    preregistration_commit: PREREGISTRATION_COMMIT,
    config_sha256: config.source_sha256,
    deterministic: true,
    overall_result: conditions.every((condition) => condition.admissible) ? "PASS" : "FAIL",
    claim_boundary: config.claim_boundary,
    conditions
  };
}

export function stableBenchmarkJson(result: ContractBenchmarkResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function operationTapeHashes(): Record<ContractId, string> {
  return Object.fromEntries(CONTRACT_DEFINITIONS.map((definition) => [definition.id, sha256(definition.tape)])) as Record<ContractId, string>;
}

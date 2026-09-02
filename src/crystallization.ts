import { MemoryEngine } from "./engine.js";
import type {
  CrystallizationFormation,
  EntityRef,
  InsightRecord,
  IsoTime,
  UncertaintyRecord
} from "./types.js";

export interface CrystallizationThresholds {
  minEvidence: number;
  minSupportDensity: number;
  minDensityDelta: number;
  minPredictionErrorDrop: number;
}

export interface CrystallizationSample {
  at: IsoTime;
  evidenceIds: string[];
  supportDensity: number;
  predictionError: number;
}

export interface CrystallizationPlan {
  assemblyId?: string;
  insightId?: string;
  statement: string;
  uncertainty: UncertaintyRecord;
  falsificationConditions: string[];
}

export type CrystallizationStatus = "held" | "accumulating" | "crystallized";

export interface CrystallizationDecision {
  status: CrystallizationStatus;
  sudden: boolean;
  reason:
    | "insufficient_evidence"
    | "thresholds_not_crossed"
    | "sudden_threshold_crossing";
  formation: CrystallizationFormation;
  insight: InsightRecord | null;
}

export interface CrystallizationTimingEvaluation {
  expectedIndex: number;
  detectedIndex: number | null;
  premature: boolean;
  late: boolean;
  missed: boolean;
  onTime: boolean;
  timingError: number | null;
}

function assertUnitInterval(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between zero and one`);
  }
}

function validateThresholds(thresholds: CrystallizationThresholds): void {
  if (!Number.isInteger(thresholds.minEvidence) || thresholds.minEvidence < 1) {
    throw new Error("minEvidence must be a positive integer");
  }
  assertUnitInterval("minSupportDensity", thresholds.minSupportDensity);
  assertUnitInterval("minDensityDelta", thresholds.minDensityDelta);
  assertUnitInterval("minPredictionErrorDrop", thresholds.minPredictionErrorDrop);
}

function validateSample(sample: CrystallizationSample, previous: CrystallizationSample | null): void {
  if (!Number.isFinite(Date.parse(sample.at))) {
    throw new Error("sample time must be a valid ISO timestamp");
  }
  if (previous !== null && Date.parse(sample.at) <= Date.parse(previous.at)) {
    throw new Error("sample time must increase strictly");
  }
  if (sample.evidenceIds.length !== new Set(sample.evidenceIds).size) {
    throw new Error("sample evidence IDs must be unique");
  }
  assertUnitInterval("supportDensity", sample.supportDensity);
  assertUnitInterval("predictionError", sample.predictionError);
}

function observationNeighbour(
  relation: { fromRef: EntityRef; toRef: EntityRef },
  observationId: string
): string | null {
  if (relation.fromRef.kind === "observation" && relation.fromRef.id === observationId) {
    return relation.toRef.kind === "observation" ? relation.toRef.id : null;
  }
  if (relation.toRef.kind === "observation" && relation.toRef.id === observationId) {
    return relation.fromRef.kind === "observation" ? relation.fromRef.id : null;
  }
  return null;
}

/**
 * Stage C deterministic metric baseline. It detects one abrupt threshold
 * crossing; it neither learns its thresholds nor models human realisation.
 */
export class SuddenCrystallizationController {
  private previous: CrystallizationSample | null = null;
  private formed: InsightRecord | null = null;

  constructor(
    private readonly engine: MemoryEngine,
    private readonly thresholds: CrystallizationThresholds
  ) {
    validateThresholds(thresholds);
  }

  observe(sample: CrystallizationSample, plan: CrystallizationPlan): CrystallizationDecision {
    validateSample(sample, this.previous);
    if (this.formed !== null) {
      throw new Error(`insight ${this.formed.insightId} has already crystallized`);
    }

    const densityDelta = Math.max(
      0,
      sample.supportDensity - (this.previous?.supportDensity ?? sample.supportDensity)
    );
    const predictionErrorDrop = Math.max(
      0,
      (this.previous?.predictionError ?? sample.predictionError) - sample.predictionError
    );
    const formation: CrystallizationFormation = {
      mode: "sudden_metric",
      at: sample.at,
      supportDensity: sample.supportDensity,
      densityDelta,
      predictionError: sample.predictionError,
      predictionErrorDrop
    };

    if (sample.evidenceIds.length < this.thresholds.minEvidence) {
      this.previous = structuredClone(sample);
      return {
        status: "held",
        sudden: false,
        reason: "insufficient_evidence",
        formation,
        insight: null
      };
    }

    const sudden =
      this.previous !== null &&
      sample.supportDensity >= this.thresholds.minSupportDensity &&
      densityDelta >= this.thresholds.minDensityDelta &&
      predictionErrorDrop >= this.thresholds.minPredictionErrorDrop;
    if (!sudden) {
      this.previous = structuredClone(sample);
      return {
        status: "accumulating",
        sudden: false,
        reason: "thresholds_not_crossed",
        formation,
        insight: null
      };
    }

    const evidence = new Set(sample.evidenceIds);
    const excluded = new Set<string>();
    for (const relation of this.engine.snapshot().relations) {
      if (relation.type !== "contradiction" && relation.type !== "potential_falsifier") {
        continue;
      }
      for (const evidenceId of evidence) {
        const neighbour = observationNeighbour(relation, evidenceId);
        if (neighbour !== null && !evidence.has(neighbour)) {
          excluded.add(neighbour);
        }
      }
    }

    const insight = this.engine.crystallize({
      assemblyId: plan.assemblyId,
      insightId: plan.insightId,
      evidenceIds: [...sample.evidenceIds],
      statement: plan.statement,
      uncertainty: structuredClone(plan.uncertainty),
      falsificationConditions: [...plan.falsificationConditions],
      excludedCounterevidenceIds: [...excluded].sort(),
      formation
    });
    this.previous = structuredClone(sample);
    this.formed = structuredClone(insight);
    return {
      status: "crystallized",
      sudden: true,
      reason: "sudden_threshold_crossing",
      formation,
      insight
    };
  }
}

export function evaluateCrystallizationTiming(
  detectedIndex: number | null,
  expectedIndex: number
): CrystallizationTimingEvaluation {
  if (!Number.isInteger(expectedIndex) || expectedIndex < 0) {
    throw new Error("expectedIndex must be a non-negative integer");
  }
  if (detectedIndex !== null && (!Number.isInteger(detectedIndex) || detectedIndex < 0)) {
    throw new Error("detectedIndex must be null or a non-negative integer");
  }
  const missed = detectedIndex === null;
  return {
    expectedIndex,
    detectedIndex,
    premature: detectedIndex !== null && detectedIndex < expectedIndex,
    late: detectedIndex !== null && detectedIndex > expectedIndex,
    missed,
    onTime: detectedIndex === expectedIndex,
    timingError: detectedIndex === null ? null : detectedIndex - expectedIndex
  };
}

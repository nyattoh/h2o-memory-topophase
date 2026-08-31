/**
 * Single exported invariant catalog.
 * Stable identifiers are reused in errors, validation, tests, and documentation.
 */
export const INVARIANTS = {
  identity: {
    id: "identity",
    statement:
      "Each observation has a stable ID and monotonically increasing versions; at most one current version exists per ID. Epistemic phase is canonical on assembly and insight candidates; an observation's phase is derived from the highest remaining candidate that references it, so shared evidence cannot disagree with those candidates."
  },
  provenance: {
    id: "provenance",
    statement:
      "Every canonical observation records speaker, observer, and/or source reference, plus an explicit kind distinguishing observed evidence, recognizer candidate, user self-report, and system inference."
  },
  temporal_validity: {
    id: "temporal_validity",
    statement:
      "Occurrence time, optional time span, and temporal validity windows are recorded; presentation as current uses only temporally valid current versions."
  },
  correction_lineage: {
    id: "correction_lineage",
    statement:
      "A correction invalidates the previous current value, appends a new version, and remains traceable; the old value is not deleted and cannot become current again by implication."
  },
  deletion_and_consent: {
    id: "deletion_and_consent",
    statement:
      "Forgotten observations and withdrawn consent cannot contribute to retrieval, presentation, sharing, or regeneration from stale derived views. FORGET propagates deletion to reachable re-presentable free text (payload, speaker, observer, sourceRef, relation notes, assembly cues, insight statements, uncertainty notes, falsifiers, derived tokens) while keeping stable IDs, audit, and tombstones. WITHDRAW_CONSENT is a monotonic reduction of currently permitted uses and applies as the effective public policy to every version of that observation; re-granting is not implemented. Retrieval (search) and re-presentation are separate consent uses; retrieve does not grant present. Public read APIs hide forgotten, invalidated, consent-blocked, stale, cold-unrestored, and temporally invalid bodies. Derived views are not generated without derive consent."
  },
  uncertainty: {
    id: "uncertainty",
    statement:
      "Insight candidates declare uncertainty and falsification conditions; recognizer candidates declare confidence; observed evidence is not treated as a user self-report."
  },
  simultaneity_and_ordering: {
    id: "simultaneity_and_ordering",
    statement:
      "Simultaneity and ordering relations do not collapse distinct identities; a contradictory fragment is retained unless an explicit deletion contract applies."
  },
  representation_loss_declaration: {
    id: "representation_loss_declaration",
    statement:
      "Derived text, summary, vector, graph, token, and index views declare representation loss, record source versions, and become unusable when stale. Non-verbal observations are closed measurement records; emotion, intention, and culture are not stored as observed fact and belong on a separate interpretation record kind."
  },
  restoration_and_re_presentation: {
    id: "restoration_and_re_presentation",
    statement:
      "Restoring a cold or restorable representation cannot revive a non-current, corrected, forgotten, temporally expired, or fully withdrawn value as current. Retrieve-only consent may rehydrate storage placement; restore success does not grant present and does not return re-presentable body. Cold or non-resident sources hide re-presentable free text on public reads and do not contribute to retrieve, including via derived search indexes, until restore re-checks consent, freshness, and version. TRACE uses the requested observation version without substituting current. TRACE counterevidence follows only versioned relations reachable from the target insight, its evidence, and its assembly members; excluded counterevidence is stored as version-pinned refs and is not implicitly resolved to a later current version. Consent, forget, and validity policy apply to both the pinned version and the current effective policy. User rejection of an insight or assembly is created only by REJECT from a user self-report onto an insight or assembly; it is distinct from correction, deletion, and consent withdrawal. Rejected candidates cannot be REOPENED. Rejection fingerprints block the same normalized statement with an equal or superset evidence set and block re-assembly of the same member set. Explicit user re-permission after rejection is not implemented."
  }
} as const;

export type InvariantId = keyof typeof INVARIANTS;

export const INVARIANT_IDS = Object.keys(INVARIANTS) as InvariantId[];

export function isInvariantId(value: string): value is InvariantId {
  return Object.hasOwn(INVARIANTS, value);
}

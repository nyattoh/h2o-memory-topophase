import type { InvariantId } from "../../src/invariants.js";

export interface NegativeFixture {
  id: string;
  title: string;
  invariants: InvariantId[];
}

export const NEGATIVE_FIXTURES: readonly NegativeFixture[] = [
  {
    id: "neg-01-cold-restore-after-correction",
    title: "After a current address is corrected, restoring a cold representation cannot revive the old address as current.",
    invariants: ["restoration_and_re_presentation", "correction_lineage"]
  },
  {
    id: "neg-02-stale-index-after-consent-withdrawal",
    title: "After consent withdrawal, a stale derived index cannot contribute to retrieval or an answer plan.",
    invariants: ["deletion_and_consent", "representation_loss_declaration"]
  },
  {
    id: "neg-03-delayed-cue-assembles-dispersed-fragments",
    title: "Long-dispersed, low-frequency fragments can assemble when a delayed cue arrives.",
    invariants: ["identity", "simultaneity_and_ordering"]
  },
  {
    id: "neg-04-voice-drop-is-not-self-reported-sadness",
    title: "An observed drop in voice level cannot become the user's self-reported fact that they are sad.",
    invariants: ["representation_loss_declaration", "uncertainty", "provenance"]
  },
  {
    id: "neg-05-contradiction-survives-low-frequency",
    title: "A contradictory fragment is not deleted merely because frequency or similarity is low.",
    invariants: ["simultaneity_and_ordering", "identity", "deletion_and_consent"]
  },
  {
    id: "neg-06-move-tier-does-not-change-phase",
    title: "A storage-tier-only operation does not change epistemic phase.",
    invariants: ["identity", "restoration_and_re_presentation"]
  },
  {
    id: "neg-07-phase-only-does-not-change-payload-or-tier",
    title: "An epistemic-phase-only operation does not change the canonical payload or storage tier.",
    invariants: ["identity", "representation_loss_declaration"]
  },
  {
    id: "neg-08-injected-failure-is-atomic",
    title: "A forced mid-operation failure leaves neither multiple current values nor multiple active phase states.",
    invariants: ["identity", "correction_lineage"]
  }
] as const;

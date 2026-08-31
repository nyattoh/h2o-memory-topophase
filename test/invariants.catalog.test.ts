import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INVARIANT_IDS, INVARIANTS, isInvariantId } from "../src/invariants.js";
import { NEGATIVE_FIXTURES } from "./fixtures/negatives.js";

const REQUIRED_IDS = [
  "identity",
  "provenance",
  "temporal_validity",
  "correction_lineage",
  "deletion_and_consent",
  "uncertainty",
  "simultaneity_and_ordering",
  "representation_loss_declaration",
  "restoration_and_re_presentation"
] as const;

describe("invariant catalog", () => {
  it("exports exactly the nine required identifiers once", () => {
    assert.deepEqual([...INVARIANT_IDS].sort(), [...REQUIRED_IDS].sort());
    assert.equal(Object.keys(INVARIANTS).length, 9);
    for (const id of REQUIRED_IDS) {
      assert.equal(INVARIANTS[id].id, id);
      assert.equal(typeof INVARIANTS[id].statement, "string");
      assert.equal(isInvariantId(id), true);
    }
    assert.equal(isInvariantId("novelty"), false);
  });

  it("maps every negative fixture to at least one catalog identifier", () => {
    assert.equal(NEGATIVE_FIXTURES.length, 8);
    for (const fixture of NEGATIVE_FIXTURES) {
      assert.ok(fixture.invariants.length > 0, fixture.id);
      for (const id of fixture.invariants) {
        assert.equal(isInvariantId(id), true, `${fixture.id} -> ${id}`);
        assert.ok(Object.hasOwn(INVARIANTS, id));
      }
    }
  });
});

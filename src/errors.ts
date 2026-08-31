import type { InvariantId } from "./invariants.js";
import type { OperationName } from "./types.js";

export class InvariantError extends Error {
  readonly invariantId: InvariantId;

  constructor(invariantId: InvariantId, message: string) {
    super(`${invariantId}: ${message}`);
    this.name = "InvariantError";
    this.invariantId = invariantId;
  }
}

export class OperationError extends Error {
  readonly operation: OperationName;
  readonly invariantId?: InvariantId;

  constructor(operation: OperationName, message: string, invariantId?: InvariantId) {
    super(invariantId ? `${operation} (${invariantId}): ${message}` : `${operation}: ${message}`);
    this.name = "OperationError";
    this.operation = operation;
    if (invariantId !== undefined) {
      this.invariantId = invariantId;
    }
  }
}

export class InjectedFailureError extends Error {
  readonly operation: OperationName;
  readonly failurePoint: string;

  constructor(operation: OperationName, failurePoint: string) {
    super(`${operation}: injected failure at ${failurePoint}`);
    this.name = "InjectedFailureError";
    this.operation = operation;
    this.failurePoint = failurePoint;
  }
}

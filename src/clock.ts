import type { Clock, IdFactory, IsoTime } from "./types.js";

export class SequentialClock implements Clock {
  private millis: number;

  constructor(startIso = "2026-01-01T00:00:00.000Z") {
    this.millis = Date.parse(startIso);
  }

  now(): IsoTime {
    return new Date(this.millis).toISOString();
  }

  advance(ms: number): void {
    this.millis += ms;
  }
}

export class SequentialIds implements IdFactory {
  private n = 0;

  next(prefix: string): string {
    this.n += 1;
    return `${prefix}_${this.n}`;
  }
}

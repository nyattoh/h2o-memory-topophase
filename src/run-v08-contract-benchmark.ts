import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  loadBenchmarkConfig,
  runContractBenchmark,
  stableBenchmarkJson
} from "./benchmark.js";

const DEFAULT_CONFIG = "artifacts/benchmarks/v0.8-contract/config.json";

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

const configPath = resolve(argumentValue("--config") ?? DEFAULT_CONFIG);
const outputPath = argumentValue("--output");
const result = runContractBenchmark(loadBenchmarkConfig(configPath));
const json = stableBenchmarkJson(result);

if (outputPath === null) {
  process.stdout.write(json);
} else {
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, json, "utf8");
  const digest = createHash("sha256").update(json, "utf8").digest("hex");
  writeFileSync(resolve(dirname(resolvedOutput), "SHA256SUMS"), `${digest}  ${basename(resolvedOutput)}\n`, "utf8");
  process.stdout.write(`${resolvedOutput}\n`);
}

if (result.overall_result !== "PASS") {
  process.exitCode = 1;
}

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "./compile.js";
import type { CamoConfig, TokenFile } from "./types.js";
import { validate } from "./validate.js";

const USAGE = `usage:
  camo compile --config <file> [--tokens <file>] [--out <file>] [--check]
  camo validate --config <file> [--tokens <file>]
`;

export const DEFAULT_TOKENS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../tokens/camo.tokens.json",
);

interface Args {
  command: string;
  config?: string;
  tokens?: string;
  out?: string;
  check: boolean;
}

function parseArgs(argv: string[]): Args | string {
  const [command, ...rest] = argv;
  if (command !== "compile" && command !== "validate") return `unknown or missing command "${command ?? ""}"`;
  const args: Args = { command, check: false };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    if (flag === "--check") args.check = true;
    else if (flag === "--config" || flag === "--tokens" || flag === "--out") {
      const value = rest[++i];
      if (value === undefined) return `${flag} needs a value`;
      args[flag.slice(2) as "config" | "tokens" | "out"] = value;
    } else return `unknown argument "${flag}"`;
  }
  if (!args.config) return "--config is required";
  if (args.command === "validate" && (args.out || args.check)) return "--out/--check apply to compile only";
  if (args.check && !args.out) return "--check requires --out";
  return args;
}

function readJson<T>(path: string, label: string): T {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`cannot read ${label} file: ${path}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`${label} file is not valid JSON (${path}): ${(e as Error).message}`);
  }
}

/** Runs the CLI; returns the process exit code. */
export async function main(argv: string[], io = { out: console.log, err: console.error }): Promise<number> {
  const args = parseArgs(argv);
  if (typeof args === "string") {
    io.err(`camo: ${args}\n${USAGE}`);
    return 2;
  }
  let config: CamoConfig;
  let tokens: TokenFile;
  try {
    config = readJson<CamoConfig>(resolve(args.config!), "config");
    tokens = readJson<TokenFile>(resolve(args.tokens ?? DEFAULT_TOKENS), "tokens");
  } catch (e) {
    io.err(`camo: ${(e as Error).message}`);
    return 2;
  }

  const { errors, warnings } = validate(config, tokens);
  for (const w of warnings) io.err(`warning [rule ${w.rule}] ${w.message}`);
  for (const e of errors) io.err(`error [rule ${e.rule}] ${e.message}`);
  if (errors.length > 0) {
    io.err(`camo: ${errors.length} error(s)`);
    return 1;
  }
  if (args.command === "validate") {
    io.out(`ok (${warnings.length} warning(s))`);
    return 0;
  }

  const css = compile(config, tokens);
  if (!args.out) {
    process.stdout.write(css);
    return 0;
  }
  const outPath = resolve(args.out);
  if (args.check) {
    const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
    if (current !== css) {
      io.err(`camo: ${args.out} is ${current === null ? "missing" : "out of date"}; run camo compile`);
      return 1;
    }
    io.out(`${args.out} is up to date`);
    return 0;
  }
  writeFileSync(outPath, css, "utf8");
  io.out(`wrote ${args.out}`);
  return 0;
}

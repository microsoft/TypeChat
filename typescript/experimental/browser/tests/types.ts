import type { BrowserTypeScriptCompiler, BrowserTypeScriptValidator, Result } from "../src/index.js";

interface Probe { value: number; }
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
declare const compiler: BrowserTypeScriptCompiler;
type CreatedValidator = Awaited<ReturnType<typeof compiler.createValidator<Probe>>>;
type ValidatorType = Expect<Equal<CreatedValidator, BrowserTypeScriptValidator<Probe>>>;
type ValidationResult = Expect<Equal<ReturnType<BrowserTypeScriptValidator<Probe>["validate"]>, Result<Probe>>>;

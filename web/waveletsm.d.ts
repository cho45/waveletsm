/* tslint:disable */
/* eslint-disable */
/**
*/
export class WasmCWT {
  free(): void;
/**
* @param {number} n
* @param {Float32Array} widths
* @param {number} morlet_w
*/
  constructor(n: number, widths: Float32Array, morlet_w: number);
/**
* @param {Float32Array} input
* @param {Float32Array} result
*/
  cwt(input: Float32Array, result: Float32Array): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmcwt_free: (a: number) => void;
  readonly wasmcwt_new: (a: number, b: number, c: number, d: number) => number;
  readonly wasmcwt_cwt: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;

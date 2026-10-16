// Wrangler's default module rules: *.wasm → WebAssembly.Module, *.bin → ArrayBuffer.
declare module "*.wasm" { const m: WebAssembly.Module; export default m; }
declare module "*.bin" { const d: ArrayBuffer; export default d; }

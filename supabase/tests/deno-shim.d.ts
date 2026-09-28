// Minimal Deno globals so `tsc` can type-check the Edge Function entry point under Node types.
declare namespace Deno {
  const env: { get(key: string): string | undefined };
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}

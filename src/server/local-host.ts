/* A API local só atende o próprio dispositivo.

   Escutar no loopback não basta: uma página qualquer pode apontar um domínio
   próprio para 127.0.0.1 (DNS rebinding) e, como passa a ser "mesma origem",
   ler as respostas. O cabeçalho Host denuncia isso, porque continua sendo o
   domínio do atacante. Puro de propósito, para rodar no middleware e em teste. */

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  return LOOPBACK_NAMES.has(name.toLowerCase());
}

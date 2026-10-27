/* Leitura da saída do `netstat -ano` do Windows.

   Separado de dev.mjs para ter teste: comparar com `:3000` por substring
   encerrava também quem escutava na 30000 ou na 30001. */

/** PIDs que escutam exatamente na porta local informada. */
export function listeningPids(netstatOutput, port) {
  const pids = new Set();
  for (const line of netstatOutput.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns[0] !== 'TCP' || columns[3] !== 'LISTENING') continue;
    if (!columns[1].endsWith(`:${port}`)) continue;
    pids.add(columns[4]);
  }
  return pids;
}

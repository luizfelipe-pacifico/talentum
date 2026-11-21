/* Thread de teste que aloca memória até estourar o teto do heap, como um PDF
   que infla streams sem fim. O servidor deve continuar de pé. */
const hoard = [];
for (;;) {
  hoard.push(new Array(1_000_000).fill(hoard.length));
}

/* Política da senha local (docs/SECURITY.md, "Local vault").

   Pura e sem imports: o backend a aplica como regra (a interface nunca é a
   barreira) e a tela a usa para mostrar a força enquanto a pessoa digita.

   Mínimo de 12 caracteres e recusa das senhas mais comuns, como pede o NIST
   SP 800-63B (seção 3.1.1.2): comprimento e lista de bloqueio valem mais do
   que exigir símbolos. A força é uma estimativa simples e honesta, não uma
   promessa; o que protege o arquivo é a senha somada ao custo do scrypt. */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

/* Senhas comuns (listas públicas de vazamentos e variações em português).
   Comparadas em minúsculas e sem espaços nas pontas. Pequena de propósito:
   o mínimo de 12 caracteres já elimina a maior parte das listas famosas. */
const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  '12345678901234',
  '123456789123',
  '111111111111',
  '000000000000',
  '123123123123',
  'qwertyuiopas',
  'qwerty123456',
  'qwertyuiop123',
  '1q2w3e4r5t6y',
  '1q2w3e4r5t6y7u',
  'q1w2e3r4t5y6',
  'asdfghjkl123',
  'zxcvbnm12345',
  'password1234',
  'password12345',
  'password123456',
  'passwordpassword',
  'iloveyou1234',
  'administrator',
  'administrador',
  'admin1234567',
  'adminadmin123',
  'letmein12345',
  'welcome12345',
  'welcome123456',
  'monkey123456',
  'dragon123456',
  'football1234',
  'baseball1234',
  'sunshine1234',
  'princess1234',
  'starwars1234',
  'trustno11234',
  'abcdefghijkl',
  'abc123456789',
  'abcd12345678',
  'senha1234567',
  'senha12345678',
  'senhasenha12',
  'minhasenha12',
  'minhasenha123',
  'minhasenha1234',
  'senhasegura1',
  'senhasegura12',
  'senhasegura123',
  'senhaforte123',
  'senhaforte1234',
  'mudar1234567',
  'mudarsenha12',
  'trocarsenha1',
  'brasil123456',
  'brasil2026!!',
  'flamengo1234',
  'corinthians1',
  'corinthians12',
  'corinthians123',
  'palmeiras123',
  'palmeiras1234',
  'saopaulo1234',
  'vasco1234567',
  'gremio123456',
  'cruzeiro1234',
  'botafogo1234',
  'fluminense12',
  'internacional',
  'jesuscristo1',
  'deusefiel123',
  'deuseamor123',
  'teamo1234567',
  'eteamo123456',
  'familia12345',
  'familia123456',
  'amorzinho123',
  'gatinha12345',
  'talentum1234',
  'talentum12345',
  'talentum123456',
  'talentumsenha',
  'financeiro12',
  'financas1234',
  'dinheiro1234',
  'carteira1234',
  'qazwsxedcrfv',
  'qwertyqwerty',
  'aaaaaaaaaaaa',
  'abcabcabcabc',
  'passw0rd1234',
  'p@ssw0rd1234',
  'p@ssword1234',
  's3nh@1234567',
  'changeme1234',
  'changemenow1',
  'computador12',
  'computador123',
  'internet1234',
  'segredo12345',
]);

export type PasswordProblem = 'TOO_SHORT' | 'TOO_LONG' | 'COMMON' | 'REPETITIVE';

export type PasswordAssessment = {
  /** 0 a 4. Abaixo de 2 a senha é recusada mesmo com 12 caracteres. */
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Muito fraca' | 'Fraca' | 'Razoável' | 'Boa' | 'Forte';
  problems: PasswordProblem[];
  acceptable: boolean;
};

const LABELS: PasswordAssessment['label'][] = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];

/** Mesma normalização do servidor antes do KDF: acentos compostos de jeitos diferentes são a mesma senha. */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

function isRepetitive(value: string): boolean {
  const unique = new Set(value.toLowerCase()).size;
  if (unique <= 3) return true;
  // Sequência simples de teclado ou numérica: "abcdefghijkl", "123456789012".
  let ascending = 0;
  for (let index = 1; index < value.length; index += 1) {
    if (value.charCodeAt(index) - value.charCodeAt(index - 1) === 1) ascending += 1;
  }
  return ascending >= value.length - 3;
}

export function assessPassword(raw: string): PasswordAssessment {
  const password = normalizePassword(raw);
  const length = [...password].length;
  const problems: PasswordProblem[] = [];
  if (length < PASSWORD_MIN_LENGTH) problems.push('TOO_SHORT');
  if (length > PASSWORD_MAX_LENGTH) problems.push('TOO_LONG');
  const lowered = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(lowered) || COMMON_PASSWORDS.has(lowered.replace(/\s+/g, ''))) problems.push('COMMON');
  if (length > 0 && isRepetitive(password)) problems.push('REPETITIVE');

  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  const words = password.trim().split(/\s+/).filter(Boolean).length;

  let score = 0;
  if (length >= PASSWORD_MIN_LENGTH) score = 2;
  if (length >= 16 || (length >= 14 && classes >= 3)) score = 3;
  if (length >= 20 || (length >= 16 && classes >= 3) || words >= 4) score = 4;
  if (problems.includes('COMMON') || problems.includes('REPETITIVE')) score = Math.min(score, 1);
  if (length < PASSWORD_MIN_LENGTH) score = Math.min(score, length >= 8 ? 1 : 0);

  const bounded = Math.max(0, Math.min(4, score)) as PasswordAssessment['score'];
  return { score: bounded, label: LABELS[bounded], problems, acceptable: problems.length === 0 && bounded >= 2 };
}

/** Frase da interface para o primeiro problema encontrado. */
export function passwordProblemMessage(problem: PasswordProblem): string {
  switch (problem) {
    case 'TOO_SHORT':
      return `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres. Uma frase com quatro palavras é fácil de lembrar e difícil de adivinhar.`;
    case 'TOO_LONG':
      return `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
    case 'COMMON':
      return 'Essa senha aparece em listas de senhas vazadas. Escolha outra.';
    case 'REPETITIVE':
      return 'Essa senha repete ou segue caracteres em sequência. Escolha outra.';
  }
}

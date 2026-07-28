import { hashSync } from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Uso: pnpm --filter @expense/api hash-password -- <senha>');
  process.exit(1);
}

console.log(hashSync(password, 12));

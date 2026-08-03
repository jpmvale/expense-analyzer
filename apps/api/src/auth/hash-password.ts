import { hashSync } from 'bcryptjs';

// O pnpm 10 repassa o próprio `--` como argumento, então `argv[2]` era o
// separador e não a senha: o script hasheava a string "--" em silêncio e
// devolvia um hash de aparência perfeitamente normal. Quem seguisse o comando
// documentado ficava sem conseguir logar — e com "--" valendo como senha.
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const password = args[0];

if (!password) {
  console.error('Uso: pnpm --filter @expense/api hash-password <senha>');
  process.exit(1);
}

// Uma senha com espaço sem aspas chega quebrada em vários argumentos, e só o
// primeiro pedaço viraria hash. Melhor recusar do que gerar um hash de um
// prefixo da senha que o usuário acha que escolheu.
if (args.length > 1) {
  console.error(
    `Recebi ${args.length} argumentos — provavelmente a senha tem espaço e ficou sem aspas.\n` +
      "Use: pnpm --filter @expense/api hash-password 'sua senha'",
  );
  process.exit(1);
}

console.log(hashSync(password, 12));

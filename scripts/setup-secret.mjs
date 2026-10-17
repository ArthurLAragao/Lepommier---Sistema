import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const target = resolve(process.env.INSTALLATION_SECRET_FILE ?? 'data/installation-secret');
mkdirSync(dirname(target), { recursive: true });
try {
  writeFileSync(target, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 });
  process.stdout.write(
    'Chave criada no arquivo local de instalação. Abra o arquivo apenas no computador da loja e mantenha-o privado. O valor não é exibido por este comando.\n',
  );
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
    process.stderr.write('O arquivo de instalação já existe. Ele não foi substituído.\n');
    process.exitCode = 1;
  } else
    throw new Error('Não foi possível criar o arquivo privado de instalação.', { cause: error });
}

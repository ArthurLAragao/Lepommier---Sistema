import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { z } from 'zod';
export async function privateInput(): Promise<{
  loginIdentifier: string;
  password: string;
  reason: string;
}> {
  if (process.argv.includes('--json-stdin')) {
    let text = '';
    for await (const chunk of process.stdin) {
      text += String(chunk);
      if (text.length > 4096) throw new Error('Input too large');
    }
    return z
      .object({ loginIdentifier: z.string(), password: z.string(), reason: z.string() })
      .strict()
      .parse(JSON.parse(text));
  }
  if (!process.stdin.isTTY)
    throw new Error('Use an interactive terminal or explicitly choose --json-stdin.');
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const loginIdentifier = await rl.question('Usuário: ');
    const reason = await rl.question('Motivo (não inclua senhas): ');
    process.stdout.write('Nova senha (não será exibida): ');
    muted = true;
    const password = await rl.question('');
    process.stdout.write('\n');
    muted = false;
    return { loginIdentifier, password, reason };
  } finally {
    rl.close();
  }
}

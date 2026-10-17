import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  authStateSchema,
  currentUserSchema,
  loginSchema,
  setupSchema,
  type CurrentUser,
} from '@pommier/shared';
import { Button, Card, ErrorState, Field, Loading } from '../components/ui.js';
import FoundationApp from '../App.js';
import {
  AuthError,
  authRequest,
  successSchema,
  currentAuthRevision,
  invalidateAuthRevision,
} from './api.js';

export default function AuthRoot() {
  const [current, setCurrent] = useState<CurrentUser | null>(null);
  const [state, setState] = useState<{ initialized: boolean; setupAvailable: boolean } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [generation, setGeneration] = useState(0);
  const [resolving, setResolving] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const currentUserId = current?.user.id;
  useEffect(() => {
    const controller = new AbortController();
    void authRequest('/auth/state', authStateSchema, { signal: controller.signal, silent: true })
      .then(async (next) => {
        if (controller.signal.aborted) return;
        setState(next);
        if (next.initialized) {
          try {
            const me = await authRequest('/auth/me', currentUserSchema, {
              signal: controller.signal,
              silent: true,
            });
            if (!controller.signal.aborted) setCurrent(me);
          } catch (cause) {
            if (cause instanceof AuthError && cause.status === 401) {
              if (!controller.signal.aborted) setCurrent(null);
            } else throw cause;
          }
        }
        if (!controller.signal.aborted) setError('');
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Não foi possível verificar o acesso.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolving(false);
      });
    return () => controller.abort();
  }, [generation]);
  useEffect(() => {
    const expired = () => {
      invalidateAuthRevision();
      setCurrent(null);
      setError('');
      setMessage('Seu acesso terminou. Entre novamente para continuar.');
      window.history.replaceState(null, '', '#overview');
    };
    window.addEventListener('pommier-session-expired', expired);
    return () => window.removeEventListener('pommier-session-expired', expired);
  }, []);
  useEffect(() => {
    if (!currentUserId) return;
    const controller = new AbortController();
    const check = () => {
      const revision = currentAuthRevision();
      void authRequest('/auth/me', currentUserSchema, { signal: controller.signal })
        .then((me) => {
          if (!controller.signal.aborted && revision === currentAuthRevision()) {
            setCurrent(me);
            setError('');
          }
        })
        .catch((cause: unknown) => {
          if (
            !controller.signal.aborted &&
            revision === currentAuthRevision() &&
            !(cause instanceof AuthError && cause.status === 401)
          )
            setError(
              'Não foi possível verificar seu acesso. Confira a conexão local e tente novamente.',
            );
        });
    };
    const timer = window.setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [currentUserId]);
  function reload() {
    invalidateAuthRevision();
    setResolving(true);
    setGeneration((value) => value + 1);
  }
  async function refreshCurrent() {
    const revision = currentAuthRevision();
    try {
      const me = await authRequest('/auth/me', currentUserSchema);
      if (revision === currentAuthRevision()) setCurrent(me);
    } catch (cause) {
      if (
        revision === currentAuthRevision() &&
        !(cause instanceof AuthError && cause.status === 401)
      )
        setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o acesso.');
    }
  }
  async function logout() {
    if (loggingOut) return;
    const revision = invalidateAuthRevision();
    setLoggingOut(true);
    try {
      await authRequest('/auth/logout', successSchema, { method: 'POST', body: {} });
      if (revision !== currentAuthRevision()) return;
      invalidateAuthRevision();
      setCurrent(null);
      setError('');
      setMessage('Você saiu do sistema.');
    } catch (cause) {
      if (revision === currentAuthRevision())
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível sair. Tente novamente.',
        );
    } finally {
      setLoggingOut(false);
    }
  }
  if (resolving)
    return (
      <AuthFrame>
        <Loading label="Verificando seu acesso…" />
      </AuthFrame>
    );
  if (error && !current)
    return (
      <AuthFrame>
        <ErrorState
          title="A instalação precisa de atenção"
          message={error}
          action={
            <Button variant="secondary" onClick={reload}>
              Tentar novamente
            </Button>
          }
        />
        <p className="auth-help">
          Peça ao responsável pela instalação para iniciar o banco e aplicar as migrações. Nenhuma
          operação está disponível antes da verificação do acesso.
        </p>
      </AuthFrame>
    );
  if (current)
    return (
      <>
        <FoundationApp
          current={current}
          onLogout={() => {
            void logout();
          }}
          loggingOut={loggingOut}
          onRefreshCurrent={() => {
            void refreshCurrent();
          }}
          onPasswordChanged={() => {
            invalidateAuthRevision();
            setCurrent(null);
            setError('');
            setMessage('Senha alterada. Entre novamente com a nova senha.');
          }}
        />
        {error && (
          <div className="auth-global-error" role="alert">
            {error}
            <Button variant="secondary" onClick={() => setError('')}>
              Fechar aviso
            </Button>
          </div>
        )}
      </>
    );
  return (
    <AuthFrame>
      <AccessForm
        setup={!state?.initialized}
        setupAvailable={state?.setupAvailable ?? false}
        message={message}
        onSuccess={(setup) => {
          setMessage(setup ? 'Conta criada. Entre com o usuário e a senha que você escolheu.' : '');
          reload();
        }}
      />
    </AuthFrame>
  );
}
function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <div className="auth-brand">
        <span className="wordmark">Le Pommier.</span>
        <span className="brand-subtitle">GESTÃO DA LOJA · ACESSO LOCAL</span>
      </div>
      <Card className="auth-card">{children}</Card>
      <p className="auth-footer">
        Seus dados ficam no computador da loja. Operações de loja ainda em desenvolvimento.
      </p>
    </main>
  );
}
function AccessForm({
  setup,
  setupAvailable,
  message,
  onSuccess,
}: {
  setup: boolean;
  setupAvailable: boolean;
  message: string;
  onSuccess: (setup: boolean) => void;
}) {
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const parsed = setup
      ? setupSchema.safeParse({
          loginIdentifier: login,
          displayName: name,
          password,
          installationSecret: secret,
        })
      : loginSchema.safeParse({ loginIdentifier: login, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos informados.');
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await authRequest(setup ? '/auth/setup' : '/auth/login', successSchema, {
        method: 'POST',
        body: parsed.data,
        silent: true,
      });
      setPassword('');
      setSecret('');
      onSuccess(setup);
    } catch (cause) {
      if (cause instanceof AuthError && cause.code === 'SETUP_CLOSED') {
        setPassword('');
        setSecret('');
        onSuccess(true);
      } else setError(cause instanceof Error ? cause.message : 'Não foi possível concluir.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <p className="eyebrow">{setup ? 'PRIMEIRO ACESSO' : 'BEM-VINDO(A)'}</p>
      <h1>{setup ? 'Preparar o acesso da loja' : 'Entrar no sistema'}</h1>
      <p className="auth-help">
        {setup
          ? 'Crie a primeira conta de proprietário. Esta etapa fecha permanentemente após a confirmação.'
          : 'Use seu acesso individual para continuar.'}
      </p>
      {message && (
        <p className="info-note" role="status">
          {message}
        </p>
      )}
      {setup && !setupAvailable && (
        <p className="info-note">
          O instalador precisa executar “npm run setup:secret” no computador da loja e abrir o
          arquivo privado de instalação. Depois, atualize esta página.
        </p>
      )}
      <form
        className="auth-form"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {setup && (
          <Field
            label="Seu nome"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
        )}
        <Field
          label="Usuário"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          required
          maxLength={32}
          hint={
            setup ? 'De 3 a 32 letras sem acento, números, ponto, hífen ou sublinhado.' : undefined
          }
        />
        <Field
          label="Senha"
          type="password"
          autoComplete={setup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          hint={
            setup
              ? 'Use uma frase com 12 a 128 caracteres. Espaços e acentos são preservados.'
              : undefined
          }
        />
        {setup && (
          <Field
            label="Chave de instalação"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
            hint="Obtida no arquivo local pelo instalador autorizado. Ela não é enviada por nenhum link ou tela pública."
          />
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Button type="submit" busy={busy} disabled={setup && !setupAvailable}>
          {setup ? 'Criar primeiro acesso' : 'Entrar'}
        </Button>
      </form>
      <p className="auth-help">
        {setup
          ? 'Nenhum usuário ou senha padrão foi criado.'
          : 'Esqueceu a senha? Procure um proprietário da loja. Não há recuperação por e-mail.'}
      </p>
    </>
  );
}

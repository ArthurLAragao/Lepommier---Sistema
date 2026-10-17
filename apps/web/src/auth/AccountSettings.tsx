import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  accountListSchema,
  createAccountSchema,
  editAccountSchema,
  hasPermission,
  roleLabels,
  roleSchema,
  changePasswordSchema,
  resetPasswordSchema,
  type Account,
  type CurrentUser,
  type Role,
} from '@pommier/shared';
import { Badge, Button, Field, Filter, Loading, Pagination, Table } from '../components/ui.js';
import { authRequest, successSchema } from './api.js';

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog-content account-dialog"
      aria-labelledby="account-dialog-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <h2 id="account-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
export function AccountSettings({
  current,
  onRefreshCurrent,
  onPasswordChanged,
}: {
  current: CurrentUser;
  onRefreshCurrent: () => void;
  onPasswordChanged: () => void;
}) {
  return (
    <section className="account-settings">
      <div className="section-title">
        <h2>Seu acesso</h2>
        <Badge>{roleLabels[current.user.role]}</Badge>
      </div>
      <OwnPassword onChanged={onPasswordChanged} />
      {hasPermission(current.user.role, 'accounts.manage') && (
        <AccountList onRefreshCurrent={onRefreshCurrent} />
      )}
    </section>
  );
}
function OwnPassword({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword: next });
    if (!parsed.success || next !== confirm) {
      setError(
        next !== confirm
          ? 'A confirmação da senha não confere.'
          : 'Use uma nova senha com 12 a 128 caracteres.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authRequest('/auth/password', successSchema, { method: 'POST', body: parsed.data });
      setCurrent('');
      setNext('');
      setConfirm('');
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a senha.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="card password-card auth-form"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <h3>Alterar minha senha</h3>
      <p className="auth-help">
        Todos os acessos da sua conta serão encerrados. Você precisará entrar novamente.
      </p>
      <div className="password-fields">
        <Field
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          hint="12 a 128 caracteres, sem cortes ou remoção de espaços."
        />
        <Field
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" busy={busy}>
        Alterar minha senha
      </Button>
    </form>
  );
}
function AccountList({ onRefreshCurrent }: { onRefreshCurrent: () => void }) {
  const [data, setData] = useState<{
    users: Account[];
    total: number;
    page: number;
    pageSize: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [toggling, setToggling] = useState<Account | null>(null);
  const [resetting, setResetting] = useState<Account | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void authRequest(`/users?page=${page}`, accountListSchema, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as contas.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [page, version]);
  function refresh(message: string) {
    setBusy(true);
    setVersion((v) => v + 1);
    setNotice(message);
    onRefreshCurrent();
  }
  return (
    <section className="card employee-card">
      <div className="section-title">
        <div>
          <h2>Equipe e acessos</h2>
          <p className="auth-help">
            Até cinco contas ativas. Contas desativadas mantêm seu histórico.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>Adicionar pessoa</Button>
      </div>
      {notice && (
        <p role="status" className="info-note">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
          <Button variant="secondary" onClick={() => refresh('')}>
            Atualizar lista
          </Button>
        </p>
      )}
      {busy ? (
        <Loading label="Carregando equipe…" />
      ) : (
        data && (
          <>
            <Table
              caption="Contas da equipe"
              rows={data.users}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: 'name',
                  label: 'Pessoa',
                  render: (row) => (
                    <>
                      <strong>{row.displayName}</strong>
                      <span className="account-login">{row.loginIdentifier}</span>
                    </>
                  ),
                },
                { key: 'role', label: 'Perfil', render: (row) => roleLabels[row.role] },
                {
                  key: 'status',
                  label: 'Situação',
                  render: (row) => (
                    <Badge tone={row.active ? 'success' : 'neutral'}>
                      {row.active ? 'Ativa' : 'Desativada'}
                    </Badge>
                  ),
                },
                {
                  key: 'actions',
                  label: 'Ações',
                  render: (row) => (
                    <div className="account-actions">
                      <Button
                        variant="secondary"
                        onClick={() => setEditing(row)}
                        aria-label={`Editar ${row.displayName}`}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setToggling(row)}
                        aria-label={`${row.active ? 'Desativar' : 'Reativar'} ${row.displayName}`}
                      >
                        {row.active ? 'Desativar' : 'Reativar'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setResetting(row)}
                        aria-label={`Redefinir senha de ${row.displayName}`}
                      >
                        Redefinir senha
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
            <Pagination
              page={page}
              pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))}
              onChange={(next) => {
                setBusy(true);
                setPage(next);
              }}
            />
          </>
        )
      )}
      {editing && (
        <AccountEditor
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh('Conta salva.');
          }}
        />
      )}
      {toggling && (
        <ToggleAccount
          account={toggling}
          onClose={() => setToggling(null)}
          onSaved={() => {
            setToggling(null);
            refresh('Situação da conta atualizada.');
          }}
        />
      )}
      {resetting && (
        <ResetPassword
          account={resetting}
          onClose={() => setResetting(null)}
          onSaved={() => {
            setResetting(null);
            refresh('Senha redefinida. A pessoa precisará entrar novamente.');
          }}
        />
      )}
    </section>
  );
}
function AccountEditor({
  account,
  onClose,
  onSaved,
}: {
  account: Account | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = account === 'new';
  const [name, setName] = useState(isNew ? '' : account.displayName);
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<Role>(isNew ? 'CASHIER' : account.role);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = isNew
      ? createAccountSchema.safeParse({ displayName: name, loginIdentifier: login, role, password })
      : editAccountSchema.safeParse({
          displayName: name,
          role,
          active: account.active,
          version: account.version,
          reason,
        });
    if (!parsed.success) {
      setError(
        'Confira os campos. A senha precisa ter 12 a 128 caracteres; o usuário usa de 3 a 32 caracteres sem acentos.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authRequest(isNew ? '/users' : `/users/${account.id}`, successSchema, {
        method: isNew ? 'POST' : 'PATCH',
        body: parsed.data,
      });
      setPassword('');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a conta.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={isNew ? 'Adicionar pessoa à equipe' : 'Editar conta'} onClose={onClose}>
      <form
        className="auth-form"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <Field
          label="Nome da pessoa"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {isNew ? (
          <Field
            label="Usuário"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            maxLength={32}
          />
        ) : (
          <p className="auth-help">
            Usuário: {account.loginIdentifier}. O identificador não muda após o cadastro.
          </p>
        )}
        <Filter
          label="Perfil de acesso"
          value={role}
          onChange={(e) => setRole(roleSchema.parse(e.target.value))}
        >
          {roleSchema.options.map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}
            </option>
          ))}
        </Filter>
        {isNew ? (
          <Field
            label="Senha inicial"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Escolha 12 a 128 caracteres e entregue a senha de forma privada."
          />
        ) : (
          <Field
            label="Motivo da alteração"
            required
            minLength={3}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Não inclua senhas ou dados pessoais desnecessários."
          />
        )}
        <p className="auth-help">
          Alterar o perfil encerra os acessos anteriores. É necessário manter pelo menos um
          proprietário ativo.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy}>
            Salvar conta
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ToggleAccount({
  account,
  onClose,
  onSaved,
}: {
  account: Account;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await authRequest(`/users/${account.id}`, successSchema, {
        method: 'PATCH',
        body: {
          displayName: account.displayName,
          role: account.role,
          active: !account.active,
          version: account.version,
          reason,
        },
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a conta.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`${account.active ? 'Desativar' : 'Reativar'} conta?`} onClose={onClose}>
      <p>
        {account.active
          ? 'Os acessos serão encerrados; o histórico será mantido.'
          : 'Esta pessoa poderá entrar novamente com sua senha.'}{' '}
        Conta: <strong>{account.displayName}</strong>.
      </p>
      <form
        className="auth-form"
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <Field
          label="Motivo"
          required
          minLength={3}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy}>
            Confirmar {account.active ? 'desativação' : 'reativação'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ResetPassword({
  account,
  onClose,
  onSaved,
}: {
  account: Account;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [owner, setOwner] = useState('');
  const [next, setNext] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = resetPasswordSchema.safeParse({
      ownerPassword: owner,
      newPassword: next,
      reason,
    });
    if (!parsed.success) {
      setError('Confira os campos. A nova senha deve ter 12 a 128 caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authRequest(`/users/${account.id}/password`, successSchema, {
        method: 'POST',
        body: parsed.data,
      });
      setOwner('');
      setNext('');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível redefinir a senha.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Redefinir senha: ${account.displayName}`} onClose={onClose}>
      <p>
        Confirme sua senha de proprietário. Todos os acessos da pessoa serão encerrados. Para sua
        própria conta, use “Alterar minha senha”.
      </p>
      <form
        className="auth-form"
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <Field
          label="Sua senha de proprietário"
          type="password"
          autoComplete="current-password"
          required
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        />
        <Field
          label="Nova senha da pessoa"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Field
          label="Motivo da redefinição"
          required
          minLength={5}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy}>
            Redefinir senha
          </Button>
        </div>
      </form>
    </Modal>
  );
}

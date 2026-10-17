import { useState, type FormEvent } from 'react';
import {
  customerListSchema,
  customerDetailSchema,
  customerCreateSchema,
  customerEditSchema,
  duplicatesSchema,
  formatPhone,
  hasPermission,
  marketingSchema,
  marketingStateSchema,
  csvDownloadSchema,
  type CustomerDto,
  type CurrentUser,
  type Duplicate,
} from '@pommier/shared';
import { Modal } from '../auth/AccountSettings.js';
import { AuthError, authRequest, successSchema } from '../auth/api.js';
import {
  Button,
  Field,
  Filter,
  Table,
  Badge,
  Search,
  Pagination,
  EmptyState,
} from '../components/ui.js';
import { DataStatus, TextArea } from './ui.js';
import {
  useRegistryData,
  errorMessage,
  marketingLabels,
  downloadCsv,
  preferenceSources,
  preferenceReasons,
} from './data.js';
import { ImportWizard } from './ImportWizard.js';

export default function Customers({ current }: { current: CurrentUser }) {
  const role = current.user.role;
  const canManage = hasPermission(role, 'customers.manage');
  const [q, setQ] = useState('');
  const [state, setState] = useState('active');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const result = useRegistryData(
    `/customers?${new URLSearchParams({ q, state, sort, page: String(page) })}`,
    customerListSchema,
  );
  function changed() {
    result.refresh();
  }
  if (!hasPermission(role, 'customers.read'))
    return (
      <EmptyState
        title="Acesso restrito"
        description="Seu perfil não tem acesso ao cadastro ou aos dados de clientes."
      />
    );
  async function exportData() {
    setExportBusy(true);
    setError('');
    try {
      const file = await authRequest('/customers/export', csvDownloadSchema, {
        method: 'POST',
        body: { q, state, sort, page: 1 },
      });
      downloadCsv(file.csv, 'le-pommier-clientes.csv');
      setExporting(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setExportBusy(false);
    }
  }
  return (
    <section className="registry-page">
      {selected ? (
        <CustomerProfile
          id={selected}
          current={current}
          onBack={() => {
            setSelected(null);
            changed();
          }}
          onChanged={changed}
        />
      ) : (
        <>
          <div className="registry-toolbar">
            <div>
              <h2>Clientes da loja</h2>
              <p>Cadastros individuais, com os dados necessários para o atendimento.</p>
            </div>
            <div className="registry-actions">
              {hasPermission(role, 'customers.import') && (
                <Button variant="secondary" onClick={() => setImporting(true)}>
                  Importar CSV
                </Button>
              )}
              {hasPermission(role, 'customers.export') && (
                <Button variant="secondary" onClick={() => setExporting(true)}>
                  Exportar CSV
                </Button>
              )}
              <Button onClick={() => setCreating(true)}>Novo cliente</Button>
            </div>
          </div>
          <div className="card registry-filters">
            <Search
              label="Buscar cliente"
              placeholder="Nome, telefone ou matrícula"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              maxLength={120}
            />
            <Filter
              label="Situação do cliente"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="active">Ativos</option>
              {canManage && (
                <>
                  <option value="inactive">Inativos</option>
                  <option value="all">Todos</option>
                </>
              )}
            </Filter>
            <Filter
              label="Ordenar clientes"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="name">Nome</option>
              <option value="registration">Matrícula</option>
              <option value="newest">Mais recentes</option>
            </Filter>
          </div>
          <DataStatus {...result} retry={result.refresh} />
          {!result.busy && result.data && (
            <section className="card registry-table">
              {result.data.items.length ? (
                <Table
                  caption="Clientes cadastrados"
                  rows={result.data.items}
                  rowKey={(row) => row.id}
                  columns={[
                    {
                      key: 'registration',
                      label: 'Matrícula',
                      render: (row) => (
                        <span className="registration-number">{row.registration}</span>
                      ),
                    },
                    {
                      key: 'name',
                      label: 'Nome',
                      render: (row) => (
                        <Button
                          variant="ghost"
                          onClick={() => setSelected(row.id)}
                          aria-label={`Abrir perfil de ${row.name}`}
                        >
                          {row.name}
                        </Button>
                      ),
                    },
                    { key: 'phone', label: 'Telefone', render: (row) => formatPhone(row.phone) },
                    {
                      key: 'status',
                      label: 'Situação',
                      render: (row) => (
                        <Badge tone={row.active ? 'success' : 'neutral'}>
                          {row.anonymizedAt ? 'Anonimizado' : row.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  title="Nenhum cliente encontrado"
                  description="Cadastre o primeiro cliente ou ajuste os filtros. Nenhum dado foi importado automaticamente."
                  action={<Button onClick={() => setCreating(true)}>Novo cliente</Button>}
                />
              )}
              <Pagination
                page={page}
                pageCount={Math.max(1, Math.ceil(result.data.total / 20))}
                onChange={setPage}
              />
            </section>
          )}
        </>
      )}
      {creating && (
        <CustomerForm
          current={current}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            changed();
            setSelected(id);
          }}
        />
      )}
      {importing && (
        <ImportWizard
          onClose={() => {
            setImporting(false);
            changed();
          }}
        />
      )}
      {exporting && (
        <Modal title="Exportar clientes" onClose={() => setExporting(false)}>
          <p>
            Exportação explícita do filtro atual (
            {state === 'active' ? 'ativos' : state === 'inactive' ? 'inativos' : 'todos'}). Inclui
            matrícula, nome, telefone, e-mail, situação e preferência de marketing. Exclui cadastros
            anonimizados, CPF, nascimento, endereço e observações.
          </p>
          <p>
            O arquivo pode conter dados pessoais. Guarde-o em local privado. A auditoria registra
            somente escopo e quantidade.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button variant="secondary" disabled={exportBusy} onClick={() => setExporting(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                void exportData();
              }}
              busy={exportBusy}
            >
              Confirmar exportação
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function CustomerForm({
  current,
  initial,
  onClose,
  onSaved,
  onReload,
}: {
  current: CurrentUser;
  initial?: CustomerDto;
  onClose: () => void;
  onSaved: (id: string) => void;
  onReload?: () => void;
}) {
  const role = current.user.role;
  const operational = hasPermission(role, 'customers.operational');
  const privateFields = hasPermission(role, 'customers.private');
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [birthday, setBirthday] = useState(initial?.birthday ?? '');
  const [cpf, setCpf] = useState(initial?.cpf ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [matches, setMatches] = useState<Duplicate[] | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  function input(set: (value: string) => void, value: string) {
    set(value);
    setMatches(null);
    setReason('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setConflict(false);
    const fields = {
      name,
      phone,
      ...(operational ? { email, birthday, address } : {}),
      ...(privateFields ? { cpf, notes } : {}),
      ...(reason ? { duplicateOverrideReason: reason } : {}),
    };
    const parsed = customerCreateSchema.safeParse(fields);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos.');
      return;
    }
    setBusy(true);
    try {
      const review = await authRequest('/customers/review', duplicatesSchema, {
        method: 'POST',
        body: { ...parsed.data, ...(initial ? { excludeId: initial.id } : {}) },
      });
      setMatches(review.matches);
      if (review.matches.some((m) => m.type === 'CPF')) {
        setError(
          'CPF já vinculado a outro cadastro. Revise o perfil existente; não há mesclagem automática.',
        );
        return;
      }
      if (review.matches.length && !reason) return;
      const body = initial
        ? customerEditSchema.parse({ ...parsed.data, version: initial.version })
        : parsed.data;
      const saved = await authRequest(
        initial ? `/customers/${initial.id}` : '/customers',
        customerDetailSchema,
        { method: initial ? 'PATCH' : 'POST', body },
      );
      onSaved(saved.customer.id);
    } catch (cause) {
      setError(errorMessage(cause));
      setConflict(cause instanceof AuthError && cause.code === 'STALE_RECORD');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={initial ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <form
        className="auth-form"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <p>Somente o nome é obrigatório. Os demais dados são opcionais.</p>
        <Field
          label="Nome do cliente"
          required
          autoComplete="name"
          value={name}
          maxLength={120}
          onChange={(e) => input(setName, e.target.value)}
        />
        <Field
          label="Telefone (opcional)"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => input(setPhone, e.target.value)}
          hint="Número brasileiro completo com DDD. Contatos compartilhados são permitidos após revisão."
        />
        {operational && (
          <details className="optional-fields" open={Boolean(initial)}>
            <summary>Mais informações opcionais</summary>
            <div className="form-grid">
              <Field
                label="E-mail (opcional)"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => input(setEmail, e.target.value)}
              />
              <Field
                label="Nascimento completo (opcional)"
                type="date"
                value={birthday}
                onChange={(e) => input(setBirthday, e.target.value)}
                hint="Informe dia, mês e ano reais; deixe vazio se não souber o ano."
              />
              <Field
                label="Endereço ou referência (opcional)"
                value={address}
                maxLength={300}
                onChange={(e) => input(setAddress, e.target.value)}
              />
              {privateFields && (
                <>
                  <Field
                    label="CPF (opcional, restrito)"
                    value={cpf}
                    maxLength={20}
                    autoComplete="off"
                    onChange={(e) => input(setCpf, e.target.value)}
                  />
                  <TextArea
                    label="Observações operacionais (opcional, restrito)"
                    value={notes}
                    maxLength={1000}
                    onChange={(e) => input(setNotes, e.target.value)}
                  />
                </>
              )}
            </div>
            <p className="auth-help">
              Use texto simples. Evite dados sensíveis desnecessários; CPF válido não comprova
              identidade. Marketing é administrado separadamente.
            </p>
          </details>
        )}
        {matches && matches.length > 0 && (
          <section className="duplicate-review">
            <h3>Revisão de duplicidades</h3>
            <p>
              Estes indícios não comprovam que se trata da mesma pessoa. Nenhum cadastro será
              mesclado.
            </p>
            <ul>
              {matches.map((match, i) => (
                <li key={i}>
                  {match.type === 'NAME'
                    ? 'Nome semelhante'
                    : match.type === 'PHONE'
                      ? 'Telefone compartilhado'
                      : match.type === 'EMAIL'
                        ? 'E-mail igual'
                        : 'CPF já cadastrado'}
                  : {match.registration} · {match.name}
                </li>
              ))}
            </ul>
            {!matches.some((m) => m.type === 'CPF') && (
              <Filter
                label="Motivo para cadastrar separadamente"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Escolha um motivo</option>
                <option value="SHARED_CONTACT">Contato compartilhado</option>
                <option value="CONFIRMED_DISTINCT">Pessoas diferentes confirmadas</option>
              </Filter>
            )}
          </section>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {conflict && (
          <Button variant="secondary" onClick={onReload ?? onClose}>
            Fechar e revisar versão atual (descarta edições)
          </Button>
        )}
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy} disabled={matches?.some((m) => m.type === 'CPF')}>
            Salvar cliente
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function CustomerProfile({
  id,
  current,
  onBack,
  onChanged,
}: {
  id: string;
  current: CurrentUser;
  onBack: () => void;
  onChanged: () => void;
}) {
  const result = useRegistryData(`/customers/${id}`, customerDetailSchema);
  const customer = result.data?.customer;
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<'status' | 'anonymize' | 'marketing' | null>(null);
  const [showCpf, setShowCpf] = useState(false);
  function changed() {
    setEditing(false);
    setAction(null);
    setShowCpf(false);
    result.refresh();
    onChanged();
  }
  return (
    <>
      <Button variant="secondary" onClick={onBack}>
        Voltar para clientes
      </Button>
      <DataStatus {...result} retry={result.refresh} />
      {customer && (
        <>
          <section className="card profile-card">
            <div className="registry-toolbar">
              <div>
                <span className="eyebrow">{customer.registration}</span>
                <h2>{customer.name}</h2>
                <Badge tone={customer.active ? 'success' : 'neutral'}>
                  {customer.anonymizedAt ? 'Anonimizado' : customer.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              {!customer.anonymizedAt && (
                <div className="registry-actions">
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    Editar cliente
                  </Button>
                  {hasPermission(current.user.role, 'customers.manage') && (
                    <Button variant="secondary" onClick={() => setAction('status')}>
                      {customer.active ? 'Desativar cliente' : 'Reativar cliente'}
                    </Button>
                  )}
                  {hasPermission(current.user.role, 'customers.anonymize') && (
                    <Button variant="ghost" onClick={() => setAction('anonymize')}>
                      Anonimizar cliente
                    </Button>
                  )}
                </div>
              )}
            </div>
            <dl className="profile-details">
              <div>
                <dt>Telefone</dt>
                <dd>{formatPhone(customer.phone)}</dd>
              </div>
              {Object.hasOwn(customer, 'email') && (
                <>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{customer.email || 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>Nascimento</dt>
                    <dd>{customer.birthday?.split('-').reverse().join('/') || 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>Endereço / referência</dt>
                    <dd>{customer.address || 'Não informado'}</dd>
                  </div>
                </>
              )}
              {Object.hasOwn(customer, 'cpf') && (
                <>
                  <div>
                    <dt>CPF restrito</dt>
                    <dd>
                      {customer.cpf ? (
                        <>
                          {showCpf ? customer.cpf : `***.***.***-${customer.cpf.slice(-2)}`}{' '}
                          <Button variant="ghost" onClick={() => setShowCpf((v) => !v)}>
                            {showCpf ? 'Ocultar CPF' : 'Mostrar CPF'}
                          </Button>
                        </>
                      ) : (
                        'Não informado'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Observações operacionais</dt>
                    <dd className="plain-text">{customer.notes || 'Não informadas'}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Cadastro</dt>
                <dd>
                  {new Date(customer.createdAt).toLocaleDateString('pt-BR', {
                    timeZone: 'America/Fortaleza',
                  })}{' '}
                  · versão {customer.version}
                </dd>
              </div>
            </dl>
          </section>
          {customer.marketingState && (
            <section className="card profile-card">
              <div className="registry-toolbar">
                <div>
                  <h2>Preferência de marketing</h2>
                  <p>{marketingLabels[customer.marketingState]}</p>
                </div>
                {hasPermission(current.user.role, 'customers.marketing') &&
                  !customer.anonymizedAt && (
                    <Button variant="secondary" onClick={() => setAction('marketing')}>
                      Atualizar preferência
                    </Button>
                  )}
              </div>
              <p className="auth-help">
                Sem envio de mensagens. Telefone, compra, aniversário ou importação não significam
                autorização.
              </p>
              {result.data?.marketingHistory && (
                <ul className="history-list">
                  {result.data.marketingHistory.map((event) => (
                    <li key={event.id}>
                      {marketingLabels[event.previousState]} → {marketingLabels[event.state]} ·{' '}
                      {new Date(event.createdAt).toLocaleString('pt-BR', {
                        timeZone: 'America/Fortaleza',
                      })}
                      <small>
                        Origem: {preferenceSources[event.source] ?? 'Registro histórico'} ·
                        responsável: {event.actor.displayName} · motivo:{' '}
                        {preferenceReasons[event.reason] ?? 'Registro histórico'}
                        {event.evidence ? ` · referência: ${event.evidence}` : ''}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section className="card profile-card">
            <h2>Compras e pagamentos</h2>
            <p>Disponível após a implementação de vendas e pedidos.</p>
            <p className="auth-help">
              Não há totais ou histórico de operações verificados nesta fase.
            </p>
          </section>
          {editing && (
            <CustomerForm
              initial={customer}
              current={current}
              onClose={() => setEditing(false)}
              onSaved={changed}
              onReload={changed}
            />
          )}
          {action && (
            <CustomerAction
              action={action}
              customer={customer}
              onClose={() => setAction(null)}
              onDone={changed}
            />
          )}
        </>
      )}
    </>
  );
}
function CustomerAction({
  action,
  customer,
  onClose,
  onDone,
}: {
  action: 'status' | 'anonymize' | 'marketing';
  customer: CustomerDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState(customer.marketingState ?? 'UNKNOWN');
  const [source, setSource] = useState('IN_PERSON');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title =
    action === 'anonymize'
      ? 'Anonimizar cadastro'
      : action === 'marketing'
        ? 'Atualizar preferência de marketing'
        : customer.active
          ? 'Desativar cadastro'
          : 'Reativar cadastro';
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const marketing = marketingSchema.safeParse({
        version: customer.version,
        state,
        source,
        evidence,
        reason,
      });
      if (action === 'marketing' && !marketing.success) {
        setError(marketing.error.issues[0]?.message ?? 'Revise a preferência informada.');
        return;
      }
      const body =
        action === 'marketing'
          ? marketing.data
          : action === 'anonymize'
            ? { version: customer.version, confirmation, reason }
            : { version: customer.version, active: !customer.active, reason };
      await authRequest(`/customers/${customer.id}/${action}`, successSchema, {
        method: 'POST',
        body,
      });
      onDone();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="auth-form"
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        {action === 'anonymize' ? (
          <>
            <p className="info-note">
              Remove nome, telefone, e-mail, CPF, nascimento, endereço, observações e referências
              pessoais de marketing. Mantém matrícula e referências históricas. A preferência passa
              para “Não aceita”. Este cadastro não poderá ser reativado.
            </p>
            <p>
              Cópias exportadas, telas já entregues e backups anteriores podem conter os dados
              antigos. As prévias de importação pendentes serão descartadas. Não há exclusão
              automática de arquivos de backup.
            </p>
            <Field
              label="Matrícula para confirmar"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              autoComplete="off"
              hint={`Digite ${customer.registration}`}
            />
          </>
        ) : action === 'status' ? (
          <p>
            {customer.active
              ? 'O cadastro sai da seleção ativa; seus dados e referências permanecem.'
              : 'O cadastro volta à seleção ativa. A preferência de marketing não muda.'}
          </p>
        ) : (
          <>
            <Filter
              label="Nova preferência"
              value={state}
              onChange={(e) => setState(marketingStateSchema.parse(e.target.value))}
            >
              {marketingStateSchema.options.map((v) => (
                <option key={v} value={v}>
                  {marketingLabels[v]}
                </option>
              ))}
            </Filter>
            <Filter
              label="Origem da manifestação"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="IN_PERSON">Presencial</option>
              <option value="CUSTOMER_REQUEST">Solicitação do cliente</option>
              <option value="RECORD_REVIEW">Revisão de evidência</option>
            </Filter>
            <Field
              label="Referência da evidência (opcional)"
              maxLength={200}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              hint="Não copie dados pessoais desnecessários. Este registro não representa conformidade legal automática."
            />
          </>
        )}
        <Filter label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Escolha um motivo</option>
          <option value="CUSTOMER_REQUEST">Solicitação do cliente</option>
          {action === 'anonymize' ? (
            <>
              <option value="RETENTION_REVIEW">Revisão de retenção</option>
              <option value="DATA_MINIMIZATION">Minimização de dados</option>
            </>
          ) : action === 'marketing' ? (
            <>
              <option value="CORRECTION">Correção documentada</option>
              <option value="NO_EVIDENCE">Sem evidência de autorização</option>
            </>
          ) : (
            <option value="RECORD_REVIEW">Revisão do cadastro</option>
          )}
        </Filter>
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
            {action === 'anonymize' ? 'Confirmar anonimização' : 'Confirmar alteração'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Database,
  FileBarChart2,
  FlaskConical,
  Home,
  Leaf,
  LockKeyhole,
  Menu,
  Package,
  PanelLeftClose,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  SlidersHorizontal,
  Store,
  Users,
  Wallet,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  APP_VERSION,
  BUSINESS_TIMEZONE,
  formatBusinessDate,
  formatBusinessTime,
  modules,
  type ModuleId,
  type SystemStatus,
  type CurrentUser,
  roleLabels,
} from '@pommier/shared';
import { AccountSettings } from './auth/AccountSettings.js';
import { getSystemStatus, RequestError } from './api.js';
import {
  Badge,
  Button,
  Card,
  DateTime,
  Dialog,
  EmptyState,
  ErrorState,
  Filter,
  Loading,
  Pagination,
  Search,
  Table,
  Toast,
} from './components/ui.js';

const icons: Record<ModuleId, LucideIcon> = {
  overview: Home,
  sales: ShoppingBasket,
  orders: ClipboardList,
  customers: Users,
  products: ShoppingBag,
  production: FlaskConical,
  inventory: Package,
  cash: Wallet,
  reports: FileBarChart2,
  settings: Settings,
};
const dbCopy = {
  ready: 'Banco conectado',
  unavailable: 'Banco indisponível',
  not_configured: 'Banco não configurado',
} as const;

function initialModule(): ModuleId {
  return modules.find((module) => `#${module.id}` === window.location.hash)?.id ?? 'overview';
}

export default function App({
  current,
  onLogout,
  loggingOut,
  onRefreshCurrent,
  onPasswordChanged,
}: {
  current: CurrentUser;
  onLogout: () => void;
  loggingOut: boolean;
  onRefreshCurrent: () => void;
  onPasswordChanged: () => void;
}) {
  const [active, setActive] = useState<ModuleId>(initialModule);
  const [mobileNav, setMobileNav] = useState(false);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<RequestError | null>(null);
  const [toast, setToast] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  async function refresh(notify = false) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const next = await getSystemStatus(controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      setStatus(next);
      setError(null);
      if (notify) setToast('Verificação concluída. Informações atualizadas.');
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) {
        setStatus(null);
        setError(
          cause instanceof RequestError
            ? cause
            : new RequestError('Não foi possível verificar o sistema. Tente novamente.'),
        );
      }
    } finally {
      if (!controller.signal.aborted && mounted.current) setBusy(false);
    }
  }

  function startRefresh(notify = false) {
    setBusy(true);
    setError(null);
    void refresh(notify);
  }

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    void getSystemStatus(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setStatus(next);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof RequestError
              ? cause
              : new RequestError('Não foi possível verificar o sistema. Tente novamente.'),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      mounted.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const hashChange = () => {
      setActive(initialModule());
      setMobileNav(false);
    };
    window.addEventListener('hashchange', hashChange);
    return () => window.removeEventListener('hashchange', hashChange);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!mobileNav) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNav(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [mobileNav]);

  function navigate(id: ModuleId) {
    setActive(id);
    setMobileNav(false);
    window.history.pushState(null, '', `#${id}`);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  const currentModule = modules.find((module) => module.id === active) ?? modules[0];
  const databaseReady = status?.database.status === 'ready';
  const connectionLabel = error
    ? 'Sistema desconectado'
    : busy
      ? 'Verificando conexão'
      : status
        ? dbCopy[status.database.status]
        : 'Conexão não verificada';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      {mobileNav && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`} aria-label="Menu da loja">
        <div className="brand">
          <span className="wordmark">
            Le Pommier<span className="wordmark-period">.</span>
          </span>
          <span className="brand-subtitle">GESTÃO DA LOJA</span>
        </div>
        <Button
          variant="ghost"
          className="mobile-close"
          aria-label="Fechar menu"
          onClick={() => setMobileNav(false)}
        >
          <X size={20} />
        </Button>
        <div className="workspace-label">
          <span className="store-symbol">
            <Store size={17} />
          </span>
          <div>
            <strong>Minha loja</strong>
            <span>Ambiente local</span>
          </div>
          <span className="workspace-dot" aria-hidden="true" />
        </div>
        <p className="nav-label">DIA A DIA</p>
        <nav aria-label="Navegação principal">
          <ul className="nav-list">
            {modules
              .filter((module) => module.id !== 'settings')
              .map((module) => {
                const Icon = icons[module.id];
                return (
                  <li key={module.id}>
                    <button
                      type="button"
                      className={`nav-item ${active === module.id ? 'nav-active' : ''}`}
                      aria-current={active === module.id ? 'page' : undefined}
                      onClick={() => navigate(module.id)}
                    >
                      <Icon size={19} strokeWidth={1.65} aria-hidden="true" />
                      <span>{module.label}</span>
                      {!module.available && <span className="nav-upcoming">Em breve</span>}
                      {active === module.id && (
                        <span className="nav-active-dot" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            className={`nav-item ${active === 'settings' ? 'nav-active' : ''}`}
            aria-current={active === 'settings' ? 'page' : undefined}
            onClick={() => navigate('settings')}
          >
            <Settings size={19} strokeWidth={1.65} />
            <span>Configurações</span>
          </button>
          <div className="sidebar-note">
            <WifiOff size={16} aria-hidden="true" />
            <span>
              Pensado para funcionar
              <br />
              <strong>sem depender da internet.</strong>
            </span>
          </div>
          <span className="sidebar-version">
            VERSÃO {APP_VERSION} <span>·</span> BASE INICIAL
          </span>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-store">Minha loja</span>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{currentModule.label}</span>
          </div>
          <div className="topbar-right">
            <span className="top-date">
              <CalendarDays size={16} aria-hidden="true" />
              {status ? formatBusinessDate(status.businessDate) : 'Data local não verificada'}
            </span>
            <span className="topbar-divider" />
            <Dialog
              title="Sobre esta versão"
              description="Esta é a base inicial do sistema Le Pommier, ainda em desenvolvimento."
              triggerLabel="Sobre esta versão"
              triggerIcon={<CircleHelp size={19} />}
            >
              <p>
                As operações da loja ainda não estão habilitadas. Não há dados de demonstração
                apresentados como registros reais.
              </p>
              <p>
                A identidade visual é provisória. A conexão local é verificada pelo aplicativo;
                conexão com a internet não é necessária para esta verificação.
              </p>
            </Dialog>
            <span className="setup-label">
              <span className="setup-avatar">
                <LockKeyhole size={15} />
              </span>
              <span>
                <strong>{current.user.displayName}</strong>
                <small className="current-role">{roleLabels[current.user.role]}</small>
              </span>
            </span>
            <Button variant="secondary" onClick={onLogout} busy={loggingOut}>
              Sair
            </Button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {active === 'overview'
                  ? 'CUIDADO EM CADA DETALHE'
                  : active === 'settings'
                    ? 'SUA INSTALAÇÃO'
                    : 'EM DESENVOLVIMENTO'}
              </p>
              <h1 ref={headingRef} tabIndex={-1}>
                {currentModule.label}
              </h1>
              <p className="page-description">
                {active === 'overview'
                  ? 'Um lugar para cuidar da rotina e acompanhar sua loja.'
                  : currentModule.description}
              </p>
            </div>
            <div className="page-heading-action">
              {currentModule.available ? (
                <Button variant="secondary" busy={busy} onClick={() => startRefresh(true)}>
                  <RefreshCw size={16} aria-hidden="true" />
                  Verificar conexão
                </Button>
              ) : (
                <Badge tone="warning">Ainda não disponível</Badge>
              )}
            </div>
          </div>

          {error && (
            <ErrorState
              title="Não foi possível conectar ao sistema"
              message={`${error.message}${error.requestId ? ` Código de atendimento: ${error.requestId}.` : ''}`}
              action={
                <Button variant="secondary" onClick={() => startRefresh()} busy={busy}>
                  Tentar novamente
                </Button>
              }
            />
          )}

          {active === 'overview' ? (
            <>
              <section className="welcome-panel" aria-labelledby="welcome-title">
                <div className="welcome-copy">
                  <span className="welcome-kicker">
                    <span aria-hidden="true" />
                    VAMOS COMEÇAR
                  </span>
                  <h2 id="welcome-title">
                    Cada receita tem uma história.
                    <br />
                    Sua gestão começa aqui.
                  </h2>
                  <p>
                    Estamos preparando a base para conectar vendas, pedidos e produção — com clareza
                    para quem cuida da loja.
                  </p>
                  <Button onClick={() => navigate('settings')} variant="primary">
                    Conferir instalação
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                </div>
                <div className="welcome-aside">
                  <div className="welcome-line" />
                  <Leaf size={34} strokeWidth={1} aria-hidden="true" />
                  <blockquote>
                    “Cultivando receitas
                    <br />
                    que viram memórias.”
                  </blockquote>
                  <span>LE POMMIER</span>
                  <div className="welcome-line" />
                </div>
              </section>

              <div className="section-title">
                <div>
                  <h2>O dia da loja</h2>
                  <span>
                    {status
                      ? `Referência: ${formatBusinessDate(status.businessDate)} · Fortaleza`
                      : 'Aguardando a data do sistema local'}
                  </span>
                </div>
                <Badge>Operação ainda não habilitada</Badge>
              </div>
              <div className="metric-grid">
                {[
                  {
                    label: 'Vendas concluídas',
                    icon: ShoppingBasket,
                    detail: 'Após ativação das vendas',
                  },
                  {
                    label: 'Pagamentos recebidos',
                    icon: ArrowDownLeft,
                    detail: 'Após ativação dos pagamentos',
                  },
                  {
                    label: 'Pedidos para retirada',
                    icon: ShoppingBag,
                    detail: 'Após ativação dos pedidos',
                  },
                  { label: 'Situação do caixa', icon: Wallet, detail: 'Após ativação do caixa' },
                ].map(({ label, icon: Icon, detail }) => (
                  <Card className="metric-card" key={label}>
                    <div className="metric-title">
                      <span>{label}</span>
                      <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <div className="metric-value" aria-label="Métrica indisponível">
                      —
                    </div>
                    <span className="metric-footnote">{detail}</span>
                  </Card>
                ))}
              </div>

              <div className="overview-grid">
                <Card className="preparation-card">
                  <div className="card-heading">
                    <div className="card-title-icon">
                      <span>
                        <ClipboardList size={18} />
                      </span>
                      <h2>Primeiros passos</h2>
                    </div>
                    <span className="small-label">PREPARAÇÃO</span>
                  </div>
                  <p className="card-intro">Acompanhe o que falta antes de usar na rotina.</p>
                  <ol className="setup-steps">
                    <li>
                      <span className="step-index step-complete">
                        <Check size={14} />
                      </span>
                      <div>
                        <strong>Preparar a base local</strong>
                        <span>Interface, navegação e conexão com o sistema.</span>
                      </div>
                      <Badge tone="success">Pronto</Badge>
                    </li>
                    <li>
                      <span className={`step-index ${databaseReady ? 'step-complete' : ''}`}>
                        {databaseReady ? <Check size={14} /> : '2'}
                      </span>
                      <div>
                        <strong>Conectar o banco de dados</strong>
                        <span>
                          {status
                            ? dbCopy[status.database.status] + '.'
                            : 'Verifique a conexão desta instalação.'}
                        </span>
                      </div>
                      {databaseReady ? (
                        <Badge tone="success">Conectado</Badge>
                      ) : (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => navigate('settings')}
                        >
                          Conferir
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </li>
                    <li>
                      <span className="step-index">3</span>
                      <div>
                        <strong>Acesso individual configurado</strong>
                        <span>Sua conta está autenticada no sistema local.</span>
                      </div>
                      <Badge tone="success">Pronto</Badge>
                    </li>
                    <li>
                      <span className="step-index">4</span>
                      <div>
                        <strong>Cadastrar produtos e estoque inicial</strong>
                        <span>Disponível após os módulos de cadastro e estoque.</span>
                      </div>
                      <LockKeyhole
                        size={15}
                        className="muted-icon"
                        aria-label="Ainda não disponível"
                      />
                    </li>
                  </ol>
                </Card>
                <Card className="activity-card">
                  <div className="card-heading">
                    <div className="card-title-icon">
                      <span>
                        <Clock3 size={18} />
                      </span>
                      <h2>Movimentações do dia</h2>
                    </div>
                  </div>
                  <EmptyState
                    title="Sua rotina aparecerá aqui"
                    description="Vendas, retiradas e produção serão exibidas quando os módulos estiverem disponíveis."
                    icon={<Store size={28} strokeWidth={1.2} />}
                  />
                  <div className="activity-note">
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>Nenhuma operação de loja foi registrada.</span>
                  </div>
                </Card>
              </div>

              <div className="bottom-note">
                <span>
                  <LockKeyhole size={14} aria-hidden="true" />
                  Seus dados ficam no computador da loja.
                </span>
                <span>Operações indisponíveis nesta versão inicial.</span>
              </div>
            </>
          ) : active === 'settings' ? (
            <>
              <AccountSettings
                current={current}
                onRefreshCurrent={onRefreshCurrent}
                onPasswordChanged={onPasswordChanged}
              />
              <SettingsPage status={status} busy={busy} connectionLabel={connectionLabel} />
            </>
          ) : (
            <UnavailablePage module={currentModule} onSettings={() => navigate('settings')} />
          )}

          <footer className="page-footer">
            <span>
              Le Pommier <span>·</span> Gestão feita com cuidado
            </span>
            <span className="connection-status">
              <span
                className={`status-dot ${databaseReady && !error ? 'status-dot-ready' : 'status-dot-warning'}`}
                aria-hidden="true"
              />
              {connectionLabel}
              {status && !busy && (
                <span className="last-check">
                  · {formatBusinessTime(status.database.checkedAt)}
                </span>
              )}
            </span>
          </footer>
        </main>
      </div>
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}

function SettingsPage({
  status,
  busy,
  connectionLabel,
}: {
  status: SystemStatus | null;
  busy: boolean;
  connectionLabel: string;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const filtered = modules.filter(
    (module) =>
      module.label.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) &&
      (filter === 'all' || (filter === 'available' ? module.available : !module.available)),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 5));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * 5, safePage * 5);
  return (
    <div className="settings-layout">
      <Card className="connection-card">
        <div className="card-heading">
          <div className="card-title-icon">
            <span>
              <Database size={19} />
            </span>
            <h2>Conexão desta instalação</h2>
          </div>
          <Badge tone={status?.database.status === 'ready' ? 'success' : 'warning'}>
            {busy ? 'Verificando' : connectionLabel}
          </Badge>
        </div>
        <p className="card-intro">A interface se comunica com o aplicativo neste computador.</p>
        {busy ? (
          <Loading label="Verificando o sistema local…" />
        ) : (
          <dl className="system-details">
            <div>
              <dt>Aplicativo local</dt>
              <dd>{status ? 'Conectado' : 'Não verificado'}</dd>
            </div>
            <div>
              <dt>Banco de dados</dt>
              <dd>{status ? dbCopy[status.database.status] : 'Não verificado'}</dd>
            </div>
            <div>
              <dt>Última verificação</dt>
              <dd>
                {status ? <DateTime value={status.database.checkedAt} /> : 'Ainda não disponível'}
              </dd>
            </div>
            <div>
              <dt>Fuso da loja</dt>
              <dd>{BUSINESS_TIMEZONE}</dd>
            </div>
            <div>
              <dt>Versão</dt>
              <dd>{APP_VERSION} · Base inicial</dd>
            </div>
          </dl>
        )}
        <div className="info-note">
          <ShieldCheck size={19} aria-hidden="true" />
          <p>
            Mesmo com o banco conectado, os cadastros e as operações da loja dependem das próximas
            etapas de implementação.
          </p>
        </div>
        {status?.database.status !== 'ready' && (
          <div className="install-guidance">
            <h3>Como continuar a instalação</h3>
            <p>
              Peça ao responsável pela instalação para configurar e iniciar o banco local conforme o
              guia do projeto. Depois, use “Verificar conexão”.
            </p>
          </div>
        )}
      </Card>
      <Card className="system-guidance">
        <Leaf size={25} strokeWidth={1.4} />
        <h2>Local por princípio</h2>
        <p>
          A base foi preparada para manter a rotina no computador da loja, sem serviços externos
          para as operações.
        </p>
        <ul>
          <li>
            <Check size={15} />
            Fontes e recursos locais
          </li>
          <li>
            <Check size={15} />
            Nenhum envio automático
          </li>
          <li>
            <Check size={15} />
            Data da loja em Fortaleza
          </li>
        </ul>
        <div className="info-note">
          <p>O computador precisa estar ligado e acordado para que o sistema fique disponível.</p>
        </div>
      </Card>
      <Card className="module-card">
        <div className="card-heading">
          <div className="card-title-icon">
            <span>
              <SlidersHorizontal size={18} />
            </span>
            <h2>Disponibilidade dos módulos</h2>
          </div>
          <span className="small-label">IMPLEMENTAÇÃO POR ETAPAS</span>
        </div>
        <div className="table-toolbar">
          <Search
            label="Buscar módulo"
            placeholder="Buscar módulo…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <Filter
            label="Disponibilidade"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="available">Base disponível</option>
            <option value="planned">Em desenvolvimento</option>
          </Filter>
        </div>
        {rows.length ? (
          <Table
            caption="Disponibilidade dos módulos"
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'module', label: 'Módulo', render: (row) => <strong>{row.label}</strong> },
              { key: 'phase', label: 'Etapa', render: (row) => `Fase ${row.phase}` },
              {
                key: 'status',
                label: 'Disponibilidade',
                render: (row) => (
                  <Badge tone={row.available ? 'success' : 'neutral'}>
                    {row.available ? 'Base disponível' : 'Ainda não disponível'}
                  </Badge>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState
            title="Nenhum módulo encontrado"
            description="Tente outro termo ou altere o filtro de disponibilidade."
          />
        )}
        <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
      </Card>
    </div>
  );
}

function UnavailablePage({
  module,
  onSettings,
}: {
  module: (typeof modules)[number];
  onSettings: () => void;
}) {
  const Icon = icons[module.id];
  return (
    <Card className="unavailable-card">
      <EmptyState
        title={`${module.label} ainda não está disponível`}
        description={module.description}
        icon={<Icon size={32} strokeWidth={1.3} />}
        action={
          <Button variant="secondary" onClick={onSettings}>
            Acompanhar a instalação
            <ArrowRight size={16} />
          </Button>
        }
      />
      <div className="unavailable-detail">
        <PanelLeftClose size={18} aria-hidden="true" />
        <p>Previsto para a fase {module.phase}. Esta versão não registra operações neste módulo.</p>
      </div>
    </Card>
  );
}

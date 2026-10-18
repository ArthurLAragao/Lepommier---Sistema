import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
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
  hasPermission,
} from '@pommier/shared';
import Customers from './registry/Customers.js';
import Catalog from './registry/Catalog.js';
import Inventory from './inventory/Inventory.js';
import Production from './inventory/Production.js';
import Orders from './sales/Orders.js';
import Cash from './cash/Cash.js';
import Reports from './reports/Reports.js';
import Dashboard from './reports/Dashboard.js';
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
  return (
    modules.find((module) => `#${module.id}` === window.location.hash.split('?')[0])?.id ??
    'overview'
  );
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
  const [route, setRoute] = useState(window.location.hash);
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
      setRoute(window.location.hash);
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
              .filter(
                (module) =>
                  module.id !== 'settings' &&
                  (module.id !== 'customers' ||
                    hasPermission(current.user.role, 'customers.read')) &&
                  (module.id !== 'production' ||
                    hasPermission(current.user.role, 'production.manage')) &&
                  (!['sales', 'orders'].includes(module.id) ||
                    hasPermission(current.user.role, 'orders.read')) &&
                  (module.id !== 'cash' || hasPermission(current.user.role, 'cash.current')) &&
                  (module.id !== 'reports' ||
                    hasPermission(current.user.role, 'reports.financial') ||
                    hasPermission(current.user.role, 'reports.stock')),
              )
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
                Clientes, catálogo, produção e estoque de produtos prontos estão disponíveis
                conforme seu perfil. Vendas, pedidos e pagamentos manuais também estão disponíveis;
                caixa tem apenas abertura/vínculo, sem encerramento ou reconciliação. Não há dados
                fictícios apresentados como registros reais.
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
                  : active === 'customers' || active === 'products'
                    ? 'CADASTROS DA LOJA'
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

          {active === 'customers' ? (
            hasPermission(current.user.role, 'customers.read') ? (
              <Customers current={current} />
            ) : (
              <EmptyState
                title="Acesso restrito"
                description="Seu perfil não tem acesso ao cadastro de clientes."
              />
            )
          ) : active === 'products' ? (
            <Catalog current={current} />
          ) : active === 'sales' || active === 'orders' ? (
            hasPermission(current.user.role, 'orders.read') ? (
              <Orders current={current} sales={active === 'sales'} />
            ) : (
              <EmptyState
                title="Acesso restrito"
                description="Seu perfil não acessa vendas, pedidos ou pagamentos."
              />
            )
          ) : active === 'cash' ? (
            hasPermission(current.user.role, 'cash.current') ? (
              <Cash current={current} />
            ) : (
              <EmptyState
                title="Acesso restrito"
                description="Seu perfil não tem acesso ao caixa ou informações financeiras."
              />
            )
          ) : active === 'inventory' ? (
            <Inventory current={current} />
          ) : active === 'production' ? (
            hasPermission(current.user.role, 'production.manage') ? (
              <Production current={current} />
            ) : (
              <EmptyState
                title="Acesso restrito"
                description="Seu perfil não administra produção."
              />
            )
          ) : active === 'overview' ? (
            <Dashboard current={current} today={status?.businessDate ?? null} />
          ) : active === 'reports' ? (
            <Reports key={route} current={current} today={status?.businessDate ?? null} />
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
            Clientes, catálogo, produção, estoque, vendas e pedidos estão disponíveis conforme seu
            perfil. Pagamentos são confirmados manualmente. Caixa permite movimentos e fechamento
            contado, conciliação das fontes e revisão. Relatórios operacionais e painel do
            proprietário estão disponíveis conforme o perfil. Restauração verificada, instalação e
            piloto ainda dependem das próximas fases.
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

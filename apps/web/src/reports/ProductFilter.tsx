import { useState } from 'react';
import { reportProductOptions, type ReportProductOption } from '@pommier/shared';
import { useRegistryData } from '../registry/data.js';
import { Filter, Search, Pagination, Loading, ErrorState, Button } from '../components/ui.js';
export function ReportProductFilter({
  value,
  onChange,
}: {
  value: ReportProductOption | null;
  onChange: (p: ReportProductOption | null) => void;
}) {
  const [q, setQ] = useState(''),
    [page, setPage] = useState(1);
  const result = useRegistryData(
    '/reports/product-options?' + new URLSearchParams({ q, page: String(page) }),
    reportProductOptions,
  );
  const options = result.data?.items ?? [];
  return (
    <fieldset className="category-picker">
      <legend>Produto do histórico</legend>
      <Search
        label="Buscar produto nos relatórios"
        maxLength={80}
        placeholder="Nome ou código, incluindo históricos inativos"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <Filter
        label="Produto do histórico"
        value={value?.id ?? ''}
        onChange={(e) =>
          onChange(
            options.find((p) => p.id === e.target.value) ??
              (value?.id === e.target.value ? value : null),
          )
        }
      >
        <option value="">Todos os produtos</option>
        {value && !options.some((p) => p.id === value.id) && (
          <option value={value.id}>
            {value.code} · {value.name}
          </option>
        )}
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} · {p.name}
            {p.active ? '' : ' (inativo)'}
          </option>
        ))}
      </Filter>
      {result.busy && <Loading label="Buscando identidades de produtos." />}
      {result.error && (
        <ErrorState
          title="Filtro indisponível"
          message={result.error}
          action={<Button onClick={result.refresh}>Tentar novamente</Button>}
        />
      )}
      {result.data && result.data.total > 20 && (
        <Pagination page={page} pageCount={Math.ceil(result.data.total / 20)} onChange={setPage} />
      )}
    </fieldset>
  );
}

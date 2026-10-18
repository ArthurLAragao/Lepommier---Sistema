import { reportPreset } from '@pommier/shared';
import { useState, type FormEvent } from 'react';
import { Button, Field } from '../components/ui.js';
import { getSystemStatus } from '../api.js';
export function PeriodControls({
  today,
  from,
  to,
  onChange,
}: {
  today: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [start, setStart] = useState(from),
    [end, setEnd] = useState(to);
  const [serverToday, setServerToday] = useState(today),
    [resolving, setResolving] = useState(false),
    [error, setError] = useState('');
  async function preset(id: 'today' | 'yesterday' | 'seven' | 'month') {
    setResolving(true);
    setError('');
    try {
      const status = await getSystemStatus();
      setServerToday(status.businessDate);
      const q = reportPreset(status.businessDate, id);
      setStart(q.from);
      setEnd(q.to);
      onChange(q.from, q.to);
    } catch {
      setError('Não foi possível confirmar a data atual da loja. Tente o atalho novamente.');
    } finally {
      setResolving(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    onChange(start, end);
  }
  return (
    <section className="report-period" aria-label="Período do relatório">
      <div className="report-presets" aria-label="Atalhos de período">
        {(
          [
            ['today', 'Hoje'],
            ['yesterday', 'Ontem'],
            ['seven', 'Últimos 7 dias'],
            ['month', 'Este mês'],
          ] as const
        ).map(([id, label]) => (
          <Button key={id} variant="secondary" disabled={resolving} onClick={() => void preset(id)}>
            {label}
          </Button>
        ))}
      </div>
      <form className="report-dates" onSubmit={submit}>
        <Field
          label="Data inicial (Fortaleza)"
          type="date"
          value={start}
          min="2000-01-01"
          max={serverToday > today ? serverToday : today}
          required
          onChange={(e) => setStart(e.target.value)}
        />
        <Field
          label="Data final (Fortaleza)"
          type="date"
          value={end}
          min="2000-01-01"
          max={serverToday > today ? serverToday : today}
          required
          onChange={(e) => setEnd(e.target.value)}
        />
        <Button type="submit">Aplicar período</Button>
      </form>
      {resolving && <p role="status">Confirmando a data da loja.</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p>
        America/Fortaleza · Datas inclusivas · Últimos 7 dias inclui hoje. Máximo de 366 dias, até
        hoje.
      </p>
    </section>
  );
}

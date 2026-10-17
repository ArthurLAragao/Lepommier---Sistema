import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  importFields,
  importLabels,
  importPreviewSchema,
  importResultSchema,
  importJobSchema,
  importPreviewInput,
  csvDownloadSchema,
  type ImportPreview,
  type importChoiceSchema,
} from '@pommier/shared';
import { Modal } from '../auth/AccountSettings.js';
import { authRequest, AuthError, successSchema } from '../auth/api.js';
import { Button, Field, Filter, Table } from '../components/ui.js';
import { downloadCsv, errorMessage } from './data.js';

const inspectionSchema = z.object({
  headers: z.array(z.string()),
  count: z.number(),
  sample: z.array(z.array(z.string())),
});
type Choice = z.infer<typeof importChoiceSchema>;
export function ImportWizard({ onClose }: { onClose: () => void }) {
  const [csv, setCsv] = useState('');
  const [delimiter, setDelimiter] = useState<',' | ';'>(';');
  const [inspection, setInspection] = useState<z.infer<typeof inspectionSchema> | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [submitted, setSubmitted] = useState<Choice[] | null>(null);
  const [result, setResult] = useState<z.infer<typeof importResultSchema> | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const jobId = preview?.id;
  function discard(message: string) {
    setPreview(null);
    setCsv('');
    setInspection(null);
    setMapping({});
    setChoices([]);
    setSubmitted(null);
    setReviewed(false);
    setError(message);
  }
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    const check = () => {
      void authRequest(`/customer-imports/${jobId}`, importJobSchema, { signal: controller.signal })
        .then((job) => {
          if (controller.signal.aborted) return;
          if (job.status === 'COMPLETED' && job.result) {
            setResult(job.result);
            setPreview(null);
            setChoices([]);
          } else if (job.status !== 'PENDING')
            discard(
              'Esta revisão foi descartada ou expirou. Selecione o arquivo novamente; nenhuma criação será repetida automaticamente.',
            );
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(cause));
        });
    };
    const timer = window.setInterval(check, 10000);
    window.addEventListener('focus', check);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [jobId]);
  async function selectFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setInspection(null);
    setMapping({});
    try {
      if (file.size > 262144) throw new Error('Selecione um CSV de até 256 KiB.');
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        throw new Error(
          'O arquivo não está em UTF-8 válido. Exporte como CSV UTF-8 e tente novamente.',
        );
      }
      const inspected = await authRequest('/customer-imports/inspect', inspectionSchema, {
        method: 'POST',
        body: { csv: text, delimiter },
      });
      setCsv(text);
      setInspection(inspected);
    } catch (cause) {
      setCsv('');
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function makePreview() {
    setError('');
    const parsed = importPreviewInput.safeParse({ csv, delimiter, mapping });
    if (!parsed.success) {
      setError('Escolha uma coluna para o nome e mapeie cada coluna uma única vez.');
      return;
    }
    setBusy(true);
    try {
      const next = await authRequest('/customer-imports/preview', importPreviewSchema, {
        method: 'POST',
        body: parsed.data,
      });
      setPreview(next);
      setChoices(
        next.rows.map((row) => ({
          row: row.row,
          action: row.errors.length || row.duplicates.length ? 'SKIP' : 'CREATE',
        })),
      );
      setCsv('');
      setInspection(null);
      setMapping({});
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || busy || !reviewed) return;
    setBusy(true);
    setError('');
    const fixed = submitted ?? choices.map((c) => ({ ...c }));
    setSubmitted(fixed);
    try {
      const next = await authRequest(
        `/customer-imports/${preview.id}/confirm`,
        importResultSchema,
        { method: 'POST', body: { reviewToken: preview.reviewToken, choices: fixed } },
      );
      setResult(next);
      setPreview(null);
      setChoices([]);
    } catch (cause) {
      setError(errorMessage(cause));
      if (
        cause instanceof AuthError &&
        ['IMPORT_ROW_REVIEW', 'IMPORT_DUPLICATE_REVIEW', 'IMPORT_CHOICES_INVALID'].includes(
          cause.code,
        )
      )
        setSubmitted(null);
    } finally {
      setBusy(false);
    }
  }
  async function checkResult() {
    if (!preview) return;
    setBusy(true);
    try {
      const next = await authRequest(`/customer-imports/${preview.id}`, importJobSchema);
      if (next.result) {
        setResult(next.result);
        setPreview(null);
        setChoices([]);
      } else if (next.status !== 'PENDING')
        discard('Prévia descartada. Selecione o arquivo e revise novamente.');
      else
        setError(
          'Confirmação ainda pendente. Você pode repetir as mesmas escolhas; a importação não será duplicada.',
        );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (busy) return;
    if (!preview) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await authRequest(`/customer-imports/${preview.id}/cancel`, successSchema, {
        method: 'POST',
        body: {},
      });
      onClose();
    } catch (cause) {
      setError(
        `${errorMessage(cause)} Se fechar apenas a tela, a prévia temporária expira em até 15 minutos.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function template() {
    setBusy(true);
    setError('');
    try {
      const file = await authRequest('/customer-imports/template', csvDownloadSchema);
      downloadCsv(file.csv, 'le-pommier-modelo-clientes.csv');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Importar clientes por CSV"
      onClose={() => {
        void close();
      }}
    >
      <div className="import-wizard auth-form">
        <p>
          Criação ou descarte por linha, sem atualizar ou mesclar cadastros existentes. Preferência
          de marketing sempre começa como “Não informado”.
        </p>
        {!preview && !result && (
          <>
            <div className="registry-actions">
              <Button
                variant="secondary"
                busy={busy}
                onClick={() => {
                  void template();
                }}
              >
                Baixar modelo CSV
              </Button>
            </div>
            <p className="auth-help">
              UTF-8 com ou sem BOM; até 256 KiB, 100 linhas de dados, 20 colunas. Aspas, aspas
              escapadas e quebras de linha dentro de campos são aceitas. Sem arquivos Excel.
            </p>
            <Filter
              label="Delimitador do arquivo"
              value={delimiter}
              disabled={busy}
              onChange={(e) => {
                setDelimiter(e.target.value === ',' ? ',' : ';');
                setCsv('');
                setInspection(null);
                setMapping({});
              }}
            >
              <option value=";">Ponto e vírgula (;)</option>
              <option value=",">Vírgula (,)</option>
            </Filter>
            <Field
              label="Arquivo CSV UTF-8"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                void selectFile(file);
              }}
            />
            {inspection && (
              <>
                <h3>Mapear colunas · {inspection.count} linhas</h3>
                <p>
                  Nenhum campo é mapeado automaticamente. Escolha explicitamente as colunas. Colunas
                  não selecionadas serão ignoradas.
                </p>
                <div className="form-grid">
                  {importFields.map((field) => (
                    <Filter
                      key={field}
                      label={`${importLabels[field]}${field === 'name' ? ' (obrigatório)' : ' (opcional)'}`}
                      value={mapping[field] ?? ''}
                      onChange={(e) =>
                        setMapping((previous) => {
                          const next = { ...previous };
                          if (e.target.value) next[field] = e.target.value;
                          else delete next[field];
                          return next;
                        })
                      }
                    >
                      <option value="">
                        {field === 'name' ? 'Escolha a coluna de nome' : 'Não importar'}
                      </option>
                      {inspection.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </Filter>
                  ))}
                </div>
                <Table
                  caption="Amostra original do CSV"
                  columns={inspection.headers.map((header, i) => ({
                    key: String(i),
                    label: header,
                    render: (row: { cells: string[] }) => row.cells[i],
                  }))}
                  rows={inspection.sample.map((cells, index) => ({ cells, index }))}
                  rowKey={(row) => String(row.index)}
                />
                <Button
                  busy={busy}
                  onClick={() => {
                    void makePreview();
                  }}
                >
                  Gerar prévia para revisão
                </Button>
              </>
            )}
          </>
        )}
        {preview && (
          <>
            <h3>Revisar linhas antes de importar</h3>
            <p>
              Prévia válida até{' '}
              {new Date(preview.expiresAt).toLocaleTimeString('pt-BR', {
                timeZone: 'America/Fortaleza',
              })}
              . Em reinício, expiração ou anonimização, é necessário revisar novamente.
            </p>
            <Table
              caption="Revisão da importação"
              rows={preview.rows}
              rowKey={(row) => String(row.row)}
              columns={[
                { key: 'row', label: 'Linha de dados', render: (row) => row.row },
                {
                  key: 'values',
                  label: 'Original → normalizado',
                  render: (row) => (
                    <details>
                      <summary>{row.customer?.name ?? 'Linha inválida'}</summary>
                      {Object.entries(row.original).map(([field, value]) => (
                        <p key={field} className="plain-text">
                          {importLabels[field as (typeof importFields)[number]]}: {value} →{' '}
                          {row.customer
                            ? String(row.customer[field as keyof typeof row.customer] ?? 'vazio')
                            : 'corrigir'}
                        </p>
                      ))}
                    </details>
                  ),
                },
                {
                  key: 'review',
                  label: 'Erros e possíveis duplicidades',
                  render: (row) => (
                    <>
                      {row.errors.map((value, i) => (
                        <p key={i} className="field-error">
                          {value}
                        </p>
                      ))}
                      {row.duplicates.map((dup, i) => (
                        <p key={i}>
                          {dup.type === 'NAME' ? 'Nome semelhante' : dup.type} ·{' '}
                          {dup.row ? `linha ${dup.row}` : dup.registration}
                        </p>
                      ))}
                      {!row.errors.length && !row.duplicates.length && 'Pronta para revisão'}
                    </>
                  ),
                },
                {
                  key: 'decision',
                  label: 'Escolha explícita',
                  render: (row) => {
                    const choice = choices.find((c) => c.row === row.row)!;
                    return (
                      <>
                        <Filter
                          label={`Decisão linha ${row.row}`}
                          value={choice.action}
                          disabled={busy || Boolean(submitted)}
                          onChange={(e) =>
                            setChoices((previous) =>
                              previous.map((c) =>
                                c.row === row.row
                                  ? {
                                      row: c.row,
                                      action: e.target.value === 'CREATE' ? 'CREATE' : 'SKIP',
                                    }
                                  : c,
                              ),
                            )
                          }
                        >
                          <option value="SKIP">Ignorar</option>
                          <option
                            value="CREATE"
                            disabled={Boolean(
                              row.errors.length || row.duplicates.some((d) => d.type === 'CPF'),
                            )}
                          >
                            Criar novo cadastro
                          </option>
                        </Filter>
                        {choice.action === 'CREATE' && row.duplicates.length > 0 && (
                          <Filter
                            label={`Motivo linha ${row.row}`}
                            value={choice.reason ?? ''}
                            disabled={busy || Boolean(submitted)}
                            onChange={(e) =>
                              setChoices((previous) =>
                                previous.map((c) =>
                                  c.row === row.row
                                    ? {
                                        ...c,
                                        ...(e.target.value
                                          ? {
                                              reason:
                                                e.target.value === 'SHARED_CONTACT'
                                                  ? ('SHARED_CONTACT' as const)
                                                  : ('CONFIRMED_DISTINCT' as const),
                                            }
                                          : { reason: undefined }),
                                      }
                                    : c,
                                ),
                              )
                            }
                          >
                            <option value="">Escolha um motivo</option>
                            <option value="SHARED_CONTACT">Contato compartilhado</option>
                            <option value="CONFIRMED_DISTINCT">
                              Pessoas distintas confirmadas
                            </option>
                          </Filter>
                        )}
                      </>
                    );
                  },
                },
              ]}
            />
            <p>
              {choices.filter((c) => c.action === 'CREATE').length} para criar ·{' '}
              {choices.filter((c) => c.action === 'SKIP').length} para ignorar. Erro em qualquer
              criação cancela todas as criações desta confirmação.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
                disabled={busy || Boolean(submitted)}
              />{' '}
              Revisei as linhas, os avisos e as escolhas. Nenhum registro existente será atualizado.
            </label>
            <div className="form-actions">
              <Button
                variant="secondary"
                busy={busy}
                onClick={() => {
                  void checkResult();
                }}
              >
                Conferir resultado
              </Button>
              <Button
                busy={busy}
                disabled={!reviewed}
                onClick={() => {
                  void confirm();
                }}
              >
                {submitted ? 'Repetir mesma confirmação' : 'Confirmar importação'}
              </Button>
            </div>
          </>
        )}
        {result && (
          <section role="status">
            <h3>Importação concluída</h3>
            <p>
              {result.created} cadastros criados · {result.skipped} linhas ignoradas.
            </p>
            <ul>
              {result.rows.map((row) => (
                <li key={row.row}>
                  Linha {row.row}:{' '}
                  {row.status === 'CREATED' ? `criado ${row.registration}` : 'ignorada'}
                </li>
              ))}
            </ul>
            <p>
              Nenhuma permissão de marketing foi inferida. Nenhum cadastro existente foi
              sobrescrito.
            </p>
          </section>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void close();
            }}
          >
            {result ? 'Concluir' : 'Cancelar e fechar'}
          </Button>
          {error && preview && (
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Fechar apenas esta tela
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

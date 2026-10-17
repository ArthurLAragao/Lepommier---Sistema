import { useId, type TextareaHTMLAttributes } from 'react';
import { Button, ErrorState, Loading } from '../components/ui.js';

export function DataStatus({
  busy,
  error,
  retry,
}: {
  busy: boolean;
  error: string;
  retry: () => void;
}) {
  return (
    <>
      {busy && <Loading label="Carregando cadastros." />}
      {error && (
        <ErrorState
          title="Não foi possível carregar"
          message={error}
          action={
            <Button variant="secondary" onClick={retry}>
              Tentar novamente
            </Button>
          }
        />
      )}
    </>
  );
}
export function TextArea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={3} {...props} />
    </div>
  );
}

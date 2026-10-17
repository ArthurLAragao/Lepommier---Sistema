import { useState } from 'react';
import { parseMoney, paymentInput, type paymentMethod } from '@pommier/shared';
import type { z } from 'zod';
export const orderNumber = (number: number) => `PED-${String(number).padStart(6, '0')}`;
export const moneyInput = (value: string) =>
  `${BigInt(value) / 100n},${String(BigInt(value) % 100n).padStart(2, '0')}`;
export function usePaymentFields() {
  const [method, setMethod] = useState<z.infer<typeof paymentMethod>>('CASH');
  const [tender, setTender] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return {
    method,
    setMethod,
    tender,
    setTender,
    confirmed,
    setConfirmed,
    value: (amountCents: string) =>
      paymentInput.parse({
        amountCents,
        method,
        manuallyConfirmed: confirmed,
        ...(method === 'CASH' ? { tenderedCents: String(parseMoney(tender)) } : {}),
      }),
  };
}

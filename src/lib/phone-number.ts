/** Normalize supported Pakistani mobile formats without truncating +92 numbers. */
export function normalizePakistanPhone(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(4);
  else if (digits.startsWith('92')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^3\d{9}$/.test(digits) ? `+92${digits}` : null;
}

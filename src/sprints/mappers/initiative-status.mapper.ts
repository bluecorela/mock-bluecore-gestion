export function calculateInitiativeStatus(
  startDate: string,
  endDate: string,
  progress: number,
  storedStatus?: unknown,
): string {
  if (storedStatus === 'completed' || storedStatus === 'cancelled') {
    return storedStatus;
  }
  if (progress >= 100) return 'completed';

  const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`).getTime();
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`).getTime();
  const today = new Date();
  const current = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  if (current > end) return 'at_risk';

  const duration = Math.max(end - start, 1);
  const elapsed = Math.min(Math.max(current - start, 0), duration);
  const difference = (elapsed / duration) * 100 - progress;

  if (difference > 15) return 'at_risk';
  if (difference > 5) return 'requires_attention';
  return 'in_progress';
}

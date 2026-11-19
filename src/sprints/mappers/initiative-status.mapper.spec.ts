import { calculateInitiativeStatus } from './initiative-status.mapper';

describe('calculateInitiativeStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-14T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks an initiative as completed when progress reaches 100 percent', () => {
    expect(calculateInitiativeStatus('2026-09-01', '2026-09-30', 100)).toBe(
      'completed',
    );
  });

  it('preserves a cancelled initiative even when dates or progress suggest another status', () => {
    expect(
      calculateInitiativeStatus('2026-08-01', '2026-08-31', 100, 'cancelled'),
    ).toBe('cancelled');
  });

  it('preserves a completed initiative even when its dates suggest risk', () => {
    expect(
      calculateInitiativeStatus('2026-08-01', '2026-08-31', 80, 'completed'),
    ).toBe('completed');
  });

  it('marks an overdue initiative as at risk', () => {
    expect(calculateInitiativeStatus('2026-08-01', '2026-08-31', 80)).toBe(
      'at_risk',
    );
  });

  it('marks an initiative as requiring attention when delay exceeds five percent', () => {
    expect(calculateInitiativeStatus('2026-09-01', '2026-09-21', 55)).toBe(
      'requires_attention',
    );
  });
});

import { describe, expect, it } from 'vitest';
import type { SensorIdentity } from '@/shared/identity';
import { toPopupView } from '@/entrypoints/popup/status';

const identity: SensorIdentity = {
  token: 'raw-token-123',
  id: 's1',
  name: 'Camille Roy',
  email: 'camille@hanabi.test',
  linkedAt: 0,
};

describe('toPopupView', () => {
  it('prompts to configure when no sensor is linked', () => {
    const view = toPopupView(false, null);
    expect(view.action).toBe('configure');
    expect(view.active).toBe(false);
    expect(view.statusLabel).toBe('Capteur non lié');
  });

  it('shows active capture + a disable action when linked and consented', () => {
    const view = toPopupView(true, identity);
    expect(view.action).toBe('toggle-off');
    expect(view.active).toBe(true);
    expect(view.detailLabel).toContain('Camille Roy');
    expect(view.statusLabel).toBe('Capture activée');
  });

  it('shows paused capture + an enable action when linked but opted out', () => {
    const view = toPopupView(false, identity);
    expect(view.action).toBe('toggle-on');
    expect(view.active).toBe(false);
    expect(view.detailLabel).toContain('Camille Roy');
    expect(view.statusLabel).toBe('Capture en pause');
  });
});

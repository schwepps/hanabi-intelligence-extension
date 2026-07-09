// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountOnboarding, type OnboardingDeps } from '@/entrypoints/onboarding/view';
import type { SensorProfile } from '@/shared/sensor-api';

const profile: SensorProfile = {
  id: 's1',
  name: 'Camille Roy',
  email: 'camille@hanabi.test',
  consented_at: null,
};

const FIXTURE = `
  <form id="hb-form-section">
    <input id="hb-token" />
    <button id="hb-verify" type="button"></button>
    <p id="hb-verify-status"></p>
    <p id="hb-identity" hidden></p>
    <div id="hb-consent-section" hidden>
      <input id="hb-consent-check" type="checkbox" />
      <button id="hb-activate" type="submit" disabled></button>
      <p id="hb-activate-status"></p>
    </div>
  </form>
  <div id="hb-success" hidden></div>`;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function setup(overrides: Partial<OnboardingDeps> = {}) {
  document.body.innerHTML = FIXTURE;
  const deps: OnboardingDeps = {
    fetchSensorProfile: vi.fn(async () => profile),
    recordSensorConsent: vi.fn(async () => '2026-07-09T00:00:00Z'),
    linkSensor: vi.fn(async () => {}),
    grantConsent: vi.fn(async () => {}),
    ...overrides,
  };
  mountOnboarding(document, deps);
  return deps;
}

describe('onboarding view', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('reveals identity + consent after a valid token is verified', async () => {
    setup();
    el<HTMLInputElement>('hb-token').value = 'valid-token-xyz';
    el('hb-verify').dispatchEvent(new Event('click'));
    await tick();

    expect(el('hb-identity').hidden).toBe(false);
    expect(el('hb-identity').textContent).toContain('Camille Roy');
    expect(el('hb-consent-section').hidden).toBe(false);
  });

  it('records consent, links the sensor and shows success on activate', async () => {
    const deps = setup();
    el<HTMLInputElement>('hb-token').value = 'valid-token-xyz';
    el('hb-verify').dispatchEvent(new Event('click'));
    await tick();

    const check = el<HTMLInputElement>('hb-consent-check');
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    expect(el<HTMLButtonElement>('hb-activate').disabled).toBe(false);

    el('hb-form-section').dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();

    expect(deps.recordSensorConsent).toHaveBeenCalledWith('valid-token-xyz');
    expect(deps.linkSensor).toHaveBeenCalledWith('valid-token-xyz', profile);
    expect(deps.grantConsent).toHaveBeenCalledTimes(1);
    expect(el('hb-success').hidden).toBe(false);
    expect(el('hb-form-section').hidden).toBe(true);
  });

  it('invalidates a prior verification when the token field is edited', async () => {
    setup();
    el<HTMLInputElement>('hb-token').value = 'valid-token-xyz';
    el('hb-verify').dispatchEvent(new Event('click'));
    await tick();
    expect(el('hb-consent-section').hidden).toBe(false);

    el<HTMLInputElement>('hb-token').value = 'valid-token-xyz-edited';
    el('hb-token').dispatchEvent(new Event('input'));

    expect(el('hb-consent-section').hidden).toBe(true);
    expect(el('hb-identity').hidden).toBe(true);
  });

  it('shows an error and keeps consent hidden for an invalid token', async () => {
    setup({ fetchSensorProfile: vi.fn(async () => null) });
    el<HTMLInputElement>('hb-token').value = 'valid-token-xyz';
    el('hb-verify').dispatchEvent(new Event('click'));
    await tick();

    expect(el('hb-verify-status').textContent).toMatch(/invalide/i);
    expect(el('hb-consent-section').hidden).toBe(true);
  });
});

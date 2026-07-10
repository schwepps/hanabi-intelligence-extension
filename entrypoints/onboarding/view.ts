/**
 * Onboarding behaviour. The static copy/structure lives in `index.html`; this wires the
 * interactive flow: paste token → verify against the backend (show the sensor's identity) → consent →
 * record consent server-side + store the identity + flip the local consent flag → success. Deps are
 * injected (defaults = the real modules) so the flow is unit-testable against a DOM fixture.
 */
import { grantConsent } from '@/shared/consent';
import { linkSensor, normalizeToken } from '@/shared/identity';
import { fetchSensorProfile, recordSensorConsent, type SensorProfile } from '@/shared/sensor-api';

export interface OnboardingDeps {
  fetchSensorProfile: typeof fetchSensorProfile;
  recordSensorConsent: typeof recordSensorConsent;
  linkSensor: typeof linkSensor;
  grantConsent: typeof grantConsent;
}

const defaultDeps: OnboardingDeps = {
  fetchSensorProfile,
  recordSensorConsent,
  linkSensor,
  grantConsent,
};

export function mountOnboarding(
  root: ParentNode = document,
  deps: OnboardingDeps = defaultDeps,
): void {
  const form = root.querySelector<HTMLFormElement>('#hb-form-section');
  const tokenInput = root.querySelector<HTMLInputElement>('#hb-token');
  const verifyBtn = root.querySelector<HTMLButtonElement>('#hb-verify');
  const verifyStatus = root.querySelector<HTMLParagraphElement>('#hb-verify-status');
  const identity = root.querySelector<HTMLParagraphElement>('#hb-identity');
  const consentSection = root.querySelector<HTMLElement>('#hb-consent-section');
  const consentCheck = root.querySelector<HTMLInputElement>('#hb-consent-check');
  const activateBtn = root.querySelector<HTMLButtonElement>('#hb-activate');
  const activateStatus = root.querySelector<HTMLParagraphElement>('#hb-activate-status');
  const success = root.querySelector<HTMLElement>('#hb-success');
  if (
    !form ||
    !tokenInput ||
    !verifyBtn ||
    !verifyStatus ||
    !identity ||
    !consentSection ||
    !consentCheck ||
    !activateBtn ||
    !activateStatus ||
    !success
  ) {
    return;
  }

  let verifiedToken: string | null = null;
  let verifiedProfile: SensorProfile | null = null;

  const resetVerified = (): void => {
    verifiedToken = null;
    verifiedProfile = null;
    identity.hidden = true;
    consentSection.hidden = true;
    consentCheck.checked = false;
    activateBtn.disabled = true;
  };

  const verify = async (): Promise<void> => {
    verifyStatus.textContent = '';
    const token = normalizeToken(tokenInput.value);
    if (token == null) {
      resetVerified();
      verifyStatus.textContent = 'Jeton invalide : collez le jeton fourni par Hanabi.';
      return;
    }
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Vérification…';
    // Lock the field for the round trip: editing it mid-flight could otherwise commit this token's
    // identity while the box shows a different token (the input-listener guard below only fires once
    // a verification has completed).
    tokenInput.disabled = true;
    try {
      const profile = await deps.fetchSensorProfile(token);
      if (profile == null) {
        resetVerified();
        verifyStatus.textContent = 'Jeton invalide. Vérifiez-le auprès de Hanabi.';
        return;
      }
      verifiedToken = token;
      verifiedProfile = profile;
      identity.textContent = `Vous êtes lié en tant que ${profile.name} (${profile.email}).`;
      identity.hidden = false;
      consentSection.hidden = false;
    } catch {
      resetVerified();
      verifyStatus.textContent = 'Impossible de contacter le serveur Hanabi. Réessayez.';
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Vérifier';
      tokenInput.disabled = false;
    }
  };

  const activate = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (verifiedToken == null || verifiedProfile == null || !consentCheck.checked) return;
    activateStatus.textContent = '';
    activateBtn.disabled = true;
    activateBtn.textContent = 'Activation…';
    try {
      await deps.recordSensorConsent(verifiedToken);
      await deps.linkSensor(verifiedToken, verifiedProfile);
      await deps.grantConsent();
      form.hidden = true;
      success.hidden = false;
    } catch {
      activateStatus.textContent = "Échec de l'activation. Réessayez.";
      activateBtn.disabled = false;
      activateBtn.textContent = 'Activer la capture';
    }
  };

  verifyBtn.addEventListener('click', () => void verify());
  // Editing the token after a successful verify invalidates it — never activate a stale identity
  // that no longer matches the field.
  tokenInput.addEventListener('input', () => {
    if (verifiedToken !== null) resetVerified();
    verifyStatus.textContent = '';
  });
  consentCheck.addEventListener('change', () => {
    activateBtn.disabled = !consentCheck.checked;
  });
  form.addEventListener('submit', (event) => void activate(event));
}

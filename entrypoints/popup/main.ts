import '@/assets/tokens.css';
import './style.css';
import { consentGranted, grantConsent, revokeConsent } from '@/shared/consent';
import { sensorIdentity } from '@/shared/identity';
import { toPopupView, type PopupAction } from './status';

function openOnboarding(): void {
  void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
  window.close();
}

async function runAction(action: PopupAction): Promise<void> {
  if (action === 'configure') return openOnboarding();
  if (action === 'toggle-on') await grantConsent();
  else await revokeConsent();
  await render();
}

async function render(): Promise<void> {
  const [granted, identity] = await Promise.all([
    consentGranted.getValue(),
    sensorIdentity.getValue(),
  ]);
  const view = toPopupView(granted, identity);

  const dot = document.querySelector<HTMLElement>('#hb-dot');
  const status = document.querySelector<HTMLElement>('#hb-status');
  const detail = document.querySelector<HTMLElement>('#hb-detail');
  const action = document.querySelector<HTMLButtonElement>('#hb-action');
  if (!dot || !status || !detail || !action) return;

  dot.classList.toggle('hb-dot-on', view.active);
  status.textContent = view.statusLabel;
  detail.textContent = view.detailLabel;
  action.textContent = view.actionLabel;
  action.onclick = () => void runAction(view.action);
}

document.querySelector<HTMLButtonElement>('#hb-review')?.addEventListener('click', openOnboarding);
void render();

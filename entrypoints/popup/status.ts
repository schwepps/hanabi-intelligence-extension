/**
 * Pure popup view-model (FSC-111). Maps the two persisted facts — consent flag + linked identity —
 * to what the toolbar popup shows and which action its button takes. Kept pure so the state logic is
 * unit-tested without a DOM.
 */
import type { SensorIdentity } from '@/shared/identity';

export type PopupAction = 'toggle-off' | 'toggle-on' | 'configure';

export interface PopupView {
  /** Drives the status dot (green when capturing). */
  active: boolean;
  statusLabel: string;
  detailLabel: string;
  actionLabel: string;
  action: PopupAction;
}

export function toPopupView(granted: boolean, identity: SensorIdentity | null): PopupView {
  if (identity == null) {
    return {
      active: false,
      statusLabel: 'Capteur non lié',
      detailLabel: 'Configurez votre capteur pour démarrer la capture.',
      actionLabel: 'Configurer le capteur',
      action: 'configure',
    };
  }
  if (granted) {
    return {
      active: true,
      statusLabel: 'Capture activée',
      detailLabel: `Lié en tant que ${identity.name}`,
      actionLabel: 'Désactiver la capture',
      action: 'toggle-off',
    };
  }
  return {
    active: false,
    statusLabel: 'Capture en pause',
    detailLabel: `Lié en tant que ${identity.name}`,
    actionLabel: 'Activer la capture',
    action: 'toggle-on',
  };
}

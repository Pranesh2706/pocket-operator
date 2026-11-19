// The phone action: hand off to an installed Maps app with a standard Android geo: intent,
// fall back to an HTTPS Google Maps link in the browser, and report which one happened.
// No location permission is needed: we only pass the restaurant's catalogue coordinates.
import { Linking } from 'react-native';
import type { ActionStatus, DeviceAction } from './types';

export type MapsOutcome = 'maps_opened' | 'browser_fallback_opened' | 'could_not_open_directions';

export function geoUri(a: DeviceAction): string {
  const ll = `${a.latitude},${a.longitude}`;
  return `geo:${ll}?q=${ll}(${encodeURIComponent(a.label)})`;
}

export function httpsFallback(a: DeviceAction): string {
  return `https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`;
}

/** Validate coordinates before building any URL (they come from our server, but never trust blindly). */
function valid(a: DeviceAction): boolean {
  return (
    a?.type === 'open_maps' &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude) &&
    Math.abs(a.latitude) <= 90 &&
    Math.abs(a.longitude) <= 180
  );
}

export async function openDirections(a: DeviceAction): Promise<{ outcome: MapsOutcome; status: ActionStatus; detail?: string }> {
  const name = a?.label ?? 'the restaurant';
  if (!valid(a)) {
    return { outcome: 'could_not_open_directions', status: { kind: 'could_not_open_directions', text: 'Could not open directions: invalid destination.' }, detail: 'invalid coordinates' };
  }
  try {
    // RN rejects openURL when no activity can handle the intent (ActivityNotFoundException).
    await Linking.openURL(geoUri(a));
    return {
      outcome: 'maps_opened',
      status: { kind: 'maps_opened', text: `Maps opened for ${name}. (Handoff only; navigation is not verified.)` },
    };
  } catch {
    try {
      await Linking.openURL(httpsFallback(a));
      return {
        outcome: 'browser_fallback_opened',
        status: { kind: 'browser_fallback_opened', text: `No Maps app found, so the browser fallback opened for ${name}.` },
        detail: 'no geo: handler',
      };
    } catch {
      return {
        outcome: 'could_not_open_directions',
        status: { kind: 'could_not_open_directions', text: 'Could not open directions: no Maps app or browser is available.' },
        detail: 'no geo: or https handler',
      };
    }
  }
}

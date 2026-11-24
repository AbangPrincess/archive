import type { Place } from './types';

/** Device position. Only called when the person taps a location button. */
export function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location isn’t available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(new Error(geoMessage(err))), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    });
  });
}

function geoMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) return 'Location permission is off. You can turn it on in your browser settings.';
  if (err.code === err.TIMEOUT) return 'Finding your location took too long. Please try again.';
  return 'Your location couldn’t be found right now.';
}

/**
 * Turns coordinates into a short place name using OpenStreetMap's free
 * Nominatim service (no key, no account). Falls back to coordinates.
 */
export async function placeFromCoords(lat: number, lng: number): Promise<Place> {
  const fallback: Place = { name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng };
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}&accept-language=${encodeURIComponent(navigator.language || 'en')}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { name?: string; address?: Record<string, string> };
    const a = data.address ?? {};
    const first = data.name || a.amenity || a.shop || a.tourism || a.leisure || a.building || a.road || a.neighbourhood || a.suburb;
    const area = a.city || a.town || a.village || a.municipality || a.suburb || a.county || a.state;
    const name = [first, area].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
    return name ? { name, lat, lng } : fallback;
  } catch {
    return fallback;
  }
}

export async function locateMe(): Promise<Place> {
  const pos = await currentPosition();
  return placeFromCoords(pos.coords.latitude, pos.coords.longitude);
}

/**
 * The motivation photos are stored in `user_settings.motivation_photo` as a
 * JSON array of local uris. For backward-compatibility a bare single-uri string
 * (from the earlier single-photo version) is treated as a one-element list.
 */
export function parsePhotos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u) : [];
    } catch {
      return [];
    }
  }
  // Legacy single uri.
  return [s];
}

export function serializePhotos(uris: string[]): string {
  return JSON.stringify(uris.filter((u) => !!u));
}

/** Pick a random photo from the list, or '' when there are none. */
export function randomPhoto(uris: string[]): string {
  if (uris.length === 0) return '';
  return uris[Math.floor(Math.random() * uris.length)]!;
}

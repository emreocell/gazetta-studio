/**
 * The English name of a language code, as the admin's UI shows it
 * ("fr" → "French"). Falls back to the code when the runtime has no
 * name for it.
 */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

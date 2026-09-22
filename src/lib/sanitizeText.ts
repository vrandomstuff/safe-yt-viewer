// Strips invisible format/control characters (zero-width spaces, joiners,
// bidi controls, C0/C1 controls) that can't be represented in WIN1252 clients.
const INVISIBLE =
	/[\p{Cf}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F]/gu;

export function sanitizeText(input: string): string {
	return input.replace(INVISIBLE, "");
}

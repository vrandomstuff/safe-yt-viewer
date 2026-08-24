"use client";

export function parseCookieString(cookieString: string) {
	const returnValue: Record<string, string> = {};
	const elements = cookieString.split(";");
	for (const element of elements) {
		const kv = element.split("=");
		let key = kv[0];
		if (key[0] == " ") {
			key = key.replace(" ", "");
		}
		kv.splice(0, 1);
		const value = kv.join("=");
		returnValue[key] = value;
	}
	return returnValue;
}

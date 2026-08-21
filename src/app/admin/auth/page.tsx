"use client";

import { useRouter } from "next/navigation";
import { logIn, startSecureAuth } from "./actions";

export async function digestMessage(message: string): Promise<string> {
	// thank you mdn
	const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
	const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8); // hash the message
	const hashArray = new Uint8Array(hashBuffer);
	const hashHex = Array.from(hashArray, (b) =>
		b.toString(16).padStart(2, "0")
	).join("");
	return hashHex;
}

export default function Page() {
	const router = useRouter();
	return (
		<>
			<input type="password" id="secretInput" />
			<button
				onClick={async () => {
					const statusMessage = document.getElementById(
						"statusMessage"
					) as HTMLDivElement;
					const element = document.getElementById(
						"secretInput"
					) as HTMLInputElement;
					if (window.isSecureContext) {
						const id = window.crypto.randomUUID();
						const salt = await startSecureAuth(id);
						const hash = await digestMessage(salt + element.value);
						const success = await logIn(hash, true, id);
						if (success) {
							router.push("/admin");
						} else {
							statusMessage.innerText = "Invalid password.";
						}
					} else {
						console.log(
							"This is not a secure context so we are sending the raw secret"
						);
						const success = await logIn(element.value, false, null); // not a secure context so this is the raw has and we are telling the server that it is not hashed
						if (success) {
							router.push("/admin");
						} else {
							statusMessage.innerText = "Invalid password.";
						}
					}
				}}
			>
				Sign in
			</button>
			<div id="statusMessage" />
		</>
	);
}

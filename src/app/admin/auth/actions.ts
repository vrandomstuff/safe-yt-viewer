"use server";

import { tokens } from "@/db/schema";
import { db } from "@/instrumentation";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";

const secureAuthStore: Record<string, string> = {};

export async function digestMessage(message: string): Promise<string> {
	return createHash("sha256").update(message).digest("hex");
}
export async function startSecureAuth(id: string): Promise<string> {
	const salt = randomBytes(16).toString("hex");
	secureAuthStore[id] = salt;
	return salt;
}
export async function redirectIfNotAuthed() {
	const cookieStore = await cookies();
	const tokenCookie = cookieStore.get("token");
	if (tokenCookie === undefined) {
		redirect("/admin/auth");
	}
	const tokenDbEntry = await db
		.select()
		.from(tokens)
		.where(eq(tokens.token, tokenCookie.value));
	if (tokenDbEntry.length != 1) {
		redirect("/admin/auth");
	}
}
export async function logIn(
	secret: string,
	secure: boolean,
	id: string | null,
): Promise<boolean> {
	if (process.env.SHARED_ADMIN_SECRET === undefined) {
		throw new Error("SHARED_ADMIN_SECRET not found.");
	}
	if (secure && id != null) {
		const expected = await digestMessage(
			secureAuthStore[id] + process.env.SHARED_ADMIN_SECRET,
		);
		delete secureAuthStore[id];
		if (secret === expected) {
			const cookieStore = await cookies();
			const token = randomBytes(16).toString("hex");
			const entry: typeof tokens.$inferInsert = {
				token: token,
			};
			await db.insert(tokens).values(entry);
			cookieStore.set("token", token, { maxAge: 60 * 60 * 24 });
			return true;
		} else return false;
	} else {
		if (secret === process.env.SHARED_ADMIN_SECRET) {
			const cookieStore = await cookies();
			const token = randomBytes(16).toString("hex");
			const entry: typeof tokens.$inferInsert = {
				token: token,
			};
			await db.insert(tokens).values(entry);
			cookieStore.set("token", token, { maxAge: 60 * 60 * 24 });
			return true;
		} else return false;
	}
}

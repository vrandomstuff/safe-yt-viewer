import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { tokens } from "./db/schema";

export const db = drizzle(process.env.DATABASE_URL!);

export async function register() {
	console.log("Checking .env for required values");
	if (process.env.SHARED_ADMIN_SECRET === undefined) {
		throw new Error("SHARED_ADMIN_SECRET not found.");
	}
	if (process.env.DATABASE_URL === undefined) {
		throw new Error("DATABASE_URL not found.");
	}
	console.log("POST Passed"); // POST means Power On Self Test so this is right here
	await db.delete(tokens);
	setInterval(
		async () => {
			await db.delete(tokens);
		},
		1000 * 60 * 60 * 24
	);
}

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';

export const db = drizzle(process.env.DATABASE_URL!);

export function register() {
	console.log("Checking .env for required values")
	if(process.env.SHARED_ADMIN_SECRET === undefined) {
		throw new Error("SHARED_ADMIN_SECRET not found.")
	}
	if(process.env.DATABASE_URL === undefined) {
		throw new Error("DATABASE_URL not found.")
	}
}

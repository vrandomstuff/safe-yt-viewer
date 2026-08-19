import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Page() {
	const cookieStore = await cookies()

	if(cookieStore.get("secret") !== process.env.SHARED_ADMIN_SECRET) {
		redirect("/admin/auth")
	}
	return (
		<>
		<button onClick={() => redirect("/admin/manageWhitelist")}>Manage whitelist</button>
		</>
	)
}

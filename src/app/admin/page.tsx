import Link from "next/link";
import { redirectIfNotAuthed } from "./auth/actions";

export default async function Page() {
	await redirectIfNotAuthed();
	return (
		<>
			<Link
				style={{
					backgroundColor: "gray",
				}}
				href="/admin/manageWhitelist"
			>
				Manage whitelist
			</Link>
		</>
	);
}

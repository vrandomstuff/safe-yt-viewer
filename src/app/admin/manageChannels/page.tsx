import { channels } from "@/db/schema";
import { db } from "@/instrumentation";
import { redirectIfNotAuthed } from "@/app/admin/auth/actions";
import { AddToChannelsForm, RemoveFromChannelsButton } from "./channelControls";
import { eq } from "drizzle-orm";

export default async function Page() {
	await redirectIfNotAuthed();
	const rows = await db
		.select()
		.from(channels)
		.where(eq(channels.fullyAllowed, true));

	return (
		<>
			<AddToChannelsForm />
			<ul
				style={{ display: "flex", flexDirection: "column", gap: "5px" }}
			>
				{rows.map((row) => (
					<li key={row.handle}>
						<a href={`/channel/${row.channelId}`}>
							<img
								style={{
									width: "100px",
									height: "100px",
									backgroundColor: "transparent",
									borderRadius: "50px"
								}}
								alt={row.name}
								src={row.avatarUrl}
								title={row.name}
							/>
							<h2>{row.name}</h2>
						</a>
						<RemoveFromChannelsButton handle={row.handle} />
					</li>
				))}
			</ul>
		</>
	);
}

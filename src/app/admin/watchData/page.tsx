import { watchData } from "@/db/schema";
import { db } from "@/instrumentation";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { redirectIfNotAuthed } from "../auth/actions";

const containerStyle = {
	padding: "20px 40px",
	maxWidth: "1200px",
	margin: "0 auto"
};

const linkStyle = {
	textDecoration: "none",
	color: "#666"
};

const headingStyle = {
	marginBottom: "10px"
};

const tableStyle = {
	width: "100%",
	borderCollapse: "collapse" as const,
	fontSize: "14px"
};

const thStyle = {
	textAlign: "left" as const,
	padding: "10px 12px",
	borderBottom: "2px solid #ccc",
	fontWeight: "bold" as const
};

const tdStyle = {
	padding: "8px 12px",
	borderBottom: "1px solid #ddd"
};

const videoLinkStyle = {
	color: "#0066cc",
	textDecoration: "none"
};

const dateStyle = {
	whiteSpace: "nowrap" as const,
	color: "#888",
	fontSize: "13px"
};

export default async function Page() {
	await redirectIfNotAuthed();
	const data = await db
		.select()
		.from(watchData)
		.orderBy(desc(watchData.eventDate));
	return (
		<div style={containerStyle}>
			<table style={tableStyle}>
				<thead>
					<tr>
						<th scope="col" style={thStyle}>
							Title
						</th>
						<th scope="col" style={thStyle}>
							Video ID
						</th>
						<th scope="col" style={thStyle}>
							Date
						</th>
					</tr>
				</thead>
				<tbody>
					{data.map((e) => {
						return (
							<tr key={e.eventDate.toISOString()}>
								<td style={{ ...tdStyle, fontWeight: "bold" }}>
									{e.title}
								</td>
								<td style={tdStyle}>
									<Link
										href={`/watch/${e.videoId}`}
										style={videoLinkStyle}
									>
										{e.videoId}
									</Link>
								</td>
								<td style={{ ...tdStyle, ...dateStyle }}>
									{e.eventDate.toString()}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

import { channels, videoCache } from "@/db/schema";
import { db } from "@/instrumentation";
import { eq } from "drizzle-orm";

type videoType = {
	videoId: string;
};
export async function Video({ videoId }: videoType) {
	const videoRow = await db
		.select()
		.from(videoCache)
		.where(eq(videoCache.videoId, videoId));
	if (videoRow.length !== 1) {
		throw new Error("Failed to get video.");
	}
	const video = videoRow[0];
	const channelRow = await db
		.select()
		.from(channels)
		.where(eq(channels.channelId, video.uploaderId));
	if (channelRow.length === 0) {
		throw new Error("Failed to get channel somehow.");
	}
	const channel = channelRow[0];
	return (
		<div
			key={video.videoId}
			style={{
				display: "flex",
				flexDirection: "row",
				width: "fit-content",
				padding: "5px",
				borderRadius: "20px",
				backgroundColor: "#424242",
				border: "5px solid #292828"
			}}
		>
			<a href={`/watch/${video.videoId}`}>
				<img
					src={video.thumbnailURL}
					alt={`Thumbnail for the video: ${video.title}`}
					crossOrigin="anonymous"
					style={{
						borderRadius: "15px",
						maxWidth: "90vw",
						height: "auto"
					}}
				/>
				<br />
				<h2 style={{ fontFamily: "var(--font-lato)" }}>
					{video.title}
				</h2>
			</a>
			<a href={`/channel/${channel.channelId}`}>
				<img
					style={{
						width: "50px",
						height: "50px",
						backgroundColor: "transparent",
						borderRadius: "50px"
					}}
					alt={channel.name}
					src={channel.avatarUrl}
					title={channel.name}
				/>
			</a>
			<br />
		</div>
	);
}

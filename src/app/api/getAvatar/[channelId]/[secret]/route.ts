import { getChannelAvatar } from "@/lib/channel";
import "dotenv/config";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ channelId: string; secret: string }> },
) {
	const { channelId, secret } = await params;

	if (
		!process.env.SHARED_ADMIN_SECRET ||
		secret !== process.env.SHARED_ADMIN_SECRET
	) {
		return Response.json({ error: "no perms" });
	}
	const maybeAvatar = await getChannelAvatar(channelId);
	if (maybeAvatar == null) {
		return Response.json({ error: "unable to find avatar" });
	} else {
		return Response.json({ url: maybeAvatar });
	}
}

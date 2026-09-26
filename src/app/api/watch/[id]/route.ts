import { recordWatch, type WatchRecordReason } from "@/lib/videoManager";
import "dotenv/config";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type"
};

const statusForReason: Record<WatchRecordReason | "ok", number> = {
	ok: 200,
	invalid_request: 400,
	not_cached: 403,
	error: 500
};

export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id } = await params;

	const result = await recordWatch(id);
	if (!result.ok) {
		return Response.json(
			{ error: result.reason },
			{
				status: statusForReason[result.reason] ?? 500,
				headers: corsHeaders
			}
		);
	}

	return Response.json({ status: "recorded" }, { headers: corsHeaders });
}

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: corsHeaders });
}

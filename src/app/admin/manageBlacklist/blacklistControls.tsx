"use client";
import { addToBlacklist, removeFromBlacklist } from "@/lib/blacklistManager";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RemoveFromBlacklistButton({ videoId }: { videoId: string }) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	return (
		<button
			disabled={pending}
			onClick={async () => {
				setPending(true);
				await removeFromBlacklist(videoId);
				router.refresh();
				setPending(false);
			}}
		>
			Remove
		</button>
	);
}

export function AddToBlacklistForm() {
	const router = useRouter();
	const [videoId, setVideoId] = useState("");
	return (
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				if (videoId.length === 0 || videoId.length > 11) {
					return;
				}
				await addToBlacklist(videoId);
				setVideoId("");
				router.refresh();
			}}
		>
			<input
				value={videoId}
				maxLength={11}
				onChange={(event) => setVideoId(event.target.value)}
			/>
			<button type="submit">Add</button>
		</form>
	);
}

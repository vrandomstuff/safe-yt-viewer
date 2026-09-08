"use client";
import { addChannel, removeChannel } from "@/lib/channelManager";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RemoveFromChannelsButton({ handle }: { handle: string }) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	return (
		<button
			disabled={pending}
			onClick={async () => {
				setPending(true);
				await removeChannel(handle);
				router.refresh();
				setPending(false);
			}}
		>
			Remove
		</button>
	);
}

export function AddToChannelsForm() {
	const router = useRouter();
	const [handle, setHandle] = useState("");
	return (
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				if (handle.length === 0 || handle.length > 11) {
					return;
				}
				await addChannel(handle);
				setHandle("");
				router.refresh();
			}}
		>
			<input
				value={handle}
				maxLength={11}
				onChange={(event) => setHandle(event.target.value)}
			/>
			<button type="submit">Add</button>
		</form>
	);
}

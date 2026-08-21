"use client";
import Link from "next/link";
import { redirectIfNotAuthed } from "@/app/admin/auth/actions";
import { useEffect } from "react";
import { reCache } from "@/app/api/reCache/[id]/[secret]/route";

export default function Page() {
	useEffect(() => {
		async function doasyncsincereactisdumb() {
			await redirectIfNotAuthed();
		}
		doasyncsincereactisdumb();
	}, []);
	return (
		<>
			<Link
				style={{
					backgroundColor: "gray"
				}}
				href="/admin/manageWhitelist"
			>
				Manage whitelist
			</Link>
			<button
				onClick={async () => {
					reCache("all");
				}}
			>
				reCache all videos
			</button>
		</>
	);
}

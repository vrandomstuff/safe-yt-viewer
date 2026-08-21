"use client";
import Link from "next/link";
import { redirectIfNotAuthed } from "./auth/actions";
import { useEffect } from "react";

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
		</>
	);
}

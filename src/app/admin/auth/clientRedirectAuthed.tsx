"use client";

import { useEffect } from "react";
import { redirectIfNotAuthed } from "./actions";

export function useRedirectIfNotAuthed() {
	useEffect(() => {
		async function doasyncsincereactisdumb() {
			await redirectIfNotAuthed();
		}
		doasyncsincereactisdumb();
	}, []);
}

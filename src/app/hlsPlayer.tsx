"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface HLSPlayerProps {
	src: string;
}

export default function HLSPlayer({ src }: HLSPlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const video = videoRef.current;

		if (!video) return;

		// Safari has native HLS support. A googlevideo URL is only good for a
		// few hours, and a stale one comes back 403, which fails the element
		// instead of surfacing through hls.js — so the same recovery happens by
		// hand: reload the master playlist, which is the only thing that mints
		// fresh tokens. Capped, since a 403 that is not an expiry (geo-block,
		// missing PO token) would otherwise loop, and it does restart playback
		// from the beginning.
		if (video.canPlayType("application/vnd.apple.mpegurl")) {
			const maxRecoveries = 2;
			let recoveries = 0;

			const load = () => {
				// Assigning the same src again is a no-op in some browsers, so
				// the attribute is dropped first to force a fresh resource
				// selection. An empty src puts the element in NETWORK_EMPTY
				// without firing an error, so this cannot re-enter onError.
				video.removeAttribute("src");
				video.src = src;
				video.load();
			};

			const onError = () => {
				// The element reports no status code, so a 403 is
				// indistinguishable from any other network failure here. Only
				// those are worth a retry; a decode error or an unplayable
				// source would fail again the same way.
				if (video.error?.code === 2 && recoveries < maxRecoveries) {
					recoveries++;
					console.warn("HLS source expired, reloading the playlist.");
					load();
					return;
				}
				console.error("Native HLS playback failed:", video.error);
			};

			video.addEventListener("error", onError);
			load();

			return () => {
				video.removeEventListener("error", onError);
			};
		}

		// Chrome, Firefox, Edge, etc.
		if (Hls.isSupported()) {
			// A googlevideo URL is only good for a few hours, and once it is
			// stale the proxy answers 403. hls.js retries 5xx but never 4xx, so
			// an expired token would otherwise kill playback outright; the
			// master playlist is what mints fresh ones, so refetch it. The
			// instance is rebuilt because a 403 leaves hls.js in a fatal state,
			// and the retries are capped because a 403 that is not an expiry
			// (geo-block, missing PO token) would otherwise loop forever.
			const maxRecoveries = 2;
			let recoveries = 0;
			let hls: Hls | null = null;

			const attach = () => {
				hls = new Hls();

				hls.on(Hls.Events.ERROR, (_, data) => {
					if (
						data.response?.code === 403 &&
						recoveries < maxRecoveries
					) {
						recoveries++;
						console.warn(
							"HLS source expired, reloading the playlist."
						);
						hls?.destroy();
						attach();
						return;
					}
					console.error("HLS error:", data);
				});

				hls.loadSource(src);
				hls.attachMedia(video);
			};

			attach();
			video.play();

			return () => {
				hls?.destroy();
			};
		}
		console.error("HLS is not supported by this browser");
	}, [src]);

	return (
		<video
			ref={videoRef}
			controls
			playsInline
			autoPlay
			style={{
				width: "100vw",
				height: "100vh"
			}}
		/>
	);
}

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

		// Safari has native HLS support
		if (video.canPlayType("application/vnd.apple.mpegurl")) {
			video.src = src;
			return;
		}

		// Chrome, Firefox, Edge, etc.
		if (Hls.isSupported()) {
			const hls = new Hls();

			hls.loadSource(src);
			hls.attachMedia(video);

			hls.on(Hls.Events.ERROR, (_, data) => {
				console.error("HLS error:", data);
			});

			video.play();

			return () => {
				hls.destroy();
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

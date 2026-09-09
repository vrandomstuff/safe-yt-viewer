import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Safe YT",
		short_name: "Safe YT",
		description: "A safe, whitelisted YouTube video viewer",
		start_url: "/",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#ffffff",
		icons: [
			{
				src: "/apple-touch-icon.png",
				sizes: "180x180",
				type: "image/png"
			}
		]
	};
}

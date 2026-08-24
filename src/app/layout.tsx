import type { Metadata } from "next";
import { Geist, Geist_Mono, Lato } from "next/font/google";
import "@/app/globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"]
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"]
});

const lato = Lato({
	variable: "--font-lato",
	subsets: ["latin"],
	weight: "400"
});

export const metadata: Metadata = {
	title: "Safe YT",
	icons: {
		icon: "/apple-touch-icon.png",
		apple: "/apple-touch-icon.png"
	},
	other: {
		"apple-mobile-web-app-capable": "yes",
		"apple-mobile-web-app-title": "Safe YT"
	}
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="en"
			className={`${geistSans.variable} ${geistMono.variable} ${lato.variable}`}
		>
			<body>{children}</body>
		</html>
	);
}

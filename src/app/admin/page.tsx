"use client";
import Link from "next/link";
import { useState } from "react";
import { reCache } from "@/app/api/reCache/[id]/[secret]/route";
import { parseCookieString } from "@/lib/parseCookie";

const links = [
	{ href: "/admin/manageWhitelist", label: "Manage whitelist" },
	{ href: "/admin/manageBlacklist", label: "Manage blacklist" },
	{ href: "/admin/manageChannels", label: "Manage channels" },
	{ href: "/admin/watchData", label: "Watch data" }
];

const buttonStyle = {
	backgroundColor: "gray",
	color: "white",
	border: "none",
	padding: "20px 40px",
	fontSize: "18px",
	borderRadius: "8px",
	cursor: "pointer",
	textAlign: "center" as const,
	textDecoration: "none" as const
};

export default function Page() {
	const [recaching, setRecaching] = useState(false);
	return (
		<div
			style={{
				height: "100vh",
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			}}
		>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(2, 1fr)",
					gap: "15px"
				}}
			>
				{links.map((l) => (
					<Link key={l.href} style={buttonStyle} href={l.href}>
						{l.label}
					</Link>
				))}
				<button
					style={buttonStyle}
					disabled={recaching}
					onClick={async () => {
						setRecaching(true);
						const cookies = parseCookieString(document.cookie);

						const token = cookies["token"];
						console.log(token);
						console.log(cookies);
						if (token == undefined) {
							return;
						}
						reCache("all", token);
					}}
				>
					{recaching ? "reCache started" : "reCache all videos"}
				</button>
			</div>
		</div>
	);
}

import Link from "next/link";

export default function Home() {
	return (
		<Link href="/">
			<img
				src="/home_icon.png"
				alt="Go home."
				style={{ width: 48, height: 48 }}
			/>
		</Link>
	);
}

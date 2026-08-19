"use client"

import { useRouter } from "next/navigation"

type searchQuery = {
	query: string
}

export default function SearchBar({ query }: searchQuery) {
	const router = useRouter()

	return (
		<div style={{ display: "flex", alignItems: "center" }}>
			<input defaultValue={query} placeholder="Search query" id="searchBar" style= {{
				height: "50px",
				fontSize: 30,
				width: "50vw"
			}} onKeyDown={(e) => {
				if (e.key === "Enter") {
					const value = (e.target as HTMLInputElement).value
					if(value === "") {
						router.push('/')
					} else {
						router.push(`/search/${encodeURIComponent(value)}`)
					}
				}
			}}/>
			<button onClick={() => {
				const value = (document.getElementById("searchBar") as HTMLInputElement).value
				if(value === "") {
					router.push('/')
				} else {
					router.push(`/search/${encodeURIComponent(value)}`)
				}
			}} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
				<img src="/search.png" alt="Search" style={{ height: "50px" }} />
			</button>
		</div>
	)
}

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	{
		rules: {
			"@next/next/no-img-element": "off",
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["../*", "../**"],
							message:
								"Use the @/* alias instead of relative parent imports."
						}
					]
				}
			]
		}
	},
	// Override default ignores of eslint-config-next.
	globalIgnores([
		// Default ignores of eslint-config-next:
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts"
	])
]);

export default eslintConfig;

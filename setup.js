/* Copyright (C) 2026 vtf6259
 *
 * This program is free software: you can redistribute it and/or modify
 * It under the terms of the GNU Affero General Public License as
 * Published by the Free Software Foundation, either version 3 of the
 * License.
 *
 * This program is distributed in the hope that it will be useful,
 * But WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * Along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Terminal utilites since we dont have npm packages since this is a setup script that is ran before the rest of the repo is accessible on this machine
const readline = require("readline");
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

function input(prompt) {
	return new Promise((resolve) => rl.question(prompt, resolve));
}

function showNotif(text) {
	process.stdout.write(`\x1b]9;${text}\x07`);
}
function setTitle(text) {
	process.stdout.write(`\x1b]0;${text}\x07`);
}
function reset() {
	process.stdout.write("\x1bc");
}

// Real program
var step = 0;
var maxSteps = 10;
function nextStep() {
	step = step + 1;
	if (step >= maxSteps) throw new Error("nextStep went past maxSteps");
	setTitle(`step ${step}/${maxSteps} safe-yt setup script`);
}
var database_url,
	secret = undefined;
async function getEnvInfo() {
	database_url = await input("PostgreSQL connection string: ");
	secret = await input("Admin panel password: ");
}
async function writeEnv() {}
async function main() {
	reset();
	nextStep();
	console.log(`Step 1/${maxSteps} Collecting runtime info.`);
	await getEnvInfo();
	nextStep();

	rl.close();
}

main();

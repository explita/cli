import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, "../package.json");
const targetPath = path.resolve(__dirname, "../src/version.ts");
const serverTargetPath = path.resolve(__dirname, "../../tunnel/src/version.ts");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version;

const content = `// This file is auto-generated during build. Do not edit directly.
export const CLI_VERSION = ${JSON.stringify(version)};
`;

fs.writeFileSync(targetPath, content, "utf8");
console.log(`[build] Generated src/version.ts (v${version})`);

if (fs.existsSync(path.dirname(serverTargetPath))) {
  fs.writeFileSync(serverTargetPath, content, "utf8");
  console.log(`[build] Generated tunnel/src/version.ts (v${version})`);
}

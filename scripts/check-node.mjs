// Stops a command on the wrong Node version, before Prisma fails with a confusing
// ERR_REQUIRE_ESM. The version comes from .nvmrc. Plain JavaScript, so it runs on any Node.
import { readFileSync } from "node:fs";

const wanted = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const running = process.versions.node.split(".")[0];
if (running !== wanted) {
  console.error(`This needs Node ${wanted}, but this terminal is on Node ${running}. Run \`nvm use\` and try again.`);
  process.exit(1);
}

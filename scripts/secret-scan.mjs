import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
let bad = false;
for (const file of new Set(files)) {
  if (file.endsWith(".png") || file.endsWith(".zip")) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const privateKey =
    text.includes("-".repeat(5) + "BEGIN PRIVATE KEY" + "-".repeat(5)) ||
    text.includes("-".repeat(5) + "BEGIN EC PRIVATE KEY" + "-".repeat(5));
  const secret = [
    /sb_secret_[a-zA-Z0-9_-]{20,}/,
    /\bsbp_[a-f0-9]{40}\b/,
    /GOCSPX-[\w-]{20,}/,
    /\bghp_[A-Za-z0-9]{36}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{60,}/,
    /\bsk-ant-[\w-]{20,}/,
    /VAPID_PRIVATE_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]{43}\b/,
    /HOLIDAY_API_KEY\s*[=:]\s*["']?[A-Za-z0-9%+/=]{20,}/,
  ].some((pattern) => pattern.test(text));
  const serviceToken = [...text.matchAll(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/g)].some(
    (m) => {
      try {
        return (
          JSON.parse(Buffer.from(m[1], "base64url").toString()).role ===
          "service_role"
        );
      } catch {
        return false;
      }
    },
  );
  if (privateKey || secret || serviceToken) {
    console.error("Potential private credential in " + file);
    bad = true;
  }
}
if (bad) process.exitCode = 1;
else
  console.log(
    `Secret scan: ${files.length} source files checked; no private credential patterns found.`,
  );

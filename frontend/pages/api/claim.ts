import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const commitId = process.env.NEXT_PUBLIC_COMMIT_ID;
    const userAddr = process.env.NEXT_PUBLIC_USER_ADDR;

    if (!commitId || !userAddr) {
      return res.status(500).json({
        ok: false,
        error: "Missing env vars",
        env: {
          NEXT_PUBLIC_COMMIT_ID: commitId ?? null,
          NEXT_PUBLIC_USER_ADDR: userAddr ?? null,
        },
      });
    }

    // ✅ HARD RULE: signer must match the user param (your contract expects this)
    const args = [
      "contract",
      "invoke",
      "--network",
      "local",
      "--source-account",
      "user2",
      "--id",
      commitId,
      "--send=yes",
      "--",
      "claim_now",
      "--user",
      userAddr,
    ];

    const cmd = `stellar ${args.map((a) => JSON.stringify(a)).join(" ")}`;

    const stdout = execSync(cmd, {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    return res.status(200).json({ ok: true, args, stdout });
  } catch (e: any) {
    return res.status(200).json({
      ok: false,
      error: "stellar command failed",
      stderr: e?.stderr?.toString?.() ?? String(e),
      stdout: e?.stdout?.toString?.() ?? "",
    });
  }
}

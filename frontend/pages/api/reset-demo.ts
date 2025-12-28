import type { NextApiRequest, NextApiResponse } from "next";
import { execFile } from "child_process";

function run(cmd: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string | null }>((resolve) => {
    execFile(cmd, args, { env: process.env }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          stdout: stdout?.toString() ?? "",
          stderr: (stderr?.toString() || error.message || "").toString(),
        });
        return;
      }
      resolve({ stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? null });
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Use POST" });
      return;
    }

    const commitId = process.env.NEXT_PUBLIC_COMMIT_ID;
    const tokenId = process.env.NEXT_PUBLIC_TOKEN_ID;

    if (!commitId || !tokenId) {
      res.status(500).json({
        ok: false,
        error: "Missing NEXT_PUBLIC_COMMIT_ID or NEXT_PUBLIC_TOKEN_ID in frontend/.env.local",
      });
      return;
    }

    // Decide next demo user: if current user is user2 => switch to user1, else => switch to user2
    const user1 = (await run("stellar", ["keys", "address", "user1"])).stdout.trim();
    const user2 = (await run("stellar", ["keys", "address", "user2"])).stdout.trim();
    const current = (process.env.NEXT_PUBLIC_USER_ADDR || "").trim();

    const nextUser = current === user2 ? user1 : user2;

    // 1) Set eligible for nextUser (tier 0)
    const setEligibleArgs = [
      "contract",
      "invoke",
      "--network",
      "local",
      "--source-account",
      "admin",
      "--id",
      commitId,
      "--send=yes",
      "--",
      "admin_set_eligible",
      "--user",
      nextUser,
      "--tier_id",
      "0",
    ];
    const setEligible = await run("stellar", setEligibleArgs);

    if (setEligible.stderr) {
      res.status(500).json({
        ok: false,
        step: "setEligible",
        cmd: `stellar ${setEligibleArgs.join(" ")}`,
        stdout: setEligible.stdout,
        stderr: setEligible.stderr,
      });
      return;
    }

    // 2) Mint funds to contract so payouts always work
    const mintArgs = [
      "contract",
      "invoke",
      "--network",
      "local",
      "--source-account",
      "admin",
      "--id",
      tokenId,
      "--send=yes",
      "--",
      "mint",
      "--to",
      commitId,
      "--amount",
      "1000",
    ];
    const mintToContract = await run("stellar", mintArgs);

    if (mintToContract.stderr) {
      res.status(500).json({
        ok: false,
        step: "mintToContract",
        cmd: `stellar ${mintArgs.join(" ")}`,
        stdout: mintToContract.stdout,
        stderr: mintToContract.stderr,
      });
      return;
    }

    // IMPORTANT NOTE:
    // We are NOT changing frontend/.env.local here.
    // The UI will still display the current env user.
    // The goal is: Reset prepares "the other user" so you can swap USER_ADDR in env when needed.
    // If you want zero env swapping, we can do Step 3: move the "current user" into a server-side cookie.
    res.status(200).json({
      ok: true,
      nextUserPrepared: nextUser,
      steps: {
        setEligible: {
          cmd: `stellar ${setEligibleArgs.join(" ")}`,
          stdout: setEligible.stdout,
          stderr: null,
        },
        mintToContract: {
          cmd: `stellar ${mintArgs.join(" ")}`,
          stdout: mintToContract.stdout,
          stderr: null,
        },
      },
      note:
        "Reset Demo prepared the OTHER user (user1/user2). If you want the UI to switch users automatically without touching .env.local, say so and I'll give Step 3.",
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "unknown error" });
  }
}

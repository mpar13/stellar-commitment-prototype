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

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const commitId = process.env.NEXT_PUBLIC_COMMIT_ID;
    const userAddr = process.env.NEXT_PUBLIC_USER_ADDR;

    if (!commitId || !userAddr) {
      res.status(500).json({
        ok: false,
        error: "Missing NEXT_PUBLIC_COMMIT_ID or NEXT_PUBLIC_USER_ADDR in frontend/.env.local",
      });
      return;
    }

    // Decide which local key to sign with based on the address in env
    const user1Addr = (await run("stellar", ["keys", "address", "user1"])).stdout.trim();
    const user2Addr = (await run("stellar", ["keys", "address", "user2"])).stdout.trim();

    let sourceAccount = "";
    if (userAddr === user1Addr) sourceAccount = "user1";
    if (userAddr === user2Addr) sourceAccount = "user2";

    if (!sourceAccount) {
      res.status(500).json({
        ok: false,
        error:
          "NEXT_PUBLIC_USER_ADDR is not user1/user2 on this machine. Set it to stellar keys address user1 or user2.",
        envUserAddr: userAddr,
        user1Addr,
        user2Addr,
      });
      return;
    }

    const args = [
      "contract",
      "invoke",
      "--network",
      "local",
      "--source-account",
      sourceAccount,
      "--id",
      commitId,
      "--send=yes",
      "--",
      "claim_now",
      "--user",
      userAddr,
    ];

    const out = await run("stellar", args);

    if (out.stderr) {
      res.status(500).json({
        ok: false,
        cmd: `stellar ${args.join(" ")}`,
        stdout: out.stdout,
        stderr: out.stderr,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      signedAs: sourceAccount,
      cmd: `stellar ${args.join(" ")}`,
      stdout: out.stdout,
      stderr: null,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "unknown error" });
  }
}

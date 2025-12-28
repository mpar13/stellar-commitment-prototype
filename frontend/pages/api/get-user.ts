import type { NextApiRequest, NextApiResponse } from "next";
import { execFile } from "child_process";

function runStellar(args: string[]) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    execFile("stellar", args, { env: process.env }, (error, stdout, stderr) => {
      resolve({
        stdout: (stdout || "").trim(),
        stderr: (stderr || "").trim(),
        code: error ? 1 : 0,
      });
    });
  });
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const COMMIT_ID = process.env.NEXT_PUBLIC_COMMIT_ID;
  const USER_ADDR = process.env.NEXT_PUBLIC_USER_ADDR;
  const TOKEN_ID = process.env.NEXT_PUBLIC_TOKEN_ID;

  if (!COMMIT_ID || !USER_ADDR) {
    return res.status(500).json({
      ok: false,
      error: "Missing NEXT_PUBLIC_COMMIT_ID or NEXT_PUBLIC_USER_ADDR in .env.local",
    });
  }

  // 1) Read user state (read-only simulation)
  const userArgs = [
    "contract",
    "invoke",
    "--network",
    "local",
    "--source-account",
    "admin",
    "--id",
    COMMIT_ID,
    "--",
    "get_user",
    "--user",
    USER_ADDR,
  ];

  const userOut = await runStellar(userArgs);

  // 2) Read token balance (best-effort; if it fails we still return user state)
  let balanceValue: string | null = null;
  let balanceErr: string | null = null;

  if (TOKEN_ID) {
    const balArgs = [
      "contract",
      "invoke",
      "--network",
      "local",
      "--source-account",
      "user2",
      "--id",
      TOKEN_ID,
      "--",
      "balance",
      "--id",
      USER_ADDR,
    ];
    const balOut = await runStellar(balArgs);
    if (balOut.code === 0) {
      // stdout may be like: "5" or {"u128":"5"} depending on CLI; just return raw
      balanceValue = balOut.stdout || null;
    } else {
      balanceErr = balOut.stderr || "balance command failed";
    }
  }

  // Parse user json if possible
  let userJson: any = null;
  try {
    userJson = JSON.parse(userOut.stdout);
  } catch {
    userJson = null;
  }

  return res.status(200).json({
    ok: userOut.code === 0,
    cmd: `stellar ${userArgs.join(" ")}`,
    user: userJson,
    userRaw: userOut.stdout,
    userErr: userOut.code === 0 ? null : userOut.stderr,
    balance: balanceValue,
    balanceErr,
  });
}

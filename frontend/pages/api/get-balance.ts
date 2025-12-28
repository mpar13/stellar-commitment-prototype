import type { NextApiRequest, NextApiResponse } from "next";
import { execFile } from "child_process";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const TOKEN_ID = process.env.NEXT_PUBLIC_TOKEN_ID;
  const USER_ADDR = process.env.NEXT_PUBLIC_USER_ADDR;

  if (!TOKEN_ID || !USER_ADDR) {
    return res.status(500).json({
      ok: false,
      error: "Missing env vars",
      env: { TOKEN_ID, USER_ADDR },
    });
  }

  const args = [
    "contract",
    "invoke",
    "--network",
    "local",
    "--source-account",
    "admin",
    "--id",
    TOKEN_ID,
    "--",
    "balance",
    "--id",
    USER_ADDR,
  ];

  execFile("stellar", args, (err, stdout, stderr) => {
    if (err) {
      return res.status(200).json({
        ok: false,
        error: "stellar command failed",
        stderr: (stderr || "").trim(),
        stdout: (stdout || "").trim(),
      });
    }

    const out = (stdout || "").trim();
    const balance = out.replace(/^"+|"+$/g, "");

    return res.status(200).json({ ok: true, balance });
  });
}

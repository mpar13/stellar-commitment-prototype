import type { NextApiRequest, NextApiResponse } from "next";
import { execFile } from "child_process";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  // This script is your backend reset/deploy script path:
  const scriptPath =
    "/workspaces/stellar-commitment-prototype/contract/commitment_contract/scripts/reset-local.sh";

  const cmd = "bash";
  const args = ["-lc", `cd /workspaces/stellar-commitment-prototype/contract/commitment_contract && "${scriptPath}"`];

  execFile(cmd, args, { env: process.env, maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
    const out = (stdout || "").trim();
    const errOut = (stderr || "").trim();

    if (err) {
      return res.status(200).json({
        ok: false,
        cmd: `${cmd} ${args.join(" ")}`,
        stdout: out,
        stderr: errOut || "reset-local failed",
      });
    }

    return res.status(200).json({
      ok: true,
      cmd: `${cmd} ${args.join(" ")}`,
      stdout: out,
      stderr: errOut || null,
    });
  });
}

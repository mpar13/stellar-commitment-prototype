import { useEffect, useState } from "react";

export default function Home() {
  const [env, setEnv] = useState<any>(null);

  useEffect(() => {
    setEnv({
      rpc: process.env.NEXT_PUBLIC_SOROBAN_RPC,
      passphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
      commitId: process.env.NEXT_PUBLIC_COMMIT_ID,
      tokenId: process.env.NEXT_PUBLIC_TOKEN_ID,
      userAddr: process.env.NEXT_PUBLIC_USER_ADDR,
    });
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Stellar Commitment Prototype</h1>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Env Check</h2>
        <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(env, null, 2)}
        </pre>
      </div>

      <p style={{ marginTop: 16, opacity: 0.8 }}>
        If these values are not null/undefined, frontend env is wired ✅
      </p>
    </main>
  );
}

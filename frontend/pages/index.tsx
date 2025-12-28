import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import styles from "../styles/Home.module.css";

type UserState = {
  eligible: boolean;
  claimed_now: boolean;
  withdrawn: boolean;
  locked: boolean;
  tier_id: number;
  locked_at: number;
  unlock_at: number;
};

type ApiGetUser = {
  ok: boolean;
  cmd?: string;
  user?: UserState;
  userRaw?: string;
  userErr?: string | null;
  balance?: string | null;
  balanceErr?: string | null;
  error?: string;
};

type ApiTx = {
  ok: boolean;
  cmd?: string;
  stdout?: string;
  stderr?: string | null;
  error?: string;
  steps?: any;
  step?: string;
};

function prettyShort(id?: string) {
  if (!id) return "—";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

function safeJsonStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function StatusPill({
  label,
  value,
}: {
  label: string;
  value: "yes" | "no" | "na";
}) {
  const cls =
    value === "yes"
      ? styles.pillYes
      : value === "no"
      ? styles.pillNo
      : styles.pillNa;

  const dotCls =
    value === "yes"
      ? styles.dotYes
      : value === "no"
      ? styles.dotNo
      : styles.dotNa;

  return (
    <div className={`${styles.pill} ${cls}`}>
      <span className={`${styles.dot} ${dotCls}`} />
      <span className={styles.pillLabel}>{label}:</span>
      <span className={styles.pillValue}>
        {value === "yes" ? "Yes" : value === "no" ? "No" : "—"}
      </span>
    </div>
  );
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | "refresh" | "claim" | "reset">(null);

  const [user, setUser] = useState<UserState | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const [lastTx, setLastTx] = useState<any>(null);
  const [debugCmd, setDebugCmd] = useState<string | null>(null);
  const [errors, setErrors] = useState<string | null>(null);

  const env = useMemo(() => {
    return {
      rpc: process.env.NEXT_PUBLIC_SOROBAN_RPC || "",
      passphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "",
      commitId: process.env.NEXT_PUBLIC_COMMIT_ID || "",
      tokenId: process.env.NEXT_PUBLIC_TOKEN_ID || "",
      userAddr: process.env.NEXT_PUBLIC_USER_ADDR || "",
    };
  }, []);

  const claimed = user?.claimed_now ?? false;
  const eligible = user?.eligible ?? false;

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, init);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      // In case something returns plain text, still show it.
      return { ok: false, error: text } as any;
    }
  }

  async function refresh() {
    setBusy("refresh");
    setErrors(null);
    try {
      const data = await api<ApiGetUser>("/api/get-user");
      setLastTx(null);

      if (!data.ok) {
        setErrors(data.error || "get-user failed");
        setUser(null);
        setBalance(null);
        setDebugCmd(data.cmd || null);
        return;
      }

      setUser(data.user || null);
      setBalance(data.balance ?? null);
      setDebugCmd(data.cmd || null);

      if (data.userErr) setErrors(data.userErr);
      if (data.balanceErr) setErrors(data.balanceErr);
    } catch (e: any) {
      setErrors(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function claimNow() {
    setBusy("claim");
    setErrors(null);
    try {
      const data = await api<ApiTx>("/api/claim-now");
      setLastTx(data);
      setDebugCmd(data.cmd || null);

      if (!data.ok) {
        setErrors(data.stderr || data.error || "claim-now failed");
      }

      // Always refresh after attempting claim.
      await refresh();
    } catch (e: any) {
      setErrors(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function resetDemo() {
    setBusy("reset");
    setErrors(null);
    try {
      const data = await api<ApiTx>("/api/reset-demo", { method: "POST" });
      setLastTx(data);
      setDebugCmd(
        data?.cmd || data?.steps?.setEligible?.cmd || data?.step || null
      );

      if (!data.ok) {
        setErrors(data.stderr || data.error || "reset-demo failed");
      }

      // Refresh after reset either way (sometimes reset partially succeeds).
      await refresh();
    } catch (e: any) {
      setErrors(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    // Initial load
    setLoading(true);
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balanceNum = useMemo(() => {
    // backend returns `"5"` sometimes
    if (balance == null) return null;
    const cleaned = balance.replaceAll('"', "").trim();
    return cleaned;
  }, [balance]);

  return (
    <>
      <Head>
        <title>Stellar Commitment Prototype</title>
        <meta
          name="description"
          content="Local Soroban demo dashboard — claim_now flow"
        />
      </Head>

      <div className={styles.bg}>
        <div className={styles.noise} />

        <main className={styles.container}>
          <header className={styles.header}>
            <div className={styles.brand}>
              <div className={styles.kicker}>Local Soroban • demo dashboard • claim_now flow</div>
              <h1 className={styles.title}>Stellar Commitment Prototype</h1>
            </div>

            <div className={styles.quickInfo}>
              <div className={styles.quickTitle}>Quick Info</div>
              <div className={styles.quickRow}>
                <span className={styles.quickKey}>Commit ID</span>
                <span className={styles.quickVal} title={env.commitId}>
                  {prettyShort(env.commitId)}
                </span>
              </div>
              <div className={styles.quickRow}>
                <span className={styles.quickKey}>Token ID</span>
                <span className={styles.quickVal} title={env.tokenId}>
                  {prettyShort(env.tokenId)}
                </span>
              </div>
              <div className={styles.quickRow}>
                <span className={styles.quickKey}>User</span>
                <span className={styles.quickVal} title={env.userAddr}>
                  {prettyShort(env.userAddr)}
                </span>
              </div>
            </div>
          </header>

          <section className={styles.actions}>
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={refresh}
              disabled={busy !== null}
              aria-busy={busy === "refresh"}
            >
              {busy === "refresh" ? "Refreshing…" : "Refresh"}
            </button>

            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={claimNow}
              disabled={busy !== null || !eligible || claimed}
              aria-busy={busy === "claim"}
              title={
                !eligible
                  ? "User not eligible"
                  : claimed
                  ? "Already claimed once (expected)"
                  : "Claim Now"
              }
            >
              {busy === "claim" ? "Claiming…" : "Claim Now"}
            </button>

            <button
              className={`${styles.btn} ${styles.btnAccent}`}
              onClick={resetDemo}
              disabled={busy !== null}
              aria-busy={busy === "reset"}
              title="Admin reset for demo reuse"
            >
              {busy === "reset" ? "Resetting…" : "Reset Demo (Admin)"}
            </button>

            <div className={styles.rightHint}>
              {loading ? (
                <span className={styles.subtle}>Loading…</span>
              ) : errors ? (
                <span className={styles.errorBadge}>⚠ {errors}</span>
              ) : (
                <span className={styles.subtle}>
                  Tip: Claim is one-time. Use Reset Demo to try again.
                </span>
              )}
            </div>
          </section>

          <section className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>User State</div>
                <div className={styles.cardSub}>Readable contract state for the selected user</div>
              </div>

              <div className={styles.pills}>
                <StatusPill label="Eligible" value={user ? (user.eligible ? "yes" : "no") : "na"} />
                <StatusPill
                  label="Claimed Now"
                  value={user ? (user.claimed_now ? "yes" : "no") : "na"}
                />
                <StatusPill label="Locked" value={user ? (user.locked ? "yes" : "no") : "na"} />
                <StatusPill
                  label="Withdrawn"
                  value={user ? (user.withdrawn ? "yes" : "no") : "na"}
                />
              </div>

              <div className={styles.metrics}>
                <div className={styles.metric}>
                  <div className={styles.metricLabel}>Tier</div>
                  <div className={styles.metricValue}>{user ? user.tier_id : "—"}</div>
                </div>
                <div className={styles.metric}>
                  <div className={styles.metricLabel}>Unlock At (ledger time)</div>
                  <div className={styles.metricValue}>{user ? user.unlock_at : "—"}</div>
                </div>
              </div>

              <details className={styles.details}>
                <summary>Debug (CLI command + raw)</summary>
                <div className={styles.codeBlock}>
                  <div className={styles.codeTitle}>Last CLI Command</div>
                  <pre className={styles.pre}>{debugCmd || "—"}</pre>
                </div>
                <div className={styles.codeBlock}>
                  <div className={styles.codeTitle}>User Raw</div>
                  <pre className={styles.pre}>{(user && safeJsonStringify(user)) || "—"}</pre>
                </div>
              </details>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>USDC Balance</div>
                <div className={styles.cardSub}>Reads token.balance(user)</div>
              </div>

              <div className={styles.balanceBox}>
                <div className={styles.balanceLabel}>Balance</div>
                <div className={styles.balanceValue}>{balanceNum ?? "—"}</div>
                <div className={styles.balanceMeta}>
                  token: <span className={styles.mono}>{prettyShort(env.tokenId)}</span>
                </div>
              </div>

              <div className={styles.note}>
                If you switch to a different user key, they may need a trustline (depending on token
                setup). For this demo, you should use the same funded identity used in the backend
                calls.
              </div>
            </div>

            <div className={`${styles.card} ${styles.cardWide}`}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>Last Transaction</div>
                <div className={styles.cardSub}>Raw API response from claim/reset</div>
              </div>

              <div className={styles.txBox}>
                <pre className={styles.pre}>
                  {lastTx ? safeJsonStringify(lastTx) : "null"}
                </pre>
              </div>

              <div className={styles.footerTip}>
                If Codespaces sleeps and your local chain resets: rerun backend reset script, then
                rewrite <span className={styles.mono}>frontend/.env.local</span>, then restart Next.
              </div>
            </div>

            <div className={`${styles.card} ${styles.cardWide}`}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>Quick Info (Full)</div>
                <div className={styles.cardSub}>Frontend env snapshot</div>
              </div>
              <div className={styles.txBox}>
                <pre className={styles.pre}>{safeJsonStringify(env)}</pre>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}

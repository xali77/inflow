"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { defaultChain, supportedChains } from "@/lib/chains";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const privyClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

export default function Providers({ children }: { children: React.ReactNode }) {
  if (!privyAppId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p>Missing configuration</p>
        <p className="text-ink-soft text-sm">
          Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local and restart the dev
          server.
        </p>
      </main>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      clientId={privyClientId || undefined}
      config={{
        loginMethods: ["email", "sms"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain,
        supportedChains,
        appearance: {
          theme: "dark",
          accentColor: "#E8A33D",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

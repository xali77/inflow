"use client";

import { useEffect } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";

// Makes the user's Privy embedded wallet the active wagmi wallet, so the LI.FI
// widget transacts from it directly instead of prompting to connect a wallet.
export default function WalletSync() {
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

  useEffect(() => {
    const embedded =
      wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];
    if (embedded) setActiveWallet(embedded).catch(() => {});
  }, [wallets, setActiveWallet]);

  return null;
}

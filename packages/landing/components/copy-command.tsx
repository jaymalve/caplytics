"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { PillButton } from "@/components/pill-button";

/** A secondary pill that copies an install command, in place of foglamp.dev's "Copy agent prompt". */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <PillButton tone="secondary" onClick={copy} aria-label={`Copy ${command}`}>
      {command}
      {copied ? <Check className="text-emerald-600" /> : <Copy />}
    </PillButton>
  );
}

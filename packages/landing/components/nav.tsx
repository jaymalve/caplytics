import Link from "next/link";
import { BracketButton } from "@/components/bracket-button";
import { Logo } from "@/components/logo";

export function Nav() {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4 md:px-10">
      <Link href="/" className="flex items-center gap-2 text-primary">
        <Logo className="size-7" />
        <span className="text-sm font-medium tracking-widest uppercase">Caplytics</span>
      </Link>
      <BracketButton asChild>
        <a href="https://github.com/jaymalve/caplytics">Get Started</a>
      </BracketButton>
    </header>
  );
}

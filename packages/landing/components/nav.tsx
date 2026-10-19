import Link from "next/link";
import { GithubMark } from "@/components/github-mark";
import { Logo } from "@/components/logo";
import { PillButton } from "@/components/pill-button";
import { links } from "@/lib/links";

const items = [
  { label: "Features", href: "#budgets" },
  { label: "FAQ", href: "#faq" },
  { label: "Docs", href: links.docs },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-primary">
          <Logo className="size-5" />
          <span className="text-lg font-semibold tracking-tight text-foreground">Caplytics</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="hidden rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              {item.label}
            </a>
          ))}
          <a
            href={links.github}
            aria-label="Caplytics on GitHub"
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <GithubMark className="size-4" />
          </a>
          <PillButton asChild size="sm">
            <a href={links.sdk}>Get started</a>
          </PillButton>
        </nav>
      </div>
    </header>
  );
}

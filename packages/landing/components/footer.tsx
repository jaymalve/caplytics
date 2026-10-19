import { Logo } from "@/components/logo";
import { links } from "@/lib/links";

const columns = [
  {
    title: "Product",
    items: [
      { label: "Budgets", href: "#budgets" },
      { label: "Cost attribution", href: "#costs" },
      { label: "Events", href: "#events" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Docs", href: links.docs },
      { label: "SDK on npm", href: links.npm },
      { label: "Self-hosting", href: links.selfHost },
      { label: "Known limitations", href: links.limitations },
    ],
  },
  {
    title: "Project",
    items: [
      { label: "GitHub", href: links.github },
      { label: "Architecture", href: links.architecture },
      { label: "Issues", href: links.issues },
      { label: "MIT license", href: links.license },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto max-w-7xl px-5 py-20 pb-10 sm:px-8">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div className="col-span-2 flex flex-col gap-4 sm:col-span-3 lg:col-span-1">
            <span className="flex items-center gap-2 text-primary">
              <Logo className="size-5" />
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Caplytics
              </span>
            </span>
            <p className="max-w-48 text-sm text-pretty text-muted-foreground">
              Spend control for AI agents.
            </p>
          </div>
          {columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <h3 className="text-sm font-[450]">{column.title}</h3>
              <ul className="flex flex-col gap-2.5">
                {column.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-sm text-muted-foreground transition-colors duration-100 hover:text-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-16 text-xs text-muted-foreground">
          Open source and self-hosted. The dashboard ships as a Docker image.
        </p>
      </div>
    </footer>
  );
}

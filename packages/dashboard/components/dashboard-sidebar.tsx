"use client";

import { Bot, LayoutGrid, LogOut, PanelLeft } from "lucide-react";
import type { ReactNode } from "react";
import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarInset,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
  AnimatedSidebarProvider,
  AnimatedSidebarRail,
  AnimatedSidebarTrigger,
} from "@/components/motion/animated-sidebar";
import { agentColor } from "@/lib/agent-colors";
import { parseAgents } from "@/lib/filter-params";
import { useFilterNavigation } from "@/lib/use-filter-navigation";

export type DashboardSidebarProps = {
  agents: readonly string[];
  email: string;
  signOut: () => Promise<void>;
  children: ReactNode;
};

/**
 * The dashboard is one page (§8.2), so the sidebar is not navigation between pages: each agent is
 * a shortcut that narrows the page to it, writing the same `agent` param the filter bar does.
 */
export function DashboardSidebar({ agents, email, signOut, children }: DashboardSidebarProps) {
  const { params, replaceAll } = useFilterNavigation();
  const selected = parseAgents(params.getAll("agent"));

  return (
    <AnimatedSidebarProvider className="min-h-svh bg-background">
      <AnimatedSidebar ariaLabel="Caplytics" collapsible="icon">
        <AnimatedSidebarHeader className="p-3 pb-2">
          <div className="flex min-h-11 items-center gap-3 overflow-hidden px-2">
            <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground font-mono text-xs font-semibold text-background">
              C
            </div>
            <span className="truncate text-sm font-semibold group-data-[state=collapsed]/sidebar:hidden">
              Caplytics
            </span>
          </div>
        </AnimatedSidebarHeader>

        <AnimatedSidebarContent className="px-2 pt-1">
          <AnimatedSidebarGroup className="pb-2">
            <AnimatedSidebarGroupContent>
              <AnimatedSidebarMenu>
                <AnimatedSidebarMenuItem>
                  <AnimatedSidebarMenuButton
                    icon={<LayoutGrid className="size-4" />}
                    isActive={selected.length === 0}
                    onSelect={() => replaceAll("agent", [])}
                  >
                    All agents
                  </AnimatedSidebarMenuButton>
                </AnimatedSidebarMenuItem>
              </AnimatedSidebarMenu>
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>

          <AnimatedSidebarGroup className="pt-1">
            <AnimatedSidebarGroupLabel>Agents</AnimatedSidebarGroupLabel>
            <AnimatedSidebarGroupContent>
              <AnimatedSidebarMenu>
                {agents.map((agent) => (
                  <AnimatedSidebarMenuItem key={agent}>
                    <AnimatedSidebarMenuButton
                      icon={<Bot className="size-4" style={{ color: agentColor(agent, agents) }} />}
                      isActive={selected.length === 1 && selected[0] === agent}
                      onSelect={() => replaceAll("agent", [agent])}
                    >
                      {agent}
                    </AnimatedSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ))}
              </AnimatedSidebarMenu>
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>
        </AnimatedSidebarContent>

        <AnimatedSidebarFooter className="gap-2 border-none p-3">
          <div className="flex min-h-11 items-center gap-3 overflow-hidden rounded-xl p-1">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
              {email.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground group-data-[state=collapsed]/sidebar:hidden">
              {email}
            </span>
            <form action={signOut} className="group-data-[state=collapsed]/sidebar:hidden">
              <button
                type="submit"
                aria-label="Sign out"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </AnimatedSidebarFooter>

        <AnimatedSidebarRail />
      </AnimatedSidebar>

      <AnimatedSidebarInset className="min-w-0">
        <div className="flex items-center gap-2 px-6 pt-4 md:hidden">
          <AnimatedSidebarTrigger className="text-muted-foreground">
            <PanelLeft className="size-4" />
          </AnimatedSidebarTrigger>
        </div>
        {children}
      </AnimatedSidebarInset>
    </AnimatedSidebarProvider>
  );
}

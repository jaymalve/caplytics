"use client";

import { CalendarIcon, CheckIcon, XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMetadataPair, parseMetadata } from "@/lib/filter-params";

export type FilterBarProps = {
  /** Distinct agent ids, read from the events themselves rather than a fixed list (§8.2). */
  agents: readonly string[];
};

/**
 * §8.2's filter bar. Every control writes to the URL, and the URL is the query (§8.4).
 *
 * Nothing is fetched here and no filter state is duplicated in React: the server component reads
 * the same search params and hands them to `query()`. That is what keeps a filter from meaning one
 * thing in the UI and another in the query.
 */
export function FilterBar({ agents }: FilterBarProps) {
  const router = useRouter();
  const params = useSearchParams();

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const agent = params.get("agent") ?? "";
  const metadata = parseMetadata(params.getAll("meta"));

  const [metadataDraft, setMetadataDraft] = useState("");

  function apply(mutate: (next: URLSearchParams) => void): void {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    router.push(next.size === 0 ? "/" : `/?${next.toString()}`);
  }

  function addMetadata(): void {
    const [key, ...rest] = metadataDraft.split(":");
    const value = rest.join(":").trim();
    if (key === undefined || key.trim().length === 0 || value.length === 0) return;

    apply((next) => next.append("meta", formatMetadataPair(key.trim(), value)));
    setMetadataDraft("");
  }

  const hasFilters = from !== "" || to !== "" || agent !== "" || Object.keys(metadata).length > 0;

  return (
    <div className="flex flex-col gap-3 border-b pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateField
          label="From"
          value={from}
          onChange={(value) => apply((next) => setOrDelete(next, "from", value))}
        />
        <DateField
          label="To"
          value={to}
          onChange={(value) => apply((next) => setOrDelete(next, "to", value))}
        />

        <AgentPicker
          agents={agents}
          value={agent}
          onChange={(value) => apply((next) => setOrDelete(next, "agent", value))}
        />

        <div className="flex items-center gap-2">
          <Input
            aria-label="Metadata filter"
            placeholder="customerId:cus_18213"
            className="w-56"
            value={metadataDraft}
            onChange={(changed) => setMetadataDraft(changed.target.value)}
            onKeyDown={(pressed) => {
              if (pressed.key !== "Enter") return;
              pressed.preventDefault();
              addMetadata();
            }}
          />
          <Button variant="secondary" onClick={addMetadata} disabled={metadataDraft.length === 0}>
            Add
          </Button>
        </div>

        {hasFilters ? (
          <Button variant="ghost" onClick={() => router.push("/")}>
            Clear all
          </Button>
        ) : null}
      </div>

      {Object.keys(metadata).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(metadata).map(([key, value]) => (
            <Badge key={key} variant="secondary" className="gap-1 pr-1">
              <span className="font-mono text-xs">
                {key}: {value}
              </span>
              <button
                type="button"
                aria-label={`Remove ${key} filter`}
                className="rounded-sm p-0.5 hover:bg-muted"
                onClick={() =>
                  apply((next) => {
                    const kept = next
                      .getAll("meta")
                      .filter((pair) => pair !== formatMetadataPair(key, value));
                    next.delete("meta");
                    for (const pair of kept) next.append("meta", pair);
                  })
                }
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function setOrDelete(params: URLSearchParams, key: string, value: string): void {
  if (value === "") params.delete(key);
  else params.set(key, value);
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start gap-2 font-normal">
          <CalendarIcon className="h-4 w-4" />
          {value === "" ? <span className="text-muted-foreground">{label}</span> : value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          autoFocus
          {...(value === "" ? {} : { selected: new Date(`${value}T00:00:00.000Z`) })}
          onSelect={(date) => onChange(date === undefined ? "" : toIsoDate(date))}
        />
        {value === "" ? null : (
          <div className="border-t p-2">
            <Button variant="ghost" className="w-full" onClick={() => onChange("")}>
              Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Populated from distinct `agentId` values, per §8.2 — never a hardcoded list. */
function AgentPicker({
  agents,
  value,
  onChange,
}: {
  agents: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start font-normal">
          {value === "" ? <span className="text-muted-foreground">All agents</span> : value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find an agent" />
          <CommandList>
            <CommandEmpty>No agent has recorded spend yet.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                All agents
                {value === "" ? <CheckIcon className="ml-auto h-4 w-4" /> : null}
              </CommandItem>
              {agents.map((id) => (
                <CommandItem
                  key={id}
                  value={id}
                  onSelect={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                >
                  {id}
                  {value === id ? <CheckIcon className="ml-auto h-4 w-4" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function toIsoDate(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString()
    .slice(0, 10);
}

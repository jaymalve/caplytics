"use client";

import { XIcon } from "lucide-react";
import { useState } from "react";
import {
  DateRangePicker,
  DateRangePickerCalendar,
  DateRangePickerClear,
  DateRangePickerContent,
  DateRangePickerFooter,
  DateRangePickerGrid,
  DateRangePickerHeader,
  DateRangePickerSelection,
  DateRangePickerTrigger,
} from "@/components/motion/date-range-picker";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectInput,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from "@/components/motion/multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agentColor } from "@/lib/agent-colors";
import { formatMetadataPair, parseAgents, parseMetadata } from "@/lib/filter-params";
import { useFilterNavigation } from "@/lib/use-filter-navigation";

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
  const { params, apply, replaceAll } = useFilterNavigation();

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const selectedAgents = parseAgents(params.getAll("agent"));
  const metadata = parseMetadata(params.getAll("meta"));
  const hasFilters =
    from !== "" || to !== "" || selectedAgents.length > 0 || Object.keys(metadata).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          Uncontrolled, and keyed by the URL so it resets when the URL changes. The first click of
          a range is only half a filter; committing it would reload the page between the two clicks.
        */}
        <DateRangePicker
          key={`${from}|${to}`}
          label="Date range"
          defaultValue={from === "" ? null : { from, ...(to === "" ? {} : { to }) }}
          onValueChange={(range) => {
            if (range !== null && range.to === undefined) return;
            apply((next) => {
              setOrDelete(next, "from", range?.from ?? "");
              setOrDelete(next, "to", range?.to ?? "");
            });
          }}
          closeOnSelect
        >
          <DateRangePickerTrigger placeholder="All time" className="min-w-52" />
          <DateRangePickerContent>
            <DateRangePickerCalendar className="w-full rounded-none border-0">
              <DateRangePickerHeader />
              <DateRangePickerGrid />
              <DateRangePickerFooter>
                <div className="flex items-center justify-between gap-2">
                  <DateRangePickerSelection />
                  <DateRangePickerClear />
                </div>
              </DateRangePickerFooter>
            </DateRangePickerCalendar>
          </DateRangePickerContent>
        </DateRangePicker>

        <div className="w-72">
          <MultiSelect
            value={selectedAgents}
            onValueChange={(values) => replaceAll("agent", values)}
          >
            <MultiSelectTrigger>
              <MultiSelectValue placeholder="All agents" />
              <MultiSelectInput aria-label="Find an agent" />
            </MultiSelectTrigger>
            <MultiSelectContent>
              <MultiSelectList ariaLabel="Agents">
                {agents.map((agent) => (
                  <MultiSelectItem key={agent} value={agent} textValue={agent}>
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full"
                        style={{ background: agentColor(agent, agents) }}
                      />
                      {agent}
                    </span>
                  </MultiSelectItem>
                ))}
                <MultiSelectEmpty>No agent has recorded spend yet.</MultiSelectEmpty>
              </MultiSelectList>
            </MultiSelectContent>
          </MultiSelect>
        </div>

        <MetadataInput
          onAdd={(key, value) =>
            apply((next) => next.append("meta", formatMetadataPair(key, value)))
          }
        />

        {hasFilters ? (
          <Button variant="ghost" onClick={() => apply((next) => clearAll(next))}>
            Clear all
          </Button>
        ) : null}
      </div>

      {Object.keys(metadata).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(metadata).map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5"
            >
              <span className="font-mono text-xs">
                {key}: {value}
              </span>
              <button
                type="button"
                aria-label={`Remove ${key} filter`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() =>
                  replaceAll(
                    "meta",
                    params.getAll("meta").filter((pair) => pair !== formatMetadataPair(key, value)),
                  )
                }
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Arbitrary `key:value` pairs per §6.1 — keys are business data, not a fixed dropdown. */
function MetadataInput({ onAdd }: { onAdd: (key: string, value: string) => void }) {
  const [draft, setDraft] = useState("");

  function submit(): void {
    const [key, ...rest] = draft.split(":");
    const value = rest.join(":").trim();
    if (key === undefined || key.trim().length === 0 || value.length === 0) return;

    onAdd(key.trim(), value);
    setDraft("");
  }

  return (
    <Input
      aria-label="Metadata filter"
      placeholder="Filter by metadata, e.g. customerId:cus_18213"
      className="w-80"
      value={draft}
      onChange={(changed) => setDraft(changed.target.value)}
      onKeyDown={(pressed) => {
        if (pressed.key !== "Enter") return;
        pressed.preventDefault();
        submit();
      }}
    />
  );
}

function setOrDelete(params: URLSearchParams, key: string, value: string): void {
  if (value === "") params.delete(key);
  else params.set(key, value);
}

function clearAll(params: URLSearchParams): void {
  for (const key of ["from", "to", "agent", "meta"]) params.delete(key);
}

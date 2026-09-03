# Example: a support agent on a budget

A real Mastra agent with a caplytics budget attached, runnable in one command.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bun run start
```

It prints every model and tool call as it happens, then the run's total. Set a low cap and watch it
stop:

```bash
CAP=0.01 bun run start
```

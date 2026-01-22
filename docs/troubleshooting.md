# Troubleshooting

## Quick facts

- Sessions: results are written to `~/.termos/sessions/<session>/events.jsonl`.
- Session names are derived from the current directory path.
- tmux is not supported.

## Session handling

Session names are auto-generated based on the current directory path.

**Workflow:**
```bash
# Run an interaction (returns JSON with ID)
termos run --title "Confirm" confirm --prompt "Proceed?"

# Wait for result (blocking)
termos wait <id>

# Or get all results (debugging)
termos wait --all
```

## `--wait` hangs

`--wait` only returns after the component completes and a result is written to the events file.

Check the events file directly:

```bash
tail -f ~/.termos/sessions/<session>/events.jsonl
```

If it stays empty after you answer, the component didn't write results.

## Verify a session stream manually

```bash
# write a fake event
printf '{"ts":%s,"type":"result","id":"test","action":"accept"}\n' "$(date +%s000)" >> ~/.termos/sessions/<session>/events.jsonl
```

You should see the line when running `termos wait --all` or by tailing the events file.

## Confirm you are using the local build

If you expect local changes but `termos` behaves like an old version:

```bash
which termos
termos --help
```

The repo ships a wrapper at `.claude-plugin/scripts/termos` that uses `dist/index.js` when present.

# Troubleshooting

## Quick facts

- Sessions: results are written to `~/.awb/sessions/<session>/events.jsonl`.
- Session names are derived from the current directory path.
- tmux is not supported.

## Session handling

Session names are auto-generated based on the current directory path.

**Workflow:**
```bash
# Run an interaction (returns JSON with ID)
awb run --title "Confirm" confirm --prompt "Proceed?"

# Wait for result (blocking)
awb wait <id>

# Or get all results (debugging)
awb wait --all
```

## `--wait` hangs

`--wait` only returns after the component completes and a result is written to the events file.

Check the events file directly:

```bash
tail -f ~/.awb/sessions/<session>/events.jsonl
```

If it stays empty after you answer, the component didn't write results.

## Verify a session stream manually

```bash
# write a fake event
printf '{"ts":%s,"type":"result","id":"test","action":"accept"}\n' "$(date +%s000)" >> ~/.awb/sessions/<session>/events.jsonl
```

You should see the line when running `awb wait --all` or by tailing the events file.

## Confirm you are using the local build

If you expect local changes but `awb` behaves like an old version:

```bash
which awb
awb --help
```

The repo ships a wrapper at `.claude-plugin/scripts/awb` that uses `dist/index.js` when present.

Three ways to hand your AI tool Outlet's docs.

## Claude Code

```sh
claude plugin marketplace add PARZ1V3L/outlet
claude plugin install outlet@useoutlet
```

```text
/outlet:add-outlet
```

## MCP for any tool

```sh
claude mcp add outlet -- npx -y @useoutlet/sdk mcp
```

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "outlet": { "command": "npx", "args": ["-y", "@useoutlet/sdk", "mcp"] }
  }
}
```

## Cursor rule

```sh
cp ai-tools/cursor/outlet.mdc .cursor/rules/outlet.mdc
```

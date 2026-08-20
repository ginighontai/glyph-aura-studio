# Offline type-check stubs

`npm run typecheck` is the real check and uses the published `@types/react` from
`node_modules`. These files exist for one narrow situation: verifying the
TypeScript in `src/` on a machine that cannot reach the npm registry (an air-gapped
CI runner, a locked-down build box, or the sandbox this project was written in).

They declare only the surface of `react`, `react/jsx-runtime` and `react-dom/client`
that the studio actually imports. They are **not** a substitute for the real types —
DOM prop types in particular are intentionally loose — but they do catch genuine
mistakes in the application's own logic, generics and interfaces.

```bash
# from the repository root, with no node_modules present
tsc -p tools/offline-typecheck/tsconfig.json
```

Nothing in `src/` or the production build references this directory, and
`tsconfig.app.json` does not include it.

# codestory

Thin alias for [`@particular-labs/codestory`](https://www.npmjs.com/package/@particular-labs/codestory).

`npx codestory <cmd>` runs the same CLI as `npx @particular-labs/codestory <cmd>`. This
package carries no logic of its own — it depends on the scoped package and re-execs its
`dist/cli.js` in-process. The scoped package is the single source of truth; this alias is
republished only to track its version.

See the scoped package's README for usage (`init`, `validate`, `migrate`, `present`).

# Third party design references

This project adapts design and implementation patterns from the following MIT-licensed projects. It does not bundle their React, Radix, TanStack, Tailwind, chart libraries, sample datasets, brand assets, or fonts. The interface is implemented in the project's existing HTML, CSS and JavaScript stack.

| Project | Author | Reference | License text |
| --- | --- | --- | --- |
| Tremor Overview | Tremor Labs, Inc. | https://github.com/tremorlabs/template-overview | [MIT](licenses/tremor-overview-MIT.txt) |
| Tremor Dashboard | Tremor Labs, Inc. | https://github.com/tremorlabs/template-dashboard | [MIT](licenses/tremor-dashboard-MIT.txt) |
| shadcn/ui | shadcn | https://github.com/shadcn-ui/ui | [MIT](licenses/shadcn-ui-MIT.txt) |

Adaptations include the restrained workspace shell, gray border and surface hierarchy, compact outline/primary/ghost control variants, semantic table structure, row hover and selected states, navigation grouping, and mobile drawer approach. See DESIGN.md for exact source paths and project-specific decisions. Brand names identify references and do not imply endorsement.

## Bundled database client

`vendor/supabase.js` bundles `@supabase/supabase-js` **2.119.0** and its pinned dependencies for browser Auth and PostgREST access. Source: [supabase-js](https://github.com/supabase/supabase-js). Supabase packages and iceberg-js are MIT licensed; full notices are in [licenses/supabase-bundle-notices.txt](licenses/supabase-bundle-notices.txt). Phoenix is copyright Chris McCord and MIT licensed, also preserved there. Exact versions and integrity hashes are in `package-lock.json`. Rebuild using `npm ci --ignore-scripts` and `npm run build:sdk` (esbuild 0.28.2). No SDK is loaded from a third-party CDN at runtime.

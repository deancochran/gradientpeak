# Coverage Matrix: `packages/ui` Dual-Runner Component Tests

Last updated: 2026-03-20

Notes:

- Web coverage is still split between dedicated `.web.test.tsx` files and the aggregate `packages/ui/src/components/component-coverage.web.test.tsx` smoke suite.
- Native coverage now has a one-to-one `index.native.tsx` -> `index.native.test.tsx` mapping for every native-exported shared component.

## Web exports

| Component       | Export          | Corresponding test                                              | Status  | Depth                          |
| --------------- | --------------- | --------------------------------------------------------------- | ------- | ------------------------------ |
| accordion       | `index.web.tsx` | `packages/ui/src/components/accordion/index.web.test.tsx`       | covered | structural/composite primitive |
| alert-dialog    | `index.web.tsx` | `packages/ui/src/components/alert-dialog/index.web.test.tsx`    | covered | structural/composite primitive |
| avatar          | `index.web.tsx` | `packages/ui/src/components/avatar/index.web.test.tsx`          | covered | structural/composite primitive |
| badge           | `index.web.tsx` | `packages/ui/src/components/badge/index.web.test.tsx`           | covered | smoke-test only                |
| button          | `index.web.tsx` | `packages/ui/src/components/button/index.web.test.tsx`          | covered | interactive primitive          |
| card            | `index.web.tsx` | `packages/ui/src/components/card/index.web.test.tsx`            | covered | structural/composite primitive |
| command         | `index.web.tsx` | `packages/ui/src/components/command/index.web.test.tsx`         | covered | structural/composite primitive |
| dialog          | `index.web.tsx` | `packages/ui/src/components/dialog/index.web.test.tsx`          | covered | structural/composite primitive |
| dropdown-menu   | `index.web.tsx` | `packages/ui/src/components/dropdown-menu/index.web.test.tsx`   | covered | structural/composite primitive |
| form            | `index.web.tsx` | `packages/ui/src/components/form/index.web.test.tsx`            | covered | structural/composite primitive |
| icon            | `index.web.tsx` | `packages/ui/src/components/icon/index.web.test.tsx`            | covered | smoke-test only                |
| input           | `index.web.tsx` | `packages/ui/src/components/input/index.web.test.tsx`           | covered | interactive primitive          |
| label           | `index.web.tsx` | `packages/ui/src/components/label/index.web.test.tsx`           | covered | structural/composite primitive |
| navigation-menu | `index.web.tsx` | `packages/ui/src/components/navigation-menu/index.web.test.tsx` | covered | structural/composite primitive |
| resizable       | `index.web.tsx` | `packages/ui/src/components/resizable/index.web.test.tsx`       | covered | structural/composite primitive |
| scroll-area     | `index.web.tsx` | `packages/ui/src/components/scroll-area/index.web.test.tsx`     | covered | structural/composite primitive |
| separator       | `index.web.tsx` | `packages/ui/src/components/separator/index.web.test.tsx`       | covered | smoke-test only                |
| sheet           | `index.web.tsx` | `packages/ui/src/components/sheet/index.web.test.tsx`           | covered | structural/composite primitive |
| sonner          | `index.web.tsx` | `packages/ui/src/components/sonner/index.web.test.tsx`          | covered | structural/composite primitive |
| table           | `index.web.tsx` | `packages/ui/src/components/table/index.web.test.tsx`           | covered | structural/composite primitive |
| tabs            | `index.web.tsx` | `packages/ui/src/components/tabs/index.web.test.tsx`            | covered | interactive primitive          |
| toggle          | `index.web.tsx` | `packages/ui/src/components/toggle/index.web.test.tsx`          | covered | interactive primitive          |
| toggle-group    | `index.web.tsx` | `packages/ui/src/components/toggle-group/index.web.test.tsx`    | covered | interactive primitive          |
| tooltip         | `index.web.tsx` | `packages/ui/src/components/tooltip/index.web.test.tsx`         | covered | structural/composite primitive |

Web summary: 24 exports, 24 matching `.web.test.tsx` files, 0 missing matching `.web.test.tsx` files.

## Native exports

| Component                 | Export             | Corresponding test                                                           | Status  | Depth                          |
| ------------------------- | ------------------ | ---------------------------------------------------------------------------- | ------- | ------------------------------ |
| accordion                 | `index.native.tsx` | `packages/ui/src/components/accordion/index.native.test.tsx`                 | covered | structural/composite primitive |
| alert                     | `index.native.tsx` | `packages/ui/src/components/alert/index.native.test.tsx`                     | covered | structural/composite primitive |
| alert-dialog              | `index.native.tsx` | `packages/ui/src/components/alert-dialog/index.native.test.tsx`              | covered | structural/composite primitive |
| aspect-ratio              | `index.native.tsx` | `packages/ui/src/components/aspect-ratio/index.native.test.tsx`              | covered | smoke-test only                |
| avatar                    | `index.native.tsx` | `packages/ui/src/components/avatar/index.native.test.tsx`                    | covered | structural/composite primitive |
| badge                     | `index.native.tsx` | `packages/ui/src/components/badge/index.native.test.tsx`                     | covered | smoke-test only                |
| button                    | `index.native.tsx` | `packages/ui/src/components/button/index.native.test.tsx`                    | covered | interactive primitive          |
| card                      | `index.native.tsx` | `packages/ui/src/components/card/index.native.test.tsx`                      | covered | structural/composite primitive |
| checkbox                  | `index.native.tsx` | `packages/ui/src/components/checkbox/index.native.test.tsx`                  | covered | interactive primitive          |
| collapsible               | `index.native.tsx` | `packages/ui/src/components/collapsible/index.native.test.tsx`               | covered | smoke-test only                |
| context-menu              | `index.native.tsx` | `packages/ui/src/components/context-menu/index.native.test.tsx`              | covered | smoke-test only                |
| dialog                    | `index.native.tsx` | `packages/ui/src/components/dialog/index.native.test.tsx`                    | covered | structural/composite primitive |
| dropdown-menu             | `index.native.tsx` | `packages/ui/src/components/dropdown-menu/index.native.test.tsx`             | covered | structural/composite primitive |
| form                      | `index.native.tsx` | `packages/ui/src/components/form/index.native.test.tsx`                      | covered | structural/composite primitive |
| hover-card                | `index.native.tsx` | `packages/ui/src/components/hover-card/index.native.test.tsx`                | covered | smoke-test only                |
| icon                      | `index.native.tsx` | `packages/ui/src/components/icon/index.native.test.tsx`                      | covered | smoke-test only                |
| input                     | `index.native.tsx` | `packages/ui/src/components/input/index.native.test.tsx`                     | covered | interactive primitive          |
| label                     | `index.native.tsx` | `packages/ui/src/components/label/index.native.test.tsx`                     | covered | structural/composite primitive |
| menubar                   | `index.native.tsx` | `packages/ui/src/components/menubar/index.native.test.tsx`                   | covered | smoke-test only                |
| native-only-animated-view | `index.native.tsx` | `packages/ui/src/components/native-only-animated-view/index.native.test.tsx` | covered | smoke-test only                |
| popover                   | `index.native.tsx` | `packages/ui/src/components/popover/index.native.test.tsx`                   | covered | smoke-test only                |
| progress                  | `index.native.tsx` | `packages/ui/src/components/progress/index.native.test.tsx`                  | covered | structural/composite primitive |
| radio-group               | `index.native.tsx` | `packages/ui/src/components/radio-group/index.native.test.tsx`               | covered | interactive primitive          |
| select                    | `index.native.tsx` | `packages/ui/src/components/select/index.native.test.tsx`                    | covered | interactive primitive          |
| separator                 | `index.native.tsx` | `packages/ui/src/components/separator/index.native.test.tsx`                 | covered | smoke-test only                |
| skeleton                  | `index.native.tsx` | `packages/ui/src/components/skeleton/index.native.test.tsx`                  | covered | smoke-test only                |
| slider                    | `index.native.tsx` | `packages/ui/src/components/slider/index.native.test.tsx`                    | covered | interactive primitive          |
| switch                    | `index.native.tsx` | `packages/ui/src/components/switch/index.native.test.tsx`                    | covered | interactive primitive          |
| tabs                      | `index.native.tsx` | `packages/ui/src/components/tabs/index.native.test.tsx`                      | covered | interactive primitive          |
| text                      | `index.native.tsx` | `packages/ui/src/components/text/index.native.test.tsx`                      | covered | structural/composite primitive |
| textarea                  | `index.native.tsx` | `packages/ui/src/components/textarea/index.native.test.tsx`                  | covered | interactive primitive          |
| toggle                    | `index.native.tsx` | `packages/ui/src/components/toggle/index.native.test.tsx`                    | covered | interactive primitive          |
| toggle-group              | `index.native.tsx` | `packages/ui/src/components/toggle-group/index.native.test.tsx`              | covered | interactive primitive          |
| tooltip                   | `index.native.tsx` | `packages/ui/src/components/tooltip/index.native.test.tsx`                   | covered | structural/composite primitive |

Native summary: 34 exports, 34 matching `.native.test.tsx` files, 0 missing matching `.native.test.tsx` files.

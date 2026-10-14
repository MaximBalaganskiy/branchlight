# Branchlight conventions

Follow the Aurelia 2 and desktop UI conventions below.

- Use aurelia-headless components and services. Read the headless README and relevant demo/source before integrating a component.
- Import the shipped `@aurelia-ui-toolkits/headless-tailwind` theme. Use its semantic colour and density tokens; do not rebuild component themes.
- Prefer inline Tailwind utilities for local layout. Use nested CSS for reusable styles, component internals, and states that are clearer as selectors.
- Keep opening-tag attributes on one line. Do not format one attribute per line.
- Use `button ui-button`, `button ui-icon-button`, and `ui-input`; do not manually add `as-element`.
- Use `UiToastService` for notifications. It creates its own region; never mount a second host or region.
- Put views in their own folders. Put each named class or interface in its own file.
- Use two spaces, single quotes, LF, and expanded source. Keep function bodies multiline.
- Put decorators on their own lines, with a blank line between bindable properties. Put observable/bindable change handlers directly below the property.
- Production output must be bundled and minified. Development source must remain readable.
- Validate UI changes in the actual desktop app, including keyboard interaction and error paths.
- Keep meaningful local Git history for completed changes. Do not modify reference repositories.

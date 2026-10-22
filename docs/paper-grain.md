# Paper grain

`camo-base.css` gives content cards (`.card-fx`) a subtle paper grain: a seamlessly tileable 160 x 160 px white-with-alpha image, shown at low strength.

The tile ships with the tokens package as `packages/tokens/assets/paper-grain.webp`. The stylesheet refers to it by URL, so the file has to be served by the consuming app:

1. Copy `assets/paper-grain.webp` to the app's public folder as `textures/paper-grain.webp` (so it is served at `/textures/paper-grain.webp`, which is what `--texture-paper-grain` points at).
2. If the app serves it somewhere else, override the variable in an unlayered rule after `camo-base.css`:
   `:root { --texture-paper-grain: url("/static/grain.webp"); }`
3. The tile size is `--texture-paper-grain-size` (160px 160px). Change it only if you replace the tile with one of a different size.

A future `camo init` command will do the copy step. Until it exists, copy the file by hand.

Without the file the cards still render; the grain layer is simply absent (the image request 404s).

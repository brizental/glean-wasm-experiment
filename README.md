# Compile glean-core to WASM experiment

I did not have success compiling the whole thing to WASM, but I was able to compile the histograms part and try it out in the ditributions simulator.

This repo is the result of that.

# How to build

Inside the `src/` folder is where the Rust code lives. To build it, run:

```bash
wasm-pack build
```

This will generate a `pkg/` folder inside the root folder of this project. Run:

```bash
cp -f -r pkg/ site/glean/
```

This will copy that folder to the `site/` folder which contains the simulators code.

> If you look inside `site/package.json` you'll see that we include the code generated by `wasm-pack build` as a dependency to our JavaScript project.

Now go inside the `site/` folder and run:

```bash
npm run dev
```

Open `http://localhost:3000` to see the result.

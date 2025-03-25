const path = require("path");
const { composePlugins, withNx } = require("@nx/webpack");
const { withReact } = require("@nx/react");
const { merge } = require("webpack-merge");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { EnvironmentPlugin, DefinePlugin } = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

const RELEASE = require("./release").getReleaseName();

const css_prefix = "lsf-";
const mode = process.env.NODE_ENV || "development";
const isDevelopment = mode !== "production";
const devtool = isDevelopment ? "source-map" : "source-map";

const LOCAL_ENV = {
  NODE_ENV: mode,
  CSS_PREFIX: css_prefix,
  RELEASE_NAME: RELEASE,
};

const BUILD = {
  NO_MINIMIZE: isDevelopment || !!process.env.BUILD_NO_MINIMIZATION,
};

const plugins = [
  new MiniCssExtractPlugin({
    filename: "css/[name].css",
  }),
  new DefinePlugin({
    "process.env.CSS_PREFIX": JSON.stringify(css_prefix),
  }),
  new EnvironmentPlugin(LOCAL_ENV),
];

const optimizer = () => {
  const result = {
    minimize: !BUILD.NO_MINIMIZE,
    minimizer: [],
  };

  if (mode === "production" && !BUILD.NO_MINIMIZE) {
    result.minimizer.push(
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          keep_classnames: true,
          keep_fnames: true,
        },
      }),
      new CssMinimizerPlugin({
        parallel: true,
      }),
    );
  }

  return result;
};

// Define entry point and externals
const PEER_DEPENDENCIES = [
  "react", 
  "react-dom",
  "mobx",
  "mobx-react",
  "mobx-state-tree"
];

// Nx plugins for webpack
module.exports = composePlugins(
  withNx({
    nx: {
      svgr: true,
    },
    skipTypeChecking: true,
  }),
  withReact({ svgr: true }),
  (config) => {
    // Library entrypoint - update this to match your main export file
    config.entry = {
      index: path.resolve(__dirname, "libs/index.ts"), // Create this file to export your components
    };

    // Configure as a library
    config.output = {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      library: {
        name: "labelstudio",
        type: "umd",
        umdNamedDefine: true,
      },
      globalObject: 'this',
      publicPath: "",
    };

    // Define peer dependencies as externals
    config.externals = PEER_DEPENDENCIES.reduce((externals, dep) => {
      externals[dep] = {
        commonjs: dep,
        commonjs2: dep,
        amd: dep,
        root: dep,
      };
      return externals;
    }, {});

    config.resolve.fallback = {
      fs: false,
      path: false,
      crypto: false,
      worker_threads: false,
    };

    config.experiments = {
      cacheUnaffected: true,
      syncWebAssembly: true,
      asyncWebAssembly: true,
    };

    // Handle SCSS modules the same way as original config
    config.module.rules.forEach((rule) => {
      const testString = rule.test.toString();
      const isScss = testString.includes("scss");
      const isCssModule = testString.includes(".module");

      if (isScss) {
        rule.oneOf.forEach((loader) => {
          if (loader.use) {
            const cssLoader = loader.use.find((use) => use.loader && use.loader.includes("css-loader"));

            if (cssLoader && cssLoader.options) {
              cssLoader.options.modules = {
                mode: "local",
                auto: true,
                namedExport: false,
                localIdentName: "[local]--[hash:base64:5]",
              };
            }
          }
        });
      }

      if (rule.test.toString().match(/scss|sass/) && !isCssModule) {
        const r = rule.oneOf.filter((r) => {
          if (!r.use) return false;
          const testString = r.test.toString();
          if (testString.match(/module|raw/)) return false;
          return testString.match(/scss|sass/) && r.use.some((u) => u.loader && u.loader.includes("css-loader"));
        });

        r.forEach((_r) => {
          const cssLoader = _r.use.find((use) => use.loader && use.loader.includes("css-loader"));

          if (!cssLoader) return;

          const isSASS = _r.use.some((use) => use.loader && use.loader.includes(/sass|scss/));

          if (isSASS) _r.exclude = /node_modules/;

          if (cssLoader.options) {
            cssLoader.options.modules = {
              localIdentName: `${css_prefix}[local]`,
              getLocalIdent(_ctx, _ident, className) {
                if (className.includes("ant")) return className;
              },
            };
          }
        });
      }

      if (testString.includes(".css")) {
        rule.exclude = /tailwind\.css/;
      }
    });

    // Keep SVG and other loaders
    config.module.rules.push(
      {
        test: /\.svg$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "@svgr/webpack",
            options: {
              ref: true,
            },
          },
          "url-loader",
        ],
      },
      {
        test: /\.xml$/,
        exclude: /node_modules/,
        loader: "url-loader",
      },
      {
        test: /\.wasm$/,
        type: "javascript/auto",
        loader: "file-loader",
        options: {
          name: "[name].[ext]",
        },
      },
      // tailwindcss
      {
        test: /tailwind\.css/,
        exclude: /node_modules/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: {
              importLoaders: 1,
            },
          },
          "postcss-loader",
        ],
      },
    );

    if (isDevelopment) {
      config.optimization = {
        ...config.optimization,
        moduleIds: "named",
      };
    }

    config.resolve.alias = {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react-joyride": path.resolve(__dirname, "node_modules/react-joyride"),
      "@humansignal/ui": path.resolve(__dirname, "libs/ui"),
      "@humansignal/core": path.resolve(__dirname, "libs/core"),
    };

    return merge(config, {
      devtool,
      mode,
      plugins,
      optimization: optimizer(),
    });
  },
);
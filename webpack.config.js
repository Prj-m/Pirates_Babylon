const path = require("path");

module.exports = {
  mode: "development",
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
    publicPath: "/",              // Ensure correct public path for bundled files
  },
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  devServer: {
    static: [
      {
        directory: path.join(__dirname, "public"),  // Serve public folder (for assets)
      },
      {
        directory: path.join(__dirname, "dist"),    // Serve dist folder (for bundle)
      },
    ],
    compress: true,
    port: 8080,
    open: true,  // Automatically opens browser on start (optional)
  },
};

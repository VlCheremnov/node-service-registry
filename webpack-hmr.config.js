const nodeExternals = require('webpack-node-externals');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');
const path = require('path');

module.exports = function (options, webpack) {
  return {
    ...options,
    entry: ['webpack/hot/poll?100', options.entry],
    externals: [
      // nodeExternals({
      //     allowlist: ['webpack/hot/poll?100'],
      // }),
      nodeExternals({
        allowlist: ['webpack/hot/poll?100'],
        modulesDir: path.resolve(__dirname, 'node_modules'),
      }),
      // Второй каталог с node_modules
      nodeExternals({
        allowlist: ['webpack/hot/poll?100'],
        modulesDir: path.resolve(__dirname, '../../node_modules'),
      }),
    ],
    plugins: [
      ...options.plugins,
      new webpack.HotModuleReplacementPlugin(),
      new webpack.WatchIgnorePlugin({
        paths: [/\.js$/, /\.d\.ts$/],
      }),
      new RunScriptWebpackPlugin({
        name: options.output.filename,
        autoRestart: false,
      }),
    ],
    devtool: 'inline-source-map',
    // Настройки полинга для HMR в докер-контейнере
    watchOptions: {
      poll: 1000, // Период опроса в миллисекундах
      ignored: /node_modules/,
    },
  };
};

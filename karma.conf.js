/* eslint-disable global-require */
/* eslint-disable react/require-extension */
var path = require('path');
var loaders = require('./config/webpack.loaders.js');

var styles = path.join(__dirname, './style');

module.exports = function karmaConf(config) {
  config.set({
    plugins: [
      require('karma-webpack'),
      require('karma-tap'),
      require('karma-chrome-launcher'),
      require('karma-coverage'),
      require('karma-tap-pretty-reporter'),
    ],
    basePath: '',
    frameworks: ['tap'],
    files: [
      './node_modules/babel-polyfill/dist/polyfill.min.js',
      './src/**/tests/*.js',
      { pattern: 'data/**', watched: false, included: false, served: true },
      {
        pattern: 'node_modules/tonic-arctic-sample-data/data/**',
        watched: false,
        included: false,
        served: true,
      },
    ],
    exclude: ['src/tests/**/*-node-only.js'],
    proxies: {
      '/data/': [
        'http://localhost:',
        9876,
        '/base/node_modules/tonic-arctic-sample-data/data/',
      ].join(''),
    },
    preprocessors: {
      'src/**/tests/*.js': ['webpack'],
    },

    webpack: {
      mode: 'development',
      node: {
        fs: 'empty',
      },
      module: {
        rules: [].concat(loaders),
      },
      resolve: {
        alias: {
          paraviewweb: __dirname,
          PVWStyle: styles,
        },
      },
    },

    webpackMiddleware: {
      noInfo: true,
    },

    reporters: ['coverage', 'tap-pretty'],

    tapReporter: {
      // outputFile: 'Documentation/content/coverage/tests.md',
      prettifier: 'tap-spec',
      separator:
        '\n=========================================================\n=========================================================\n',
    },

    coverageReporter: {
      dir: 'documentation/build-tmp/public',
      reporters: [{ type: 'html', subdir: 'coverage' }],
    },

    client: {
      useIframe: false,
    },

    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
    },

    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['Chrome'],
    singleRun: true,
  });
};

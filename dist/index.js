'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = runContentfulExport;

var _fs = require('fs');

var _bfj = require('bfj');

var _bfj2 = _interopRequireDefault(_bfj);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _cliTable = require('cli-table3');

var _cliTable2 = _interopRequireDefault(_cliTable);

var _listr = require('listr');

var _listr2 = _interopRequireDefault(_listr);

var _listrUpdateRenderer = require('listr-update-renderer');

var _listrUpdateRenderer2 = _interopRequireDefault(_listrUpdateRenderer);

var _listrVerboseRenderer = require('listr-verbose-renderer');

var _listrVerboseRenderer2 = _interopRequireDefault(_listrVerboseRenderer);

var _lodash = require('lodash');

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _listr3 = require('contentful-batch-libs/dist/listr');

var _logging = require('contentful-batch-libs/dist/logging');

var _downloadAssets = require('./tasks/download-assets');

var _downloadAssets2 = _interopRequireDefault(_downloadAssets);

var _getSpaceData = require('./tasks/get-space-data');

var _getSpaceData2 = _interopRequireDefault(_getSpaceData);

var _initClient = require('./tasks/init-client');

var _initClient2 = _interopRequireDefault(_initClient);

var _parseOptions = require('./parseOptions');

var _parseOptions2 = _interopRequireDefault(_parseOptions);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const accessP = _bluebird2.default.promisify(_fs.access);
const mkdirpP = _bluebird2.default.promisify(_mkdirp2.default);

function createListrOptions(options) {
  if (options.useVerboseRenderer) {
    return {
      renderer: _listrVerboseRenderer2.default
    };
  }
  return {
    renderer: _listrUpdateRenderer2.default,
    collapse: false
  };
}

function runContentfulExport(params) {
  const log = [];
  const options = (0, _parseOptions2.default)(params);

  const listrOptions = createListrOptions(options);

  // Setup custom error listener to store errors for later
  (0, _logging.setupLogging)(log);

  const tasks = new _listr2.default([{
    title: 'Initialize client',
    task: (0, _listr3.wrapTask)(ctx => {
      try {
        // CMA client
        ctx.client = (0, _initClient2.default)(options);
        if (options.cdaAccessToken) {
          // CDA client for fetching only public entries
          ctx.cdaClient = (0, _initClient2.default)(options, true);
        }
        return _bluebird2.default.resolve();
      } catch (err) {
        return _bluebird2.default.reject(err);
      }
    })
  }, {
    title: 'Fetching data from space',
    task: ctx => {
      return (0, _getSpaceData2.default)({
        client: ctx.client,
        cdaClient: ctx.cdaClient,
        spaceId: options.spaceId,
        environmentId: options.environmentId,
        maxAllowedLimit: options.maxAllowedLimit,
        includeDrafts: options.includeDrafts,
        includeArchived: options.includeArchived,
        skipContentModel: options.skipContentModel,
        skipContent: options.skipContent,
        skipWebhooks: options.skipWebhooks,
        skipRoles: options.skipRoles,
        listrOptions,
        queryEntries: options.queryEntries,
        queryAssets: options.queryAssets
      });
    }
  }, {
    title: 'Download assets',
    task: (0, _listr3.wrapTask)((0, _downloadAssets2.default)(options)),
    skip: ctx => !options.downloadAssets || !ctx.data.hasOwnProperty('assets')
  }, {
    title: 'Write export log file',
    task: ctx => {
      return new _listr2.default([{
        title: 'Lookup directory to store the logs',
        task: ctx => {
          return accessP(options.exportDir).then(() => {
            ctx.logDirectoryExists = true;
          }).catch(() => {
            ctx.logDirectoryExists = false;
          });
        }
      }, {
        title: 'Create log directory',
        task: ctx => {
          return mkdirpP(options.exportDir);
        },
        skip: ctx => !ctx.logDirectoryExists
      }, {
        title: 'Writing data to file',
        task: ctx => {
          return _bfj2.default.write(options.logFilePath, ctx.data, {
            circular: 'ignore',
            space: 2
          });
        }
      }]);
    },
    skip: () => !options.saveFile
  }], listrOptions);

  return tasks.run({
    data: {}
  }).then(ctx => {
    const resultTypes = Object.keys(ctx.data);
    if (resultTypes.length) {
      const resultTable = new _cliTable2.default();

      resultTable.push([{ colSpan: 2, content: 'Exported entities' }]);

      resultTypes.forEach(type => {
        resultTable.push([(0, _lodash.startCase)(type), ctx.data[type].length]);
      });

      console.log(resultTable.toString());
    } else {
      console.log('No data was exported');
    }

    if ('assetDownloads' in ctx) {
      const downloadsTable = new _cliTable2.default();
      downloadsTable.push([{ colSpan: 2, content: 'Asset file download results' }]);
      downloadsTable.push(['Successful', ctx.assetDownloads.successCount]);
      downloadsTable.push(['Warnings ', ctx.assetDownloads.warningCount]);
      downloadsTable.push(['Errors ', ctx.assetDownloads.errorCount]);
      console.log(downloadsTable.toString());
    }

    const durationHuman = options.startTime.fromNow(true);
    const durationSeconds = (0, _moment2.default)().diff(options.startTime, 'seconds');

    console.log(`The export took ${durationHuman} (${durationSeconds}s)`);
    if (options.saveFile) {
      console.log(`\nStored space data to json file at: ${options.logFilePath}`);
    }
    return ctx.data;
  }).catch(err => {
    log.push({
      ts: new Date().toJSON(),
      level: 'error',
      error: err
    });
  }).then(data => {
    // @todo this should life in batch libs
    const errorLog = log.filter(logMessage => logMessage.level !== 'info' && logMessage.level !== 'warning');
    const displayLog = log.filter(logMessage => logMessage.level !== 'info');
    (0, _logging.displayErrorLog)(displayLog);

    if (errorLog.length) {
      return (0, _logging.writeErrorLogFile)(options.errorLogFile, errorLog).then(() => {
        const multiError = new Error('Errors occured');
        multiError.name = 'ContentfulMultiError';
        multiError.errors = errorLog;
        throw multiError;
      });
    }

    console.log('The export was successful.');

    return data;
  });
}
module.exports = exports['default'];
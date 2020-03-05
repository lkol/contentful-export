'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.default = initClient;

var _contentfulManagement = require('contentful-management');

var _contentful = require('contentful');

var _logging = require('contentful-batch-libs/dist/logging');

function logHandler(level, data) {
  _logging.logEmitter.emit(level, data);
}

function initClient(opts, useCda = false) {
  const defaultOpts = {
    timeout: 10000,
    logHandler
  };
  const config = _extends({}, defaultOpts, opts);
  if (useCda) {
    const cdaConfig = {
      space: config.spaceId,
      accessToken: config.cdaAccessToken,
      environment: config.environmentId,
      host: config.includeDrafts ? 'preview.contentful.com' : 'cdn.contentful.com',
      resolveLinks: false,
      retryLimit: 20
    };
    return (0, _contentful.createClient)(cdaConfig);
  }
  return (0, _contentfulManagement.createClient)(config);
}
module.exports = exports['default'];
'use strict';


var async = require('async');
var bodyParser = require('body-parser');
var csrf = require('csurf');
var expressVersion = require('express/package.json').version;
var session = require('client-sessions');
var stormpath = require('stormpath');
var controllers = require('./controllers');

var authentication = require('./authentication');
var forms = require('./forms');
var helpers = require('./helpers');
var version = require('../package.json').version;


/**
 * Initialize the Stormpath client.
 *
 * @method
 * @private
 *
 * @param {Object} app - The express application.
 *
 * @return {Function} A function which accepts a callback.
 */
function initClient(app) {
  return function(next) {
    var userAgent = 'stormpath-express/' + version + ' ' + 'express/' + expressVersion;

    if (app.get('stormpathApiKeyId') && app.get('stormpathApiKeySecret')) {
      app.set('stormpathClient', new stormpath.Client({
        apiKey: new stormpath.ApiKey(
          app.get('stormpathApiKeyId'),
          app.get('stormpathApiKeySecret')
        ),
        userAgent: userAgent,
      }));
      next();
    } else if (app.get('stormpathApiKeyFile')) {
      stormpath.loadApiKey(app.get('stormpathApiKeyFile'), function(err, apiKey) {
        app.set('stormpathClient', new stormpath.Client({
          apiKey: apiKey,
          userAgent: userAgent,
        }));
        next();
      });
    }
  };
}


/**
 * Initialize the Stormpath application.
 *
 * @method
 * @private
 *
 * @param {Object} app - The express application.
 *
 * @return {Function} A function which accepts a callback.
 */
function initApplication(app) {
  return function(next) {
    app.get('stormpathClient').getApplication(app.get('stormpathApplication'), function(err, application) {
      if (err) {
        throw new Error("ERROR: Couldn't find Stormpath application.");
      }

      app.set('stormpathApplication', application);
      next();
    });
  };
}


/**
 * Initialize the Stormpath middleware.
 *
 * @method
 *
 * @param {Object} app - The express application.
 * @param {object} opts - A JSON hash of user supplied options.
 *
 * @return {Function} An express middleware.
 */
module.exports.init = function(app, opts) {
  opts = opts || {};

  async.series([
    helpers.initSettings(app, opts),
    helpers.checkSettings(app),
    initClient(app),
    initApplication(app),
  ]);

  // Initialize session middleware.
  app.use(session({
    cookieName: 'stormpathSession',
    requestKey: 'session',
    secret: app.get('stormpathSecretKey'),
    duration: app.get('stormpathSessionDuration'),
    cookie: {
      httpOnly: true,
      secure: app.get('stormpathEnableHttps'),
    }
  }));

  // Parse the request body.
  app.use(bodyParser.urlencoded({
    extended: true,
  }));

  // Initialize CSRF middleware.
  if(app.get('stormpathUseCSRF')){
      app.use(csrf());
  }

  return function(req, res, next) {
    async.series([
      function(callback) {
        helpers.getUser(req, res, callback);
      }
    ], function() {
      if (req.url.indexOf(req.app.get('stormpathRegistrationUrl')) === 0 && req.app.get('stormpathEnableRegistration')) {
        controllers.register(req, res);
      } else if (req.url.indexOf(req.app.get('stormpathLoginUrl')) === 0 && req.app.get('stormpathEnableLogin')) {
        controllers.login(req, res);
      } else if (req.url.indexOf(req.app.get('stormpathLogoutUrl')) === 0 && req.app.get('stormpathEnableLogout')) {
        controllers.logout(req, res);
      } else {
        next();
      }
    });
  };
};


/**
 * Expose the `loginRequired` middleware.
 *
 * @property loginRequired
 */
module.exports.loginRequired = authentication.loginRequired;


/**
 * Expose the `groupsRequired` middleware.
 *
 * @property groupsRequired
 */
module.exports.groupsRequired = authentication.groupsRequired;

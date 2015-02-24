var express = require('express');
var router = express.Router();

var http = require('superagent');
var prefix = require('superagent-prefix')('https://slack.com/api');

var _ = require('lodash');
var async = require('async');
var moment = require('moment');
var validator = require('validator');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Slack Commander' });
});

router.get('/api/auth.test', function (req, res, next) {
    //var token = req.query.token || 'xoxp-2204427564-2203717183-3809258833-92889a';
    var token = req.query.token || '';

    http.get('/auth.test')
        .use(prefix)
        .query({token: token})
        .end(function(response) {
            parseSlackApiResponse(response, function (error, data) {
                if (!error) {
                    res.json(data);
                } else {
                    next(error);
                }
            });
        });
});

router.get('/api/files.list', function (req, res, next) {
    var token = req.query.token || '';

    var page = req.query.page || 1;

    var ts_from = validator.isNumeric(req.query.ts_from) ? moment().subtract(Math.round(validator.toInt(req.query.ts_from)), 'days').unix() : 0;

    var ts_to = validator.isNumeric(req.query.ts_to) ? moment().subtract(Math.round(validator.toInt(req.query.ts_to)), 'days').unix() : moment().unix();

    http.get('/files.list')
        .use(prefix)
        .query({token: token})
        .query({page: page})
        .query({ts_from: ts_from})
        .query({ts_to: ts_to})
        .end(function (response) {
            parseSlackApiResponse(response, ['files', 'paging'], function (error, data) {
                console.log(JSON.stringify(data));

                res.json(data);
            });
        });
});

router.get('/api/files.delete', function (req, res, next) {
    var token = req.query.token || '';

    var min_age = validator.isNumeric(req.query.min_age) ? Math.round(validator.toInt(req.query.min_age)) : 30;

    var ts_to = moment().subtract(min_age, 'days').unix();

    var fileCount = 0;

    async.doWhilst(
        function (callback) {
            async.waterfall([
                function (callback) {
                    console.log("LOG :: Retrieving file list.");

                    // GET FILE LIST.
                    http.get('/files.list')
                        .use(prefix)
                        .query({token: token, ts_from: ts_to, ts_to: 0})
                        .end(function (response) {
                            parseSlackApiResponse(response, ['files', 'paging'], callback);
                        });
                },

                function (data, callback) {
                    fileCount = data.paging.total;

                    console.log("LOG :: There's %s files left to delete.", fileCount);

                    var fileToDeleteCount = 0;

                    if (data.files != null && _.isArray(data.files)) {
                        fileToDeleteCount = data.files.length;
                    }

                    console.log("LOG :: Deleting %s files.", fileToDeleteCount);

                    if (fileToDeleteCount > 0) {
                        // DELETE EVERY FILE IN FILE LIST.
                        async.each(data.files, function (file, callback) {
                            console.log("LOG :: Deleting file %s.", file.id);
                            http.get('/files.delete')
                                .use(prefix)
                                .query({token: token})
                                .query({file: file.id})
                                .end(function (response) {
                                    parseSlackApiResponse(response, callback);
                                });
                        }, callback);
                    } else {
                        callback();
                    }
                },

                function (callback) {
                    setTimeout(callback, 6000);
                }
            ], function (error) {
                callback(error);
            });
        },

        function () {
            // TEST TO SEE IF FILE LIST IS EMPTY;
            return fileCount > 0;
        },

        function (error) {
            res.send('OK! All files deleted!');
        }
    );
});

module.exports = router;

function parseSlackApiResponse(response, keysToReturn, callback) {
    if (keysToReturn != null && callback == null && _.isFunction(keysToReturn)) {
        callback = keysToReturn;
        keysToReturn = undefined;
    }

    if (response != null && response.body.ok != null && response.body.ok === true) {
        if (keysToReturn != null && _.isArray(keysToReturn)) {
            var data = {};

            _.forEach(keysToReturn, function (key) {
                data[key] = response.body[key];
            });

            callback(null, data);
        } else {
            callback();
        }
    } else {
        callback(new Error(response.error));
    }
}
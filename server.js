'use strict';

global.__base = __dirname + '/';

require('dotenv').config();

var use_https = true
var argv = require('minimist')(process.argv.slice(2))
var https = require('https')
var fs = require('fs')
var app = require('express')()
var _ = require('lodash')
var parser = require('xmldom').DOMParser
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest
var sendPostRequest = require('request').post


const bodyParser = require('body-parser');
const mongodb = require('mongodb');
const path = require('path');
const colors = require('colors/safe');

const ObjectID = mongodb.ObjectID;
const MongoClient = mongodb.MongoClient;
// const mongoCreds = require('./auth.json');
const mongoURL = process.env.MONGO_URI;
const handlers = {};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

////////// EXPERIMENT GLOBAL PARAMS //////////

var researchers = ['A4SSYO0HDVD4E', 'A9AHPCS83TFFE', 'A17XT5MJVPU37V'];
//////////////////////////////////////////////

var gameport;

if (argv.gameport) {
    gameport = argv.gameport;
    console.log('using port ' + gameport);
} else {
    gameport = process.env.PORT || 8883;
    console.log(`no gameport specified: using ${gameport}\nUse the --gameport flag to change`);
}


var serveFile = function (req, res) {
    var fileName = req.params[0];
    console.log('\t :: Express :: file requested: ' + fileName);
    return res.sendFile(fileName, { root: __dirname });
};

var UUID = function () {
    var baseName = (Math.floor(Math.random() * 10) + '' +
        Math.floor(Math.random() * 10) + '' +
        Math.floor(Math.random() * 10) + '' +
        Math.floor(Math.random() * 10));
    var template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    var id = baseName + '-' + template.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    return id;
};

function sendSingleStim(socket, data) {
    sendPostRequest(`${process.env.API_URL}/db/getsinglestim`, {
        json: {
            dbname: 'stimuli',
            colname: 'photodraw2',
            numTrials: 1,
            gameid: data.gameID
        }
    }, (error, res, body) => {
        if (!error && res.statusCode === 200) {
            socket.emit('stimulus', body);
        } else {
            console.log(`error getting stims: ${error} ${body}`);
            console.log(`falling back to local stimList`);
            socket.emit('stimulus', {
                stim: _.sampleSize(require('./photodraw2_meta.js'), 1)
            });
        }
    });
}

var writeDataToMongo = function (data) {
    sendPostRequest(
        `${process.env.API_URL}/db/insert`,
        { json: data },
        (error, res, body) => {
            if (!error && res.statusCode === 200) {
                console.log(`sent data to store`);
            } else {
                console.log(`error sending data to store: ${error} ${body}`);
            }
        }
    );
};

//Store.js File code

function makeMessage(text) {
    return `${colors.blue('[store]')} ${text}`;
}

function log(text) {
    console.log(makeMessage(text));
}

function error(text) {
    console.error(makeMessage(text));
}

function failure(response, text) {
    const message = makeMessage(text);
    console.error(message);
    return response.status(500).send(message);
}

function success(response, text) {
    const message = makeMessage(text);
    console.log(message);
    return response.send(message);
}

function mongoConnectWithRetry(delayInMilliseconds, callback) {
    MongoClient.connect(mongoURL, (err, connection) => {
        if (err) {
            console.error(`Error connecting to MongoDB: ${err}`);
            setTimeout(() => mongoConnectWithRetry(delayInMilliseconds, callback), delayInMilliseconds);
        } else {
            log('connected succesfully to mongodb');
            callback(connection);
        }
    });
}

function markAnnotation(collection, gameid, sketchid) {
    collection.update({ _id: ObjectID(sketchid) }, {
        $push: { games: gameid },
        $inc: { numGames: 1 }
    }, function (err, items) {
        if (err) {
            console.log(`error marking annotation data: ${err}`);
        } else {
            console.log(`successfully marked annotation. result: ${JSON.stringify(items)}`);
        }
    });
};



mongoConnectWithRetry(2000, (connection) => {

    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/index.html')
    })

    app.get('/*', (req, res) => {
        serveFile(req, res);
    });

    //POST to /db/insert
    app.post('/db/insert', (request, response) => {
        if (!request.body) {
            return failure(response, '/db/insert needs post request body');
        }
        console.log(`got request to insert into ${request.body.colname}`);

        const databaseName = request.body.dbname;
        const collectionName = request.body.colname;
        if (!collectionName) {
            return failure(response, '/db/insert needs collection');
        }
        if (!databaseName) {
            return failure(response, '/db/insert needs database');
        }

        const database = connection.db(databaseName);

        // Add collection if it doesn't already exist
        if (!database.collection(collectionName)) {
            console.log('creating collection ' + collectionName);
            database.createCollection(collectionName);
        }

        const collection = database.collection(collectionName);

        const data = _.omit(request.body, ['colname', 'dbname']);
        // log(`inserting data: ${JSON.stringify(data)}`);
        collection.insert(data, (err, result) => {
            if (err) {
                return failure(response, `error inserting data: ${err}`);
            } else {
                return success(response, `successfully inserted data. result: ${JSON.stringify(result)}`);
            }
        });
    });

    //POST to /db/getsinglestim
    app.post('/db/getsinglestim', (request, response) => {
        if (!request.body) {
            return failure(response, '/db/getsinglestim needs post request body');
        }
        console.log(`got request to get stims from ${request.body.dbname}/${request.body.colname}`);

        const databaseName = request.body.dbname;
        const collectionName = request.body.colname;
        if (!collectionName) {
            return failure(response, '/db/getsinglestim needs collection');
        }
        if (!databaseName) {
            return failure(response, '/db/getsinglestim needs database');
        }

        const database = connection.db(databaseName);
        const collection = database.collection(collectionName);

        // sort by number of times previously served up and take the first
        collection.aggregate([
            { $addFields: { numGames: { $size: '$games' } } },
            { $sort: { numGames: 1, shuffler_ind: 1 } },
            { $limit: 1 }
        ]).toArray((err, results) => {
            if (err) {
                console.log(err);
            } else {
                // Immediately mark as annotated so others won't get it too
                markAnnotation(collection, request.body.gameid, results[0]['_id']);
                response.send(results[0]);
            }
        });
    });

    //POST to /db/getbatchstims
    app.post('/db/getbatchstims', (request, response) => {
        if (!request.body) {
            return failure(response, '/db/getbatchstims needs post request body');
        }
        console.log(`got request to get stims from ${request.body.dbname}/${request.body.colname}`);

        const databaseName = request.body.dbname;
        const collectionName = request.body.colname;
        if (!collectionName) {
            return failure(response, '/db/getbatchstims needs collection');
        }
        if (!databaseName) {
            return failure(response, '/db/getbatchstims needs database');
        }

        const database = connection.db(databaseName);
        const collection = database.collection(collectionName);

        // get all records, up to some crazy number
        const maxRecords = 500;
        let records = collection.find()
        if (records.count() < maxRecords) {
            records = records.limit(maxRecords)
        }
        response.send(records.toArray())
        // note that the following might work, but I don't know what limit
        // does if you pass it a number greater than the total number of records

        // response.send(collection.limit(maxRecords).toArray())

        // also, not sure if we need to mark...
        // markAnnotation(collection, request.body.gameid, results[0]['_id']);
    });

    var io

    try {
        var privateKey = fs.readFileSync('/etc/letsencrypt/live/cogtoolslab.org/privkey.pem'),
            certificate = fs.readFileSync('/etc/letsencrypt/live/cogtoolslab.org/cert.pem'),
            intermed = fs.readFileSync('/etc/letsencrypt/live/cogtoolslab.org/chain.pem'),
            options = { key: privateKey, cert: certificate, ca: intermed },
            server = require('https').createServer(options, app).listen(gameport),
            io = require('socket.io')(server);
    } catch (err) {
        console.log("cannot find SSL certificates; falling back to http");
        var server = app.listen(gameport)
        io = require('socket.io')(server);
    }


    io.on('connection', function (socket) {

        // write data to db upon getting current data
        socket.on('currentData', function (data) {
            console.log('currentData received: ' + JSON.stringify(data));
            // Increment games list in mongo here
            writeDataToMongo(data);
        });

        socket.on('stroke', function (data) {
            console.log('stroke data received: ' + JSON.stringify(data));
            // Increment games list in mongo here
            writeDataToMongo(data);
        });

        socket.on('getStim', function (data) {
            sendSingleStim(socket, data);
        });

        // upon connecting, tell the client some metainfo
        socket.emit('onConnected', {
            gameid: UUID()
        });

    });
});

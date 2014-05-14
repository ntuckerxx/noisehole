var fs = require('fs');
var Collection = require('./collection.js');
var when = require('when');
var util = require('util');
var events = require('events');
var express = require('express'); //fixme: remove once stream server is not needed
var http = require('http');

function NoiseHole(params) {
    //fixme: the plugin should provide this
    this.data_dir = process.env['NOISEHOLE_DATA'];
    dbg("initing NoiseHole");
    var isDir = false;
    try {
        dbg("data_dir: " + this.data_dir);
        var stat = fs.statSync(this.data_dir);
        dbg("got stat");
        isDir = stat.isDirectory();
    } catch(e) {
        dbg("caught error: " + e);
    }

    if(!isDir) {
        throw new Error("please set env var NOISEHOLE_DATA to a directory I can have my way with");
    }

    this.name = 'noisehole';
    this.id = '7184981043';
    this.collection = new Collection(this.data_dir + "/collection.db");

    this.dirPath = params.dirPath;
}
util.inherits(NoiseHole, events.EventEmitter);

module.exports = NoiseHole;

function dbg(msg) {
    console.log("NoiseHole: " + msg);
}

NoiseHole.prototype.initialize = function() {
    dbg("initializing!");
    var self = this;
    return this.collection.setup().then(function() {
        // not sure if we should persist state that says we already added this path
        // for subsequent instantiations
        self.collection.addDir(self.dirPath);
    }).then(function() {
        self.emit('ready');
    });
}
//fixme: emit('refresh') when collection changes

NoiseHole.prototype.getArtists = function() {
    // return array of { "id": xxx, "title": xxx, "imageURL": xxx }
    return this.collection.getArtists().then(function(artists) {
        return artists.map(function(artist) {
            return { id: artist.id, title: artist.name };
        });
    });
};

NoiseHole.prototype.getAlbumsByArtist = function(artistName) {
    return this.collection.getAlbumsByArtist(artistName).then(function(albums) {
        return albums.map(function(album) {
            //fixme: doesn't seem like i should have to return artistName here
            return { id: album.id, title: album.name, artistName: artistName };
        });
    });
};

NoiseHole.prototype.getTracksByAlbum = function(artistName, albumName) {
    console.log("getting Tracks By Album: artistName = " + artistName + ", albumName = " + albumName);
    return this.collection.getTracksByAlbum(artistName, albumName);
};

NoiseHole.prototype.startStreamServer = function() {
    var self = this;
    if(!self.server) {
        try {
            var streamApp = express();
            self.server = http.createServer(streamApp);
            streamApp.get('/stream/:id', function(req, res) {
                self.collection.getTrackPath(req.params.id).then(function(path) {
                    res.sendfile(path);
                }).catch(function(err) {
                    dbg("/stream failed: " + err);
                });
            });
            self.server.listen(3333);
            dbg("stream server listening");
        } catch(e) {
            dbg("failed to start stream server: " + e);
        }
    }
}
NoiseHole.prototype.streamingURL = function(trackId) {
    this.startStreamServer();
    return "http://localhost:3333/stream/" + Number(trackId);
}

NoiseHole.prototype.getTrackData = function(trackId) {
    var self = this;
    return this.collection.getTrackData(trackId).then(function(data) {
        data.audioUrl = self.streamingURL(trackId)
        data.imageURL = "http://bandcamp.com/img/NoArt.png";
        return data;
    }).catch(function(err) {
        dbg("getTrackData failed: " + err);
    });
};

// resolve to some details which will then be passed to NoiseHole constructor
NoiseHole.login = function(params) {
    // for now, just pass params through.  may want to do some stuff like
    // validating the filesystem path ('dirPath')
    return when.resolve({
        plugin: 'noisehole',
        dirPath: params.dirPath
    });
};

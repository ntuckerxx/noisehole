/*
    Collection is backed by a SQLite database (a FileDB instance) and stores
    metadata about music files in a set of directories it cares about.

    Each track entry in the collection also holds metadata about the file
    so that decisions can be made about whether the track entry needs updating
    based on the results of an fs.stat
 */

var FileDB = require('./filedb');
var when = require('when');
var md5 = require('MD5');
var util = require('util');
var events = require('events');
var id3js = require('id3js');
var DirectoryMonitor = require('directorymonitor');
var fs = require('fs');

function Collection(dbfile) {
    dbg("initing dbfile " + dbfile);
    this.db = new FileDB(dbfile);
    this.db.debug(true);
    this.dm = new DirectoryMonitor(dbfile + "_directorymonitor.db");
    dbg("created DirectoryMonitor");

    var file_add = this.dm_file_add.bind(this);
    var file_delete = this.dm_file_delete.bind(this);
    var file_change = this.dm_file_change.bind(this);

    this.dm.on('file_add', file_add);
    this.dm.on('file_delete', file_delete);
    this.dm.on('file_change', file_change);
    this.dm.on('scancomplete', function(dir) { dbg("scan complete: " + dir);})

    events.EventEmitter.call(this);
    dbg("starting DirectoryMonitor");
    this.dm.start();
    dbg("constructed");
}
util.inherits(Collection, events.EventEmitter);

function dbg(msg) {
    console.log("Collection: " + msg);
}

// events: dir_add, dir_delete

Collection.prototype.setup = function() {
    var d = when.defer();
    var self = this;
    fs.readFile(__dirname + "/collection_init.sql", function(err, sql) {
        if(err) {
            d.reject(err);
        } else {
            self.db.exec(sql, function(err) {
                if(err) {
                    d.reject(err);
                } else {
                    d.resolve(true);
                }
            });
        }
    });
    return d.promise;
}

Collection.prototype.loadDirs = function() {
    var self = this;
    console.log("loadDirs: " + this.dirs);
    if(this.dirs) {
        return when.resolve(this.dirs);
    } else {
        return this.db.query("SELECT * FROM directories").then(function(rows) {
            //console.log("loadDirs rows: ", rows);
            return self.dirs = rows;
        })
    }
}
Collection.prototype.getDirs = function() {
    return this.loadDirs().then(function(dirs) {
        return dirs.map(function(d) { return d.path; });
    })
};

Collection.prototype.findDir = function(path) {
    return this.loadDirs().then(function(dirs) {
        var result = null;
        dirs.forEach(function(dir) {
            if(!result && dir.path == path.substring(0, dir.path.length)) {
                result = dir;
            }
        })
        return result;
    })
}
Collection.prototype.addDir = function(path) {
    var self = this;
    return this.findDir(path).then(function(dir) {
        //console.log("findDir result: " + dir);
        if(!dir) {
            self.dirs = null;
            return self.db.query("INSERT INTO directories (path) VALUES ($path)", {$path: path})
                .then(function() {
                    return self.dm.addDir(path);
                });
            return result;
        } else {
            return dir;
        }
    })
}
Collection.prototype.removeDir = function(path) {
    var self = this;
    return this.db.query("SELECT id FROM directories WHERE path = $path", {$path:path}).then(function(dirs) {
        if(dirs.length > 0) {
            dirid = dirs[0].id;
            return self.dm.removeDir(path).then(function() {
                return when.join(
                    self.db.query("DELETE FROM directories WHERE id = $dirid", {$dirid: dirid}),
                    self.db.query("DELETE FROM tracks WHERE directory_id = $dirid", {$dirid: dirid})
                )
            }).then(function() {
                self.emit('dir_delete', {path: path});
                return true;
            });
        }
    })
}

Collection.prototype.dm_file_add = function(path) {
    dbg("dm_file_add: " + path);
    this.updateFile(path);
}
Collection.prototype.dm_file_change = function(path) {
    dbg("dm_file_change: " + path);
    this.updateFile(path);
}
Collection.prototype.dm_file_delete = function(path) {
    dbg("dm_file_delete: " + path);
}


function cleantags(tags) {
    function cleanstring(str) {
        if(str) {
            return str.replace(/\u0000/g, '');
        }
        return str;
    }
    if(tags.v2 && tags.v2.image) {
        dbg("image " + tags.v2.image.type + ", " + tags.v2.image.mime + " for " +
            tags.title + " by " + tags.artist);
    }
    tags.title = cleanstring(tags.title);
    tags.artist = cleanstring(tags.artist);
    tags.album = cleanstring(tags.album);
    //dbg("id3 tags: " + JSON.stringify(tags));

    function gettag(name, tags) {
        return tags.v2[name] || tags.v1[name];
    }
    var tracknum = tags.v2.track || tags.v1.track;
    var m = tracknum.match(/([0-9]+)(\/[0-9]+)?/);
    if(m) {
        // match "12" or "12/16"
        tags.track = Number(m[1]);
    }

    dbg("id3 tracknum = " + tags.track + " for " + tags.title);
    return tags;
}

function getid3(path) {
    var d = when.defer();
    id3js({file: path, type: id3js.OPEN_LOCAL}, function(err, tags) {
        if(err) d.reject(err);
        else d.resolve(tags);
    });

    return d.promise.then(function(data) {
        return cleantags(data);
    });
}

Collection.prototype.updateFile = function(path) {
    var self = this;
    var d = when.defer();
    this.isCollectionFile(path).then(function(result){
        if(result) {
            return getid3(path).then(function(tags) {
                return self.storeTrackInfo(path, tags);
            })
        } else {
            dbg("not a collection file: " + path);
            d.resolve(true);
        }
    });
    return d.promise;
}

Collection.prototype.isCollectionFile = function(path) {
    //fixme: should be a more sophisticated check
    return when.resolve(path.match(/\.mp3$/));
}

Collection.prototype.storeTrackInfo = function(path, tags) {
    var d = when.defer();
    var self = this;

    this.findDir(path).then(function(dir) {
        console.log("storeTrackInfo findDir result: ", dir);
        if(dir) {
            var subpath = path.substring(dir.path.length);
            var path_hash = md5(subpath);

            // find the track entry corresponding to that dir id and subpath IFF its stathash is different
            self.db.query("SELECT * FROM tracks WHERE directory_id = $dir_id AND path_hash = $path_hash AND path = $path",
                {
                    $dir_id : dir.id,
                    $path_hash : path_hash,
                    $path : path
                }).then(function(result) {
                    var match = null;
                    for(var i=0; i<result.length; i++) {
                        if(result[i].subpath == subpath) {
                            match = result[i];
                            break;
                        }
                    }
                    if(match) {
                        console.log("updating id3 for " + path);
                        //update it
                        d.resolve(
                            self.db.query("UPDATE tracks SET title = $title WHERE id = $id",
                                {
                                    $id : match.id,
                                    $title : tags.title
                                }
                            )
                        );
                    } else {
                        console.log("track query produced " + result.length + " results but none matched subpath " + subpath);
                        //insert it
                        d.resolve(
                            self.db.query(
                                "INSERT INTO track_album_artist " +
                                "(artist_name, album_name, directory_id, path, path_hash, title, track_num)" +
                                "VALUES (" +
                                "$artist," +
                                "$album," +
                                "$directory_id," +
                                "$path," +
                                "$path_hash," +
                                "$title," +
                                "$track_num)",
                            {
                                $artist: tags.artist,
                                $album: tags.album,
                                $title: tags.title,
                                $directory_id: dir.id,
                                $path: subpath,
                                $path_hash: path_hash,
                                $track_num: tags.track
                            })
                        );
                    }

                    d.resolve(result.length > 0 ? result[0] : false);
                })
            //console.log("found dir: ", {path: path, dirpath: dir.path, subpath: subpath});
            d.resolve(false);

        } else {
            d.resolve(false);
        }
    })

    return d.promise;
}

Collection.prototype.deleteTrack = function(path) {
    var d = when.defer();
    d.resolve("fixme"); //fixme
    return d;
};

Collection.prototype.getArtists = function() {
    return this.db.query("SELECT id,name FROM artists");
}

Collection.prototype.getAlbumsByArtist = function(artistName) {
    return this.db.query("SELECT " +
                        "albums.name, albums.id " +
                        "FROM tracks " +
                        "JOIN artists ON artists.id = tracks.artist_id " +
                        "JOIN albums ON albums.id = tracks.album_id " +
                        "WHERE artists.name = $artistName " +
                        "GROUP BY albums.id",
        { $artistName : artistName });
};

Collection.prototype.getTracksByAlbum = function(artistName, albumName) {
    return this.db.query("SELECT " +
                        "tracks.title, tracks.id, tracks.seq AS trackNum " +
                        "FROM tracks " +
                        "JOIN artists ON artists.id = tracks.artist_id " +
                        "JOIN albums ON albums.id = tracks.album_id " +
                        "WHERE artists.name = $artistName " +
                        "  AND albums.name = $albumName " +
                        "ORDER BY tracks.seq",
        {
            $artistName : artistName,
            $albumName : albumName,
        });
};


Collection.prototype.getTrackData = function(trackId) {
    return this.db.query("SELECT " +
        "tracks.id, " +
        "tracks.title, " +
        "tracks.duration, " +
        "tracks.path, " +
        "artists.name AS artistName, " +
        "artists.id AS artistId, " +
        "albums.name AS albumName, " +
        "albums.id AS albumId, " +
        "tracks.seq AS trackNumber " +
                        "FROM tracks " +
                        "JOIN artists ON artists.id = tracks.artist_id " +
                        "JOIN albums ON albums.id = tracks.album_id " +
                        "WHERE tracks.id = $trackId ",

                {
                    $trackId : trackId
                }).catch(function(err) {
                    console.log("ERROR in getTrackData: " + err);
                });
};

Collection.prototype.getTrackPath = function(trackId) {
    return this.db.query("SELECT tracks.path AS subpath, directories.path AS root FROM tracks JOIN directories ON directories.id = tracks.directory_id WHERE tracks.id = $trackId ",
                { $trackId : trackId }).then(function(result) {
                    return result[0].root + result[0].subpath;
                }).catch(function(err) {
                    dbg("getTrackPath failed: " + err);
                });
};

Collection.prototype.getId3 = function(trackId) {
    return this.getTrackPath(trackId).then(function(path) {
        return getid3(path);
    });
};

module.exports = Collection;

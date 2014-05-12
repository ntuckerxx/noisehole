var test = require('tap').test;
var Collection = require('../lib/collection.js');
var fs = require('fs');
var when = require('when');

//fixme: these tests need setup/cleanup so they don't rely on previous state
// i've noticed that switching between running them via 'tape' and 'tapr', they
// occasionally fail, and i think that's related

function fstat(path) {
    var d = when.defer();
    fs.stat(path, function(err, stat) {
        if(err) d.reject(err);
        else d.resolve(stat);
    });
    return d.promise;
}

function touch(path) {
    var d = when.defer();
    fs.open(path, "w+", function(err, f) {
        fs.close(f);
        d.resolve();
    });
    return d.promise;
}

var TEST_DB_NAME = "testcollection.db"
test("can create a collection", function(t) {
    function setup() {
        var d = when.defer();
        d.resolve(true);
        return d.promise;
    }

    setup().then(function() {
        var coll = new Collection(TEST_DB_NAME);

        t.test("initialize the db", function(t) {
            t.plan(1);
            coll.setup().then(function() {
                t.ok(true, "ok");
            })
        });
        t.test("add and find a directory", function(t) {
            t.plan(6);
            coll.addDir('/').then(function() {
                t.ok(true, "added dir");
                return coll.findDir('/foobar')
            }).then(function(dir) {
                t.ok(dir, "found dir");
                console.log("findDir result: ", dir);
            }).then(function() {
                fstat('/tmp').then(function(stat) {
                    console.log("got a stat: ", stat);
                    var h = Collection.statHash(stat);
                    t.ok(h, "calculate stat hash");
                    coll.checkTrackHashChanged('/tmp', stat).then(function(result) {
                        console.log("track hash changed result: ", result);
                    });
                })
            }).then(function() {
                fstat('/tmp/foob').then(function(stat) {
                    coll.storeTrackInfo('/tmp/foob', stat).then(function() {
                        t.ok(true, "trackinfo stored");
                    });
                })
            }).then(function() {
                coll.addDir('/blahblah').then(function() {
                    t.ok(true, "added dir");
                }).then(function() {
                    coll.removeDir('/blahblah').then(function() {
                        t.ok(true, "removed dir");
                    })
                })
            });
        });
/*
        t.test("get and check a stat hash", function(t) {
            t.plan(1);
            fstat('/tmp').then(function(stat) {
                console.log("got a stat: ", stat);
                var h = Collection.statHash(stat);
                t.ok(h, "calculate stat hash");
                coll.checkTrackHashChanged('/tmp', stat).then(function(result) {
                    console.log("track hash changed result: ", result);
                });
            })
        });
*/
        t.test("cleanup", function(t) {
            t.plan(1);
            t.ok(true, "cleanup");
        });
        t.end();

    });
});

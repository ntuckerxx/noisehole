// very light promise-y wrapper around sqlite.  to be fleshed out further
/*
 *   db = new FileDB('blah.db');
 *   db.query("select * from foo").then(function(results) {...})
 */

var sqlite = require('sqlite3');
var when = require('when');

function FileDB(dbfile) {
    console.log("opening sqlite db " + dbfile);
    this.db = new sqlite.Database(dbfile);
    this._debug = false;

    var self = this;
    this.db.on('trace', function(arg) { if(self._debug) console.log("SQL:", arg);});

    console.log("opened db");
}

FileDB.prototype.serialize = function(fn) {
    this.db.serialize(fn);
}

FileDB.prototype.debug = function(val) {
    this._debug = val;
}
FileDB.prototype.exec = function(sql, cb) {
    console.log("filedb executing sql: " + (typeof sql));
    return this.db.exec(sql.toString(), cb);
}
FileDB.prototype.query = function() {
    var args = [].slice.call(arguments);
    var d = when.defer();
    var self = this;
    var sql = args.shift();
    var params = args.shift();

    //if(self._debug) console.log("SQL: " + sql);

    self.db.serialize(function() {
        var queryargs = [sql];
        if(typeof params == 'object') {
            queryargs.push(params);
        }

        callback = function(err, rows) {

            //if(self._debug) console.log("SQL result: " + err + "/" + rows);

            if (err) {
                return d.reject(err);
            }

            return d.resolve(rows);
        };

        queryargs.push(callback);
        self.db.all.apply(self.db, queryargs);
        /*
        self.db.all(sql, params, function(err, rows) {

            if(self._debug) console.log("SQL result: " + err + "/" + rows);

            if (err) {
                return d.reject(err);
            }

            return d.resolve(rows);
        });*/
    });
    return d.promise;
}

module.exports = FileDB;

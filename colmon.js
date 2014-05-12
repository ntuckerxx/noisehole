require('./lib/debugport.js')(4001);
var Collection = require('./lib/collection.js');

collection = new Collection("colmon.db");
collection.setup();

// some utils to call from debugport.  nice ui.
add = function add(path) { collection.addDir(path); }
remove = function remove(path) { collection.removeDir(path); }
rescan = function rescan(path) { cu.scan(); }

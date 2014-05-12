var events = require('events');
var when = require('when');
var util = require('util');

function MockCollection() {
    this.paths = [].slice.call(arguments);

    events.EventEmitter.call(this);
}
util.inherits(MockCollection, events.EventEmitter);

MockCollection.prototype.getDirs = function() {
    return when.resolve(this.paths);
}
MockCollection.prototype.testAddDir = function(path) {
    this.paths.push(path);
    this.emit('dir_add', {path: path})
}
MockCollection.prototype.checkTrackHashChanged = function() {
    return when.resolve(true);
}
MockCollection.prototype.storeTrackInfo = function(info) {
    return when.resolve(true);
}

module.exports = MockCollection;

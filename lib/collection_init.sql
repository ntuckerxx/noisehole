CREATE TABLE IF NOT EXISTS directories (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, seq INTEGER);

CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER,
    album_id INTEGER,
    title TEXT,
    duration INTEGER,
    seq INTEGER,
    directory_id INTEGER NOT NULL,
    path TEXT NOT NULL UNIQUE,
    path_hash BLOB NOT NULL);

CREATE INDEX IF NOT EXISTS artist_id ON tracks (artist_id);
CREATE INDEX IF NOT EXISTS album_id ON tracks (album_id);
CREATE INDEX IF NOT EXISTS directory_id ON tracks (directory_id);
CREATE TABLE IF NOT EXISTS albums (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
CREATE TABLE IF NOT EXISTS artists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);

CREATE VIEW IF NOT EXISTS track_album_artist AS
    SELECT artists.name AS artist_name,
        albums.name AS album_name,
        tracks.directory_id AS directory_id,
        tracks.path AS path,
        tracks.path_hash AS path_hash,
        tracks.title AS title,
        tracks.seq AS track_num
    FROM tracks
    JOIN artists ON tracks.artist_id = artists.id
    JOIN albums ON tracks.album_id = albums.id;

/* fixme: do we need another trigger for UPDATE ? */
CREATE TRIGGER IF NOT EXISTS insert_track_info
     INSTEAD OF INSERT ON track_album_artist
BEGIN
    INSERT INTO artists (name)
        SELECT NEW.artist_name
    WHERE NOT EXISTS (
        SELECT id FROM artists WHERE name = NEW.artist_name
    );

    INSERT INTO albums (name)
        SELECT NEW.album_name
    WHERE NOT EXISTS (
        SELECT id FROM albums WHERE name = NEW.album_name
    );

    INSERT INTO tracks (directory_id, path, path_hash, title, seq, artist_id, album_id)
        SELECT NEW.directory_id,
            NEW.path,
            NEW.path_hash,
            NEW.title,
            NEW.track_num,
            artists.id AS artist_id,
            albums.id AS album_id
            FROM artists JOIN albums ON artists.name = NEW.artist_name AND albums.name = NEW.album_name
    WHERE NOT EXISTS (
        SELECT 1 FROM tracks WHERE directory_id = NEW.directory_id AND path_hash = NEW.path_hash AND path = NEW.path
    );
END;

/*
INSERT INTO track_album_artist
    (artist_name, album_name, directory_id, path, path_hash, title)
VALUES (
    'someartist',
    'somealbum',
    123,
    '/some/path',
    'somepathhash',
    'sometitle'
);*

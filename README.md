# File Archiver for Toonboom Harmony Scripts

A JavaScript/Qt-Script utility module that provides a wrapper around the 7-Zip command-line tool for Toonboom Harmony animation software, enabling file compression and decompression operations both synchronously and asynchronously.

## Features

- Compress files and folders to 7z archives
- Decompress 7z archives
- Synchronous and asynchronous operations
- Progress tracking with callbacks
- Cross-platform support (Windows, macOS, Linux)
- Automatic 7-Zip binary detection and download (Windows)
- File filtering support

## Requirements

- Toonboom Harmony (any version with scripting support)
- 7-Zip binary:
  - **Windows**: Automatically downloaded if not present
  - **macOS/Linux**: Usually bundled with Harmony or available via package manager

## Installation

1. Copy `sevenzip.js` to your Harmony scripts folder:
   - **Windows**: `%APPDATA%/Toon Boom Animation/Toon Boom Harmony [version]/scripts/`
   - **macOS**: `~/Library/Preferences/Toon Boom Animation/Toon Boom Harmony [version]/scripts/`
   - **Linux**: `~/.config/Toon Boom Animation/Toon Boom Harmony [version]/scripts/`

2. Include the module in your script:
```javascript
var SevenZip = require("sevenzip.js").SevenZip;
```

## Usage

### Basic Synchronous Compression

```javascript
var SevenZip = require("sevenzip.js").SevenZip;

// Compress a folder
var archiver = new SevenZip(
  this,                           // Parent context
  "/path/to/source/folder",       // Source path
  "/path/to/destination.7z"       // Destination archive
);

var success = archiver.zip();
if (success) {
  MessageLog.trace("Compression successful!");
} else {
  MessageLog.trace("Compression failed!");
}
```

### Basic Synchronous Decompression

```javascript
var SevenZip = require("sevenzip.js").SevenZip;

// Decompress an archive
var archiver = new SevenZip(
  this,                           // Parent context
  "/path/to/archive.7z",          // Source archive
  "/path/to/destination/folder"   // Destination folder
);

var success = archiver.unzip();
if (success) {
  MessageLog.trace("Decompression successful!");
}
```

### Asynchronous Compression with Progress

```javascript
var SevenZip = require("sevenzip.js").SevenZip;

function onStart() {
  MessageLog.trace("Compression started!");
}

function onProgress(percent) {
  MessageLog.trace("Progress: " + percent + "%");
}

function onEnd(success) {
  MessageLog.trace("Compression " + (success ? "completed!" : "failed!"));
}

var archiver = new SevenZip(
  this,                    // Parent context
  ["/path/to/folder1",     // Multiple source paths (array)
   "/path/to/folder2"],
  "/path/to/archive.7z",   // Destination
  onStart,                 // Process start callback
  onProgress,              // Progress callback (0-100)
  onEnd                    // Process end callback
);

archiver.zipAsync();
```

### Asynchronous Decompression

```javascript
var SevenZip = require("sevenzip.js").SevenZip;

var archiver = new SevenZip(
  this,
  "/path/to/archive.7z",
  "/path/to/destination",
  function() { MessageLog.trace("Started!"); },
  function(p) { MessageLog.trace(p + "%"); },
  function(success) { MessageLog.trace("Done: " + success); }
);

archiver.unzipAsync();
```

### With File Filtering

```javascript
var SevenZip = require("sevenzip.js").SevenZip;

// Exclude backup files from compression
var archiver = new SevenZip(
  this,
  "/path/to/source",
  "/path/to/archive.7z",
  null,        // processStartCallback
  null,        // progressCallback
  null,        // processEndCallback
  null,        // debugCallback
  "backups"    // filter - excludes files/folders matching this pattern
);

archiver.zip();
```

### With Error Handling

```javascript
var SevenZip = require("sevenzip.js").SevenZip;

function onError(error) {
  MessageLog.trace("Error occurred: " + error.message);
}

var archiver = new SevenZip(
  this,
  "/path/to/source",
  "/path/to/archive.7z",
  null,        // processStartCallback
  null,        // progressCallback
  null,        // processEndCallback
  null,        // debugCallback
  null,        // filter
  false,       // debug
  onError      // errorCallback
);

archiver.zipAsync();
```

### Delete Source After Compression

```javascript
var SevenZip = require("sevenzip.js").SevenZip;

var archiver = new SevenZip(
  this,
  "/path/to/source",
  "/path/to/archive.7z"
);

// Pass true to delete source files after successful compression
archiver.zipAsync(true);
```

### Debug Mode

```javascript
var SevenZip = require("sevenzip.js").SevenZip;

var archiver = new SevenZip(
  this,
  "/path/to/source",
  "/path/to/archive.7z",
  null, null, null, null, null,
  true    // Enable debug mode - logs 7zip output to MessageLog
);

archiver.zip();
```

## API Reference

### Constructor

```javascript
new SevenZip(parentContext, sources, destination, [processStartCallback],
             [progressCallback], [processEndCallback], [debugCallback],
             [filter], [debug], [errorCallback])
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `parentContext` | Object | The `this` context for callback execution |
| `sources` | string \| string[] | Source path(s) for compression, or archive path for extraction |
| `destination` | string | Destination path for the archive or extraction folder |
| `processStartCallback` | function | Called when async operation starts |
| `progressCallback` | function(number) | Called with progress percentage (0-100) |
| `processEndCallback` | function(boolean) | Called when operation ends with success status |
| `debugCallback` | function(string) | Called with stdout/stderr output |
| `filter` | string | Pattern to exclude files (e.g., "*.bak", "temp") |
| `debug` | boolean | Enable debug output to MessageLog (default: false) |
| `errorCallback` | function(Error) | Called when an error occurs |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `zip()` | boolean | Synchronous compression, returns success status |
| `zipAsync([deleteSource])` | void | Asynchronous compression |
| `unzip()` | boolean | Synchronous decompression, returns success status |
| `unzipAsync()` | void | Asynchronous decompression |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `version` | number | Current 7-Zip version (e.g., 23.01) |
| `binPath` | string | Path to the 7-Zip binary |

## Supported Platforms

- Windows (x64)
- macOS (Intel and Apple Silicon)
- Linux (x64)

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

mihgehl - [github.com/mihgehl](https://github.com/mihgehl)

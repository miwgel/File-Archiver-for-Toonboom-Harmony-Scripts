/**
 * @file File zipper and unzipper utility for Toonboom Harmony Scripting Interface
 * @version 24.1
 * @copyright mihgehl < github.com/mihgehl >
 * @author mihgehl < github.com/mihgehl >
 */

/**
 * Creates a new SevenZip instance for file compression/decompression operations
 * @constructor
 * @param {Object} parentContext - The parent context for callback execution (usually 'this' from the caller)
 * @param {string|string[]} sources - Source path(s) to be compressed or archive path to be extracted
 * @param {string} destination - Destination path for the compressed archive or extraction folder
 * @param {processStartCallback} [processStartCallback] - Called when async process starts
 * @param {progressCallback} [progressCallback] - Called when async progress is updated (0-100)
 * @param {processEndCallback} [processEndCallback] - Called when async process ends
 * @param {debugCallback} [debugCallback] - Called with stdout/stderr output for debugging
 * @param {string} [filter] - Filter pattern for including/excluding files (e.g., "*.txt", "backups")
 * @param {boolean} [debug=false] - Enable debug output to MessageLog
 * @param {errorCallback} [errorCallback] - Called when an error occurs during operation
 * @throws {Error} If sources or destination are not provided
 * @example
 * // Synchronous compression
 * var archiver = new SevenZip(this, "/path/to/folder", "/path/to/archive.7z");
 * var success = archiver.zip();
 *
 * @example
 * // Asynchronous compression with progress
 * var archiver = new SevenZip(
 *   this,
 *   ["/path/to/folder1", "/path/to/folder2"],
 *   "/path/to/archive.7z",
 *   function() { MessageLog.trace("Started!"); },
 *   function(progress) { MessageLog.trace("Progress: " + progress + "%"); },
 *   function(success) { MessageLog.trace("Done! Success: " + success); }
 * );
 * archiver.zipAsync();
 */
function SevenZip(
  parentContext,
  sources,
  destination,
  processStartCallback,
  progressCallback,
  processEndCallback,
  debugCallback,
  filter,
  debug,
  errorCallback
) {
  if (typeof parentContext === "undefined") var parentContext = null;
  if (typeof sources === "undefined") var sources = null;
  if (typeof destination === "undefined") var destination = null;
  if (typeof processStartCallback === "undefined") var processStartCallback = null;
  if (typeof progressCallback === "undefined") var progressCallback = null;
  if (typeof processEndCallback === "undefined") var processEndCallback = null;
  if (typeof debugCallback === "undefined") var debugCallback = null;
  if (typeof filter === "undefined") var filter = undefined;
  if (typeof debug === "undefined") var debug = false;
  if (typeof errorCallback === "undefined") var errorCallback = null;

  this.parentContext = parentContext;
  this.sources = sources;
  this.destination = destination;
  this.processStartCallback = processStartCallback;
  this.progressCallback = progressCallback;
  this.processEndCallback = processEndCallback;
  this.debugCallback = debugCallback;
  this.filter = filter;
  this.debug = debug;
  this.errorCallback = errorCallback;

  // Validate required parameters
  this._validateParams();

  this.command = [];
  this.process = new QProcess();

  // Store signal connection references for cleanup
  this._connections = {
    readyReadStdOut: null,
    readyReadStdErr: null,
    started: null,
    finished: null
  };
}

/**
 * Disconnects all signal connections to prevent memory leaks
 * Call this before reusing the process or when done
 */
SevenZip.prototype._disconnectSignals = function () {
  try {
    if (this._connections.readyReadStdOut) {
      this.process.readyReadStandardOutput.disconnect(this, this._connections.readyReadStdOut);
      this._connections.readyReadStdOut = null;
    }
    if (this._connections.readyReadStdErr) {
      this.process.readyReadStandardError.disconnect(this, this._connections.readyReadStdErr);
      this._connections.readyReadStdErr = null;
    }
    if (this._connections.started) {
      this.process["started()"].disconnect(this, this._connections.started);
      this._connections.started = null;
    }
    if (this._connections.finished) {
      this.process["finished(int)"].disconnect(this, this._connections.finished);
      this._connections.finished = null;
    }
  } catch (error) {
    this.log("Error disconnecting signals: " + error);
  }
};

/**
 * Validates required parameters and throws errors for invalid inputs
 * @private
 */
SevenZip.prototype._validateParams = function () {
  // Validate sources
  if (this.sources === null || this.sources === undefined) {
    throw new Error("SevenZip: sources parameter is required");
  }

  // Validate destination
  if (this.destination === null || this.destination === undefined || this.destination === "") {
    throw new Error("SevenZip: destination parameter is required");
  }

  // Validate callbacks are functions if provided
  var callbacks = [
    { name: "processStartCallback", value: this.processStartCallback },
    { name: "progressCallback", value: this.progressCallback },
    { name: "processEndCallback", value: this.processEndCallback },
    { name: "debugCallback", value: this.debugCallback },
    { name: "errorCallback", value: this.errorCallback }
  ];

  for (var i = 0; i < callbacks.length; i++) {
    var cb = callbacks[i];
    if (cb.value !== null && cb.value !== undefined && typeof cb.value !== "function") {
      throw new Error("SevenZip: " + cb.name + " must be a function");
    }
  }
};

/**
 * Called when async zipping or unzipping process is started
 * @callback processStartCallback
 */

/**
 * Called when async zipping or unzipping progress is updated
 * @callback progressCallback
 * @param {number} progressValue - Current progress percentage (0-100)
 */

/**
 * Called when async zipping or unzipping process ends
 * @callback processEndCallback
 * @param {boolean} success - Whether the operation completed successfully
 */

/**
 * Called with debug output from the process
 * @callback debugCallback
 * @param {string} output - The stdout or stderr output from 7zip
 */

/**
 * Called when an error occurs during operation
 * @callback errorCallback
 * @param {Error} error - The error that occurred
 */

/**
 * Get current 7zip version
 */
Object.defineProperty(SevenZip.prototype, "version", {
  /**
   * Returns current 7zip version
   * @returns { float } Current 7zip Version
   */
  get: function () {
    try {
      var getSevenZipVersion = function (binPath) {
        var versionCheckProcess = new QProcess();
        versionCheckProcess.start(binPath);
        versionCheckProcess.waitForFinished(10000);
        var regex = /(7-Zip (\d+\.\d+))|(7-Zip \(z\) (\d+\.\d+)) |(\d+\.\d+)/;
        var match = new QTextStream(versionCheckProcess.readAllStandardOutput())
          .readAll()
          .match(regex);
        if (match) {
          for (var i = 0; i < match.length; i++) {
            var floatValue = parseFloat(match[i]);
            if (!isNaN(floatValue)) return floatValue;
          }
        }
      };
      if (typeof SevenZip.__proto__.version === "undefined") {
        var sevenZipVersion = getSevenZipVersion(this.binPath);
        SevenZip.__proto__.version = sevenZipVersion;
        return sevenZipVersion;
      } else {
        return SevenZip.__proto__.version;
      }
    } catch (error) {
      MessageLog.trace(error);
    }
  },
});

/**
 * Get 7zip binary path
 */
Object.defineProperty(SevenZip.prototype, "binPath", {
  /**
   * Returns current 7zip binary path
   * @returns { String } Current 7zip binary path
   */
  get: function () {
    if (typeof SevenZip.__proto__.binPath === "undefined") {
      if (about.isMacArch() || about.isLinuxArch()) {
        var szpath = [
          specialFolders.bin + "/bin_3rdParty/7za",
          specialFolders.bin + "/../../external/macosx/p7zip/7za",
        ];

        for (var i = 0; i < szpath.length; i++) {
          var sevenzipbin = new File(szpath[i]);
          if (sevenzipbin.exists) {
            SevenZip.__proto__.binPath = sevenzipbin.fullName;
            return sevenzipbin.fullName;
          }
        }
      } else if (about.isWindowsArch()) {
        var sevenzipbin = new QFile(
          specialFolders.userScripts + "/packages/7zip/7za.exe"
        );

        if (!sevenzipbin.exists()) {
          var dirPath = new QFileInfo(sevenzipbin.fileName()).dir().path();

          // Clean 7zip folder
          new QDir(dirPath).removeRecursively();
          new QDir(dirPath).mkpath(dirPath);

          var download7zProcess = new QProcess();
          var download7zCommand = [
            "/K",
            "powershell (New-Object Net.WebClient).DownloadFile('https://www.7-zip.org/a/7zr.exe', '7zr.exe') & " +
              "powershell (New-Object Net.WebClient).DownloadFile('https://www.7-zip.org/a/7z2300-extra.7z', '7z-extra.7z') & " +
              "7zr.exe -y e 7z-extra.7z x64/7za.exe & " +
              "if exist 7zr.exe del 7zr.exe & " +
              "if exist 7z-extra.7z del 7z-extra.7z &" +
              "exit",
          ];

          download7zProcess.setWorkingDirectory(dirPath);
          download7zProcess.start("cmd.exe", download7zCommand);
          download7zProcess.waitForFinished(50000);
          if (sevenzipbin.exists()) {
            SevenZip.__proto__.binPath = sevenzipbin.fileName();
            return sevenzipbin.fileName();
          }
        } else {
          SevenZip.__proto__.binPath = sevenzipbin.fileName();
          return sevenzipbin.fileName();
        }
      }
      // MessageBox.critical("cannot find 7zip to compress template. aborting");
      // throw new Error("cannot find 7zip");
    } else {
      return SevenZip.__proto__.binPath;
    }
  },
});

var sizeCalculator = function (sourcePath) {
  var totalSize = 0;
  var sourceInfo = new QFileInfo(sourcePath);

  if (sourceInfo.isFile()) {
    totalSize = sourceInfo.size();
  } else if (sourceInfo.isDir()) {
    var fileInfoList = new QDir(sourcePath).entryInfoList(
      QDir.Filters(QDir.Files | QDir.Dirs | QDir.NoDotAndDotDot)
    );
    for (var entry in fileInfoList) {
      totalSize += sizeCalculator(fileInfoList[entry].filePath());
    }
  }
  return totalSize;
};

/**
 * Compresses a file or directory without blocking the UI
 * @param {boolean} deleteSource Optional: If true, deletes source files after successful compression
 */
SevenZip.prototype.zipAsync = function (deleteSource) {
  var self = this;

  try {
    // Disconnect any previous signal connections to prevent duplicates
    this._disconnectSignals();

    this.command = ["a", this.destination];

    // Normalize sources to array and add to command
    var sourcesArray = Array.isArray(this.sources) ? this.sources : [this.sources];
    for (var i = 0; i < sourcesArray.length; i++) {
      this.command.push(sourcesArray[i]);
    }

    this.command.push(
      "-bsp1" // Requires 7zip 15.09 or higher
    );

    if (this.filter !== undefined && this.filter !== "") {
      this.command.push("-xr!" + this.filter);
    }

    // Progress callback for stdout
    if (!this.debug && typeof this.progressCallback === "function") {
      this._connections.readyReadStdOut = function () {
        var output7z = new QTextStream(self.process.readAllStandardOutput())
          .readAll()
          .match(/\d+(?:\.\d+)?%/);
        if (output7z && output7z.length > 0) {
          self.progressCallback.call(self.parentContext, parseInt(output7z[0]));
        }
      };
      this.process.readyReadStandardOutput.connect(this, this._connections.readyReadStdOut);
    }

    // Process started callback
    if (typeof this.processStartCallback === "function") {
      this._connections.started = function () {
        self.processStartCallback.call(self.parentContext);
      };
      this.process["started()"].connect(this, this._connections.started);
    }

    // Process finished callback
    if (typeof this.processEndCallback === "function" || deleteSource) {
      this._connections.finished = function () {
        var success = new QFile(self.destination).exists();

        // Clean up signal connections
        self._disconnectSignals();

        if (typeof self.processEndCallback === "function") {
          self.processEndCallback.call(self.parentContext, success);
        }

        if (deleteSource && success) {
          for (var j = 0; j < sourcesArray.length; j++) {
            var pathToRemove = sourcesArray[j];
            var pathInfo = new QFileInfo(pathToRemove);

            if (pathInfo.isDir()) {
              self.log("Removing folder: " + pathToRemove);
              new QDir(pathToRemove).removeRecursively();
            } else if (pathInfo.isFile()) {
              self.log("Removing file: " + pathToRemove);
              new QFile(pathToRemove).remove();
            }
          }
        }
      };
      this.process["finished(int)"].connect(this, this._connections.finished);
    }

    // Debug callback for stdout and stderr
    if (typeof this.debugCallback === "function") {
      if (!this._connections.readyReadStdOut) {
        this._connections.readyReadStdOut = function () {
          var currentStdOut = new QTextStream(
            self.process.readAllStandardOutput()
          ).readAll();
          self.debugCallback.call(self.parentContext, currentStdOut);
        };
        this.process.readyReadStandardOutput.connect(this, this._connections.readyReadStdOut);
      }

      this._connections.readyReadStdErr = function () {
        var currentErrOut = new QTextStream(
          self.process.readAllStandardError()
        ).readAll();
        self.debugCallback.call(self.parentContext, currentErrOut);
      };
      this.process.readyReadStandardError.connect(this, this._connections.readyReadStdErr);
    }

    this.process.start(this.binPath, this.command);
  } catch (error) {
    this.log(error);
    if (typeof this.errorCallback === "function") {
      this.errorCallback.call(this.parentContext, error);
    }
  }
};

/**
 * Compresses a file or directory blocking the UI
 * @returns {boolean} True if compression was successful
 */
SevenZip.prototype.zip = function () {
  try {
    this.command = ["a", this.destination];

    // Normalize sources to array and add to command
    var sourcesArray = Array.isArray(this.sources) ? this.sources : [this.sources];
    for (var i = 0; i < sourcesArray.length; i++) {
      // Add /* suffix for directories to avoid zipping the outer folder
      var sourcePath = sourcesArray[i];
      var sourceInfo = new QFileInfo(sourcePath);
      if (sourceInfo.isDir()) {
        this.command.push(sourcePath + "/*");
      } else {
        this.command.push(sourcePath);
      }
    }

    this.command.push("-bsp1");

    if (this.filter !== undefined && this.filter !== "") {
      this.command.push("-xr!" + this.filter);
    }

    if (this.debug) {
      this.process.readyReadStandardOutput.connect(this, function () {
        try {
          this.log(
            new QTextStream(this.process.readAllStandardOutput()).readAll()
          );
          this.log(
            new QTextStream(this.process.readAllStandardError()).readAll()
          );
        } catch (error) {
          this.log(error);
        }
      });
    }

    this.process.start(this.binPath, this.command);
    this.process.waitForFinished(10000);

    return new QFile(this.destination).exists();
  } catch (error) {
    this.log(error);
    if (typeof this.errorCallback === "function") {
      this.errorCallback.call(this.parentContext, error);
    }
    return false;
  }
};

/**
 * Decompresses a file blocking the UI
 * @returns {boolean} True if decompression was successful
 */
SevenZip.prototype.unzip = function () {
  try {
    // For unzip, sources should be a single archive path (string)
    var sourcePath = Array.isArray(this.sources) ? this.sources[0] : this.sources;

    this.command = [
      "x",
      "-y", // Overwrites files and folders by default
      sourcePath,
      "-o" + this.destination,
      "-bsp1",
    ];

    if (this.filter !== undefined && this.filter !== "") {
      this.command.push(this.filter);
    }

    if (this.debug) {
      this.process.readyReadStandardOutput.connect(this, function () {
        try {
          this.log(
            new QTextStream(this.process.readAllStandardOutput()).readAll()
          );
          this.log(
            new QTextStream(this.process.readAllStandardError()).readAll()
          );
        } catch (error) {
          this.log(error);
        }
      });
    }

    this.process.start(this.binPath, this.command);
    this.process.waitForFinished(10000);

    return new QDir(this.destination).exists();
  } catch (error) {
    this.log(error);
    if (typeof this.errorCallback === "function") {
      this.errorCallback.call(this.parentContext, error);
    }
    return false;
  }
};

/**
 * Decompresses a file without blocking the UI
 */
SevenZip.prototype.unzipAsync = function () {
  var self = this;

  try {
    // Disconnect any previous signal connections to prevent duplicates
    this._disconnectSignals();

    // For unzip, sources should be a single archive path (string)
    var sourcePath = Array.isArray(this.sources) ? this.sources[0] : this.sources;

    // Macos seems to have an older version of 7za, so the output folder command -o shouldn't have a space before the path
    this.command = [
      "x",
      "-y", // Overwrites files and folders by default
      sourcePath,
      "-o" + this.destination,
      "-bsp1", // Macos and tbh22 needs -bsp1 to show progress
    ];

    if (this.filter !== undefined && this.filter !== "") {
      this.command.push(this.filter);
    }

    // Progress callback for stdout
    if (!this.debug && typeof this.progressCallback === "function") {
      this._connections.readyReadStdOut = function () {
        var output7z = new QTextStream(self.process.readAllStandardOutput())
          .readAll()
          .match(/\d+(?:\.\d+)?%/);
        if (output7z && output7z.length > 0) {
          self.progressCallback.call(self.parentContext, parseInt(output7z[0]));
        }
      };
      this.process.readyReadStandardOutput.connect(this, this._connections.readyReadStdOut);
    }

    // Process started callback
    if (typeof this.processStartCallback === "function") {
      this._connections.started = function () {
        self.processStartCallback.call(self.parentContext);
      };
      this.process["started()"].connect(this, this._connections.started);
    }

    // Process finished callback
    if (typeof this.processEndCallback === "function") {
      this._connections.finished = function () {
        // Clean up signal connections
        self._disconnectSignals();

        self.processEndCallback.call(self.parentContext, new QDir(self.destination).exists());
      };
      this.process["finished(int)"].connect(this, this._connections.finished);
    }

    // Debug output
    if (this.debug) {
      if (!this._connections.readyReadStdOut) {
        this._connections.readyReadStdOut = function () {
          var currentStdOut = new QTextStream(
            self.process.readAllStandardOutput()
          ).readAll();
          self.log(currentStdOut);
        };
        this.process.readyReadStandardOutput.connect(this, this._connections.readyReadStdOut);
      }

      this._connections.readyReadStdErr = function () {
        var currentErrOut = new QTextStream(
          self.process.readAllStandardError()
        ).readAll();
        self.log(currentErrOut);
      };
      this.process.readyReadStandardError.connect(this, this._connections.readyReadStdErr);
    }

    this.process.start(this.binPath, this.command);
  } catch (error) {
    this.log(error);
    if (typeof this.errorCallback === "function") {
      this.errorCallback.call(this.parentContext, error);
    }
  }
};

function Connection() {
  this.timeout = 50000; // 50 seconds timeout

  this.curlPath = this.bin.split("/").slice(0, -1).join("\\"); // Curl binary full path
  this.curlBin = this.bin.split("/").pop(); // Curl binary file (without path)

  this.process = new QProcess();
  // this.process.setWorkingDirectory(this.curlPath); // Set process working directory to curl folder
  // this.process.waitForFinished(this.timeout);

  this.command = [];

  if (this.curlPath.indexOf("bin_3rdParty") !== -1) {
    this.command = ["--insecure"].concat(this.command);
  }
}

Connection.prototype.download = function (url, destinationPath) {
  try {
    var file = new QFile(destinationPath);
    MessageLog.trace(file.fileName());
    var dirPath = new QFileInfo(file.fileName()).dir().path();

    if (!new QDir(dirPath).exists()) {
      new QDir().mkpath(dirPath);
    }

    if (file.exists()) {
      file.remove();
    }

    this.process.start(
      this.bin,
      ["-L", "-o", destinationPath, url].concat(this.command)
    );
    this.process.waitForFinished(this.timeout);

    // MessageLog.trace(
    //   new QTextStream(this.process.readAllStandardOutput()).readAll()
    // );
    // MessageLog.trace(
    //   new QTextStream(this.process.readAllStandardError()).readAll()
    // );

    if (file.exists()) {
      return file;
    } else {
      throw new Error("File download Failed");
    }
  } catch (error) {
    MessageLog.trace(error);
  }
};

Object.defineProperty(Connection.prototype, "bin", {
  get: function () {
    if (typeof Connection.__proto__.bin === "undefined") {
      if (about.isWindowsArch()) {
        var curls = [
          specialFolders.bin + "/bin_3rdParty/curl.exe",
          System.getenv("ProgramFiles") + "/Git/mingw64/bin/curl.exe",
          System.getenv("windir") + "/system32/curl.exe",
        ];
      } else {
        var curls = [
          "/usr/bin/curl",
          "/usr/local/bin/curl",
          specialFolders.bin + "/bin_3rdParty/curl",
        ];
      }

      for (var curl in curls) {
        if (new File(curls[curl]).exists) {
          Connection.__proto__.bin = curls[curl];
          return curls[curl];
        }
      }

      throw new Error("Please Install CURL");
    } else {
      return Connection.__proto__.bin;
    }
  },
});

SevenZip.prototype.log = function (stuff) {
  if (this.debug) {
    if (typeof stuff === "object" || typeof stuff === "array") {
      stuff = JSON.stringify(stuff);
    }
    MessageLog.trace(stuff);
  }
};

exports.SevenZip = SevenZip;

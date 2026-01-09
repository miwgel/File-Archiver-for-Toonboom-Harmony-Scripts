/**
 * @file File zipper and unzipper utility for Toonboom Harmony Scripting Interface
 * @version 25.1
 * @copyright mihgehl < github.com/mihgehl >
 * @author mihgehl < github.com/mihgehl >
 */

/**
 * Creates a new SevenZip instance for file compression/decompression operations.
 * Supports two initialization modes:
 *
 * 1. Configuration object (recommended):
 * @example
 * var archiver = new SevenZip({
 *   sources: "/path/to/folder",
 *   destination: "/path/to/archive.7z",
 *   filter: "*.bak",
 *   onStart: function() { },
 *   onProgress: function(percent) { },
 *   onEnd: function(success) { },
 *   onError: function(error) { }
 * });
 *
 * 2. Positional parameters (legacy, backwards compatible):
 * @example
 * var archiver = new SevenZip(this, "/path/to/folder", "/path/to/archive.7z");
 *
 * @constructor
 * @param {Object|*} configOrContext - Configuration object OR parent context (legacy)
 * @param {string|string[]} [sources] - Source path(s) (legacy mode only)
 * @param {string} [destination] - Destination path (legacy mode only)
 * @param {Function} [processStartCallback] - Called when async process starts (legacy)
 * @param {Function} [progressCallback] - Called with progress percentage (legacy)
 * @param {Function} [processEndCallback] - Called when process ends (legacy)
 * @param {Function} [debugCallback] - Called with debug output (legacy)
 * @param {string} [filter] - Filter pattern (legacy)
 * @param {boolean} [debug] - Enable debug mode (legacy)
 * @param {Function} [errorCallback] - Called on error (legacy)
 * @throws {Error} If sources or destination are not provided
 */
function SevenZip(
  configOrContext,
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
  // Detect if first argument is a config object
  // Config objects have 'sources' or 'destination' properties
  // Qt objects have 'objectName' property, so we exclude those
  var isConfigObject = (
    typeof configOrContext === "object" &&
    configOrContext !== null &&
    !configOrContext.objectName &&
    (configOrContext.sources !== undefined || configOrContext.destination !== undefined)
  );

  if (isConfigObject) {
    this._initFromConfig(configOrContext);
  } else {
    this._initFromParams(
      configOrContext, sources, destination,
      processStartCallback, progressCallback, processEndCallback,
      debugCallback, filter, debug, errorCallback
    );
  }

  // Validate required parameters
  this._validateParams();

  // Initialize process
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

// ============================================================================
// Static cache properties (replaces __proto__ usage)
// ============================================================================
SevenZip._cachedBinPath = null;
SevenZip._cachedVersion = null;

// ============================================================================
// Initialization methods
// ============================================================================

/**
 * Initialize from configuration object
 * @private
 * @param {Object} config - Configuration object
 */
SevenZip.prototype._initFromConfig = function(config) {
  this.parentContext = config.context || config.parentContext || null;
  this.sources = config.sources || null;
  this.destination = config.destination || null;
  this.filter = config.filter !== undefined ? config.filter : undefined;
  this.debug = config.debug || false;

  // Support both naming conventions for callbacks
  this.processStartCallback = config.onStart || config.processStartCallback || null;
  this.progressCallback = config.onProgress || config.progressCallback || null;
  this.processEndCallback = config.onEnd || config.processEndCallback || null;
  this.debugCallback = config.onDebug || config.debugCallback || null;
  this.errorCallback = config.onError || config.errorCallback || null;
};

/**
 * Initialize from positional parameters (legacy mode)
 * @private
 */
SevenZip.prototype._initFromParams = function(
  parentContext, sources, destination,
  processStartCallback, progressCallback, processEndCallback,
  debugCallback, filter, debug, errorCallback
) {
  this.parentContext = parentContext !== undefined ? parentContext : null;
  this.sources = sources !== undefined ? sources : null;
  this.destination = destination !== undefined ? destination : null;
  this.processStartCallback = processStartCallback !== undefined ? processStartCallback : null;
  this.progressCallback = progressCallback !== undefined ? progressCallback : null;
  this.processEndCallback = processEndCallback !== undefined ? processEndCallback : null;
  this.debugCallback = debugCallback !== undefined ? debugCallback : null;
  this.filter = filter !== undefined ? filter : undefined;
  this.debug = debug !== undefined ? debug : false;
  this.errorCallback = errorCallback !== undefined ? errorCallback : null;
};

/**
 * Validates required parameters and throws errors for invalid inputs
 * @private
 */
SevenZip.prototype._validateParams = function() {
  if (this.sources === null || this.sources === undefined) {
    throw new Error("SevenZip: sources parameter is required");
  }

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

// ============================================================================
// Helper methods (reduce code duplication)
// ============================================================================

/**
 * Normalizes sources to an array
 * @private
 * @returns {Array} Array of source paths
 */
SevenZip.prototype._normalizeSources = function() {
  return Array.isArray(this.sources) ? this.sources : [this.sources];
};

/**
 * Gets the first source path (for unzip operations)
 * @private
 * @returns {string} First source path
 */
SevenZip.prototype._getSourcePath = function() {
  return Array.isArray(this.sources) ? this.sources[0] : this.sources;
};

/**
 * Builds the zip command array
 * @private
 * @param {boolean} addWildcard - Whether to add /* suffix for directories
 * @returns {Array} Command array for 7zip
 */
SevenZip.prototype._buildZipCommand = function(addWildcard) {
  var cmd = ["a", this.destination];
  var sourcesArray = this._normalizeSources();

  for (var i = 0; i < sourcesArray.length; i++) {
    var sourcePath = sourcesArray[i];
    if (addWildcard) {
      var sourceInfo = new QFileInfo(sourcePath);
      if (sourceInfo.isDir()) {
        cmd.push(sourcePath + "/*");
      } else {
        cmd.push(sourcePath);
      }
    } else {
      cmd.push(sourcePath);
    }
  }

  cmd.push("-bsp1");

  if (this.filter !== undefined && this.filter !== "") {
    cmd.push("-xr!" + this.filter);
  }

  return cmd;
};

/**
 * Builds the unzip command array
 * @private
 * @returns {Array} Command array for 7zip
 */
SevenZip.prototype._buildUnzipCommand = function() {
  var cmd = [
    "x",
    "-y",
    this._getSourcePath(),
    "-o" + this.destination,
    "-bsp1"
  ];

  if (this.filter !== undefined && this.filter !== "") {
    cmd.push(this.filter);
  }

  return cmd;
};

/**
 * Verifies zip operation success
 * @private
 * @returns {boolean} True if destination file exists
 */
SevenZip.prototype._verifyZipSuccess = function() {
  return new QFile(this.destination).exists();
};

/**
 * Verifies unzip operation success
 * @private
 * @returns {boolean} True if destination directory exists
 */
SevenZip.prototype._verifyUnzipSuccess = function() {
  return new QDir(this.destination).exists();
};

/**
 * Notifies the end callback with success status
 * @private
 * @param {boolean} success - Whether operation succeeded
 */
SevenZip.prototype._notifyEnd = function(success) {
  if (typeof this.processEndCallback === "function") {
    this.processEndCallback.call(this.parentContext, success);
  }
};

/**
 * Notifies the error callback
 * @private
 * @param {Error} error - The error that occurred
 */
SevenZip.prototype._notifyError = function(error) {
  this.log(error);
  if (typeof this.errorCallback === "function") {
    this.errorCallback.call(this.parentContext, error);
  }
};

/**
 * Removes source files/directories after successful compression
 * @private
 * @param {Array} sourcesArray - Array of paths to remove
 */
SevenZip.prototype._cleanupSources = function(sourcesArray) {
  for (var i = 0; i < sourcesArray.length; i++) {
    var pathToRemove = sourcesArray[i];
    var pathInfo = new QFileInfo(pathToRemove);

    if (pathInfo.isDir()) {
      this.log("Removing folder: " + pathToRemove);
      new QDir(pathToRemove).removeRecursively();
    } else if (pathInfo.isFile()) {
      this.log("Removing file: " + pathToRemove);
      new QFile(pathToRemove).remove();
    }
  }
};

/**
 * Creates a progress callback handler
 * @private
 * @returns {Function} Progress handler function
 */
SevenZip.prototype._createProgressHandler = function() {
  var self = this;
  return function() {
    var output7z = new QTextStream(self.process.readAllStandardOutput())
      .readAll()
      .match(/\d+(?:\.\d+)?%/);
    if (output7z && output7z.length > 0) {
      self.progressCallback.call(self.parentContext, parseInt(output7z[0]));
    }
  };
};

/**
 * Disconnects all signal connections to prevent memory leaks
 * @private
 */
SevenZip.prototype._disconnectSignals = function() {
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

// ============================================================================
// Callback typedefs
// ============================================================================

/**
 * Called when async process starts
 * @callback processStartCallback
 */

/**
 * Called when async progress is updated
 * @callback progressCallback
 * @param {number} progressValue - Current progress percentage (0-100)
 */

/**
 * Called when async process ends
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

// ============================================================================
// Properties (version and binPath)
// ============================================================================

/**
 * Get current 7zip version
 */
Object.defineProperty(SevenZip.prototype, "version", {
  get: function() {
    try {
      if (SevenZip._cachedVersion === null) {
        var versionCheckProcess = new QProcess();
        versionCheckProcess.start(this.binPath);
        versionCheckProcess.waitForFinished(10000);
        var regex = /(7-Zip (\d+\.\d+))|(7-Zip \(z\) (\d+\.\d+)) |(\d+\.\d+)/;
        var match = new QTextStream(versionCheckProcess.readAllStandardOutput())
          .readAll()
          .match(regex);
        if (match) {
          for (var i = 0; i < match.length; i++) {
            var floatValue = parseFloat(match[i]);
            if (!isNaN(floatValue)) {
              SevenZip._cachedVersion = floatValue;
              break;
            }
          }
        }
      }
      return SevenZip._cachedVersion;
    } catch (error) {
      MessageLog.trace(error);
      return null;
    }
  }
});

/**
 * Get 7zip binary path
 */
Object.defineProperty(SevenZip.prototype, "binPath", {
  get: function() {
    if (SevenZip._cachedBinPath !== null) {
      return SevenZip._cachedBinPath;
    }

    if (about.isMacArch() || about.isLinuxArch()) {
      var szpath = [
        specialFolders.bin + "/bin_3rdParty/7za",
        specialFolders.bin + "/../../external/macosx/p7zip/7za"
      ];

      for (var i = 0; i < szpath.length; i++) {
        var sevenzipbin = new File(szpath[i]);
        if (sevenzipbin.exists) {
          SevenZip._cachedBinPath = sevenzipbin.fullName;
          return SevenZip._cachedBinPath;
        }
      }
    } else if (about.isWindowsArch()) {
      var sevenzipbin = new QFile(
        specialFolders.userScripts + "/packages/7zip/7za.exe"
      );

      if (!sevenzipbin.exists()) {
        var dirPath = new QFileInfo(sevenzipbin.fileName()).dir().path();

        // Clean and create 7zip folder
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
            "exit"
        ];

        download7zProcess.setWorkingDirectory(dirPath);
        download7zProcess.start("cmd.exe", download7zCommand);
        download7zProcess.waitForFinished(50000);
      }

      if (sevenzipbin.exists()) {
        SevenZip._cachedBinPath = sevenzipbin.fileName();
        return SevenZip._cachedBinPath;
      }
    }

    return null;
  }
});

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Calculates the total size of a file or directory recursively
 * @param {string} sourcePath - Path to file or directory
 * @returns {number} Total size in bytes
 */
var sizeCalculator = function(sourcePath) {
  var totalSize = 0;
  var sourceInfo = new QFileInfo(sourcePath);

  if (sourceInfo.isFile()) {
    totalSize = sourceInfo.size();
  } else if (sourceInfo.isDir()) {
    var fileInfoList = new QDir(sourcePath).entryInfoList(
      QDir.Filters(QDir.Files | QDir.Dirs | QDir.NoDotAndDotDot)
    );
    for (var i = 0; i < fileInfoList.length; i++) {
      totalSize += sizeCalculator(fileInfoList[i].filePath());
    }
  }
  return totalSize;
};

// ============================================================================
// Public methods
// ============================================================================

/**
 * Compresses files/directories asynchronously (non-blocking)
 * @param {boolean} [deleteSource=false] - If true, deletes source after successful compression
 */
SevenZip.prototype.zipAsync = function(deleteSource) {
  var self = this;

  try {
    this._disconnectSignals();
    this.command = this._buildZipCommand(false);
    var sourcesArray = this._normalizeSources();

    // Progress callback
    if (!this.debug && typeof this.progressCallback === "function") {
      this._connections.readyReadStdOut = this._createProgressHandler();
      this.process.readyReadStandardOutput.connect(this, this._connections.readyReadStdOut);
    }

    // Started callback
    if (typeof this.processStartCallback === "function") {
      this._connections.started = function() {
        self.processStartCallback.call(self.parentContext);
      };
      this.process["started()"].connect(this, this._connections.started);
    }

    // Finished callback
    if (typeof this.processEndCallback === "function" || deleteSource) {
      this._connections.finished = function() {
        var success = self._verifyZipSuccess();
        self._disconnectSignals();
        self._notifyEnd(success);

        if (deleteSource && success) {
          self._cleanupSources(sourcesArray);
        }
      };
      this.process["finished(int)"].connect(this, this._connections.finished);
    }

    // Debug callback
    if (typeof this.debugCallback === "function") {
      if (!this._connections.readyReadStdOut) {
        this._connections.readyReadStdOut = function() {
          var output = new QTextStream(self.process.readAllStandardOutput()).readAll();
          self.debugCallback.call(self.parentContext, output);
        };
        this.process.readyReadStandardOutput.connect(this, this._connections.readyReadStdOut);
      }

      this._connections.readyReadStdErr = function() {
        var output = new QTextStream(self.process.readAllStandardError()).readAll();
        self.debugCallback.call(self.parentContext, output);
      };
      this.process.readyReadStandardError.connect(this, this._connections.readyReadStdErr);
    }

    this.process.start(this.binPath, this.command);
  } catch (error) {
    this._notifyError(error);
  }
};

/**
 * Compresses files/directories synchronously (blocking)
 * @returns {boolean} True if compression was successful
 */
SevenZip.prototype.zip = function() {
  try {
    this.command = this._buildZipCommand(true);

    if (this.debug) {
      var self = this;
      this.process.readyReadStandardOutput.connect(this, function() {
        try {
          self.log(new QTextStream(self.process.readAllStandardOutput()).readAll());
          self.log(new QTextStream(self.process.readAllStandardError()).readAll());
        } catch (error) {
          self.log(error);
        }
      });
    }

    this.process.start(this.binPath, this.command);
    this.process.waitForFinished(10000);

    return this._verifyZipSuccess();
  } catch (error) {
    this._notifyError(error);
    return false;
  }
};

/**
 * Decompresses an archive synchronously (blocking)
 * @returns {boolean} True if decompression was successful
 */
SevenZip.prototype.unzip = function() {
  try {
    this.command = this._buildUnzipCommand();

    if (this.debug) {
      var self = this;
      this.process.readyReadStandardOutput.connect(this, function() {
        try {
          self.log(new QTextStream(self.process.readAllStandardOutput()).readAll());
          self.log(new QTextStream(self.process.readAllStandardError()).readAll());
        } catch (error) {
          self.log(error);
        }
      });
    }

    this.process.start(this.binPath, this.command);
    this.process.waitForFinished(10000);

    return this._verifyUnzipSuccess();
  } catch (error) {
    this._notifyError(error);
    return false;
  }
};

/**
 * Decompresses an archive asynchronously (non-blocking)
 */
SevenZip.prototype.unzipAsync = function() {
  var self = this;

  try {
    this._disconnectSignals();
    this.command = this._buildUnzipCommand();

    // Progress callback
    if (!this.debug && typeof this.progressCallback === "function") {
      this._connections.readyReadStdOut = this._createProgressHandler();
      this.process.readyReadStandardOutput.connect(this, this._connections.readyReadStdOut);
    }

    // Started callback
    if (typeof this.processStartCallback === "function") {
      this._connections.started = function() {
        self.processStartCallback.call(self.parentContext);
      };
      this.process["started()"].connect(this, this._connections.started);
    }

    // Finished callback
    if (typeof this.processEndCallback === "function") {
      this._connections.finished = function() {
        self._disconnectSignals();
        self._notifyEnd(self._verifyUnzipSuccess());
      };
      this.process["finished(int)"].connect(this, this._connections.finished);
    }

    // Debug output
    if (this.debug) {
      if (!this._connections.readyReadStdOut) {
        this._connections.readyReadStdOut = function() {
          self.log(new QTextStream(self.process.readAllStandardOutput()).readAll());
        };
        this.process.readyReadStandardOutput.connect(this, this._connections.readyReadStdOut);
      }

      this._connections.readyReadStdErr = function() {
        self.log(new QTextStream(self.process.readAllStandardError()).readAll());
      };
      this.process.readyReadStandardError.connect(this, this._connections.readyReadStdErr);
    }

    this.process.start(this.binPath, this.command);
  } catch (error) {
    this._notifyError(error);
  }
};

/**
 * Logs a message to MessageLog when debug mode is enabled
 * @param {*} stuff - The content to log
 */
SevenZip.prototype.log = function(stuff) {
  if (this.debug) {
    if (typeof stuff === "object") {
      stuff = JSON.stringify(stuff);
    }
    MessageLog.trace(stuff);
  }
};

// ============================================================================
// Export
// ============================================================================
exports.SevenZip = SevenZip;

/*jshint -W079 */


/*jshint -W082 */

var module = module || {}

  ,
  window = window || {}
  ,

  document = document || {location: {search: ""}}
  ,
  jQuery = jQuery || {}

  ,
  tableau = tableau || {}

  ,
  wdcw = window.wdcw || {}

  ;
module.exports = function ($, tableau, wdcw) {
  /**
   * Run during initialization of the web data connector.
   *
   * @param {string} phase
   *   The initialization phase. This can be one of:
   *   - tableau.phaseEnum.interactivePhase: Indicates when the connector is
   *     being initialized with a user interface suitable for an end-user to
   *     enter connection configuration details.
   *   - tableau.phaseEnum.gatherDataPhase: Indicates when the connector is
   *     being initialized in the background for the sole purpose of collecting
   *     data.
   *   - tableau.phaseEnum.authPhase: Indicates when the connector is being
   *     accessed in a stripped down context for the sole purpose of refreshing
   *     an OAuth authentication token.
   * @param {function} setUpComplete
   *   A callback function that you must call when all setup tasks have been
   *   performed.
   */
  wdcw.setup = function setup(phase, setUpComplete) {
    // You may need to perform set up or other initialization tasks at various
    // points in the data connector flow. You can do so here.
    switch (phase) {
      case tableau.phaseEnum.interactivePhase: // Perform set up tasks that relate to when the user will be prompted to
        // enter information interactively.
        tableau.log("Interactive Phase");
        break;
      case tableau.phaseEnum.gatherDataPhase: // Perform set up tasks that should happen when Tableau is attempting to
        // retrieve data from your connector (the user is not prompted for any
        // information in this phase.
        tableau.log("GatherData Phase");
        break;
      case tableau.phaseEnum.authPhase: // Perform set up tasks that should happen when Tableau is attempting to
        // refresh OAuth authentication tokens.
        tableau.log("Auth Phase");
        break;
    }
    // Always register when initialization tasks are complete by calling this.
    // This can be especially useful when initialization tasks are asynchronous
    // in nature.
    setUpComplete();
  }
  ;
  /**
   * Run when the web data connector is being unloaded. Useful if you need
   * custom logic to clean up resources or perform other shutdown tasks.
   *
   * @param {function} tearDownComplete
   *   A callback function that you must call when all shutdown tasks have been
   *   performed.
   */
  wdcw.teardown = function teardown(tearDownComplete) {
    // Once shutdown tasks are complete, call this. Particularly useful if your
    // clean-up tasks are asynchronous in nature.
    tearDownComplete();
  }
  ;
  /**
   * Primary method called when Tableau is asking for the column headers that
   * this web data connector provides. Takes a single callable argument that you
   * should call with the headers you've retrieved.
   *
   * @param {function(Array<{name, type, incrementalRefresh}>)} registerHeaders
   *   A callback function that takes an array of objects as its sole argument.
   *   For example, you might call the callback in the following way:
   *   registerHeaders([
   *     {name: 'Boolean Column', type: 'bool'},
   *     {name: 'Date Column', type: 'date'},
   *     {name: 'DateTime Column', type: 'datetime'},
   *     {name: 'Fl oat Column', type: 'float'},
   *     {name: 'Integer Column', type: 'int'},
   *     {name: 'String Column', type: 'string'}
   *   ]);
   *
   *   Note: to enable support for incremental extract refreshing, add a third
   *   key (incrementalRefresh) to the header object. Candidate columns for
   *   incremental refreshes must be of type datetime or integer. During an
   *   incremental refresh attempt, the most recent value for the given column
   *   will be passed as "lastRecord" to the tableData method. For example:
   *   registerHeaders([
   *     {name: 'DateTime Column', type: 'datetime', incrementalRefresh: true}
   *   ]);
   */
  wdcw.columnHeaders = function columnHeaders(registerHeaders) {
    // Access your input option like this to tweak data gathering logic.
    var dataExportGUID = this.getConnectionData()['DataExportGUID'];
    var accountGUID = this.getConnectionData()['AccountGUID'];
    var beginDate = this.getConnectionData()['begin'];
    var endDate = this.getConnectionData()['end'];
    var dateRange = this.getConnectionData()['daterange'];
    var apiServer = getQSByKey('APIServer');
    var username = this.getUsername();
    var password = this.getPassword();

    // Do the same to retrieve your actual data.
    $.ajax({
      url: buildApiFrom('v1/account/' + accountGUID + '/export/' + dataExportGUID, {
          server: apiServer
        }
      ), // Add basic authentication headers to your request like this. Note that
      // the password is encrypted when stored by Tableau; the username is not.
      xhrFields: {
        withCredentials: true
      },
      headers: {
        "Authorization": "Basic " + btoa(username + ":" + password)
      },
      crossDomain: true,
      success: function dataRetrieved(response) {

        tableau.log(response);

        var processedColumns = [], dimensions, measures;
        // If necessary, process the response from the API into the expected
        // format (highlighted below):


        $.each(response.report.dimension, function (index, value) {
          processedColumns.push({
            name: value.name, type: "string", // If your connector supports incremental extract refreshes, you
            // can indicate the column to use for refreshing like this:
            incrementalRefresh: false
          })
        });

        $.each(response.report.measure, function (index, value) {
          processedColumns.push({
            name: value.name, type: "float", // If your connector supports incremental extract refreshes, you
            // can indicate the column to use for refreshing like this:
            incrementalRefresh: false
          })
        });

        // Once data is retrieved and processed, call registerHeaders().
        registerHeaders(processedColumns);
      }, // Use this.ajaxErrorHandler for basic error handling.
      error: this.ajaxErrorHandler
    });
  }
  ;
  /**
   * Primary method called when Tableau is asking for your web data connector's
   * data. Takes a callable argument that you should call with all of the
   * data you've retrieved. You may optionally pass a token as a second argument
   * to support paged/chunked data retrieval.
   *
   * @param {function(Array<{object}>, {string})} registerData
   *   A callback function that takes an array of objects as its sole argument.
   *   Each object should be a simple key/value map of column name to column
   *   value. For example, you might call the callback in the following way:
   *   registerData([
   *     {'String Column': 'String Column Value', 'Integer Column': 123}
   *   ]});
   *
   *   It's possible that the API you're interacting with supports some mechanism
   *   for paging or filtering. To simplify the process of making several paged
   *   calls to your API, you may optionally pass a second argument in your call
   *   to the registerData callback. This argument should be a string token that
   *   represents the last record you retrieved.
   *
   *   If provided, your implementation of the tableData method will be called
   *   again, this time with the token you provide here. Once all data has been
   *   retrieved, pass null, false, 0, or an empty string.
   *
   * @param {string} lastRecord
   *   Optional. If you indicate in the call to registerData that more data is
   *   available (by passing a token representing the last record retrieved),
   *   then the lastRecord argument will be populated with the token that you
   *   provided. Use this to update/modify the API call you make to handle
   *   pagination or filtering.
   *
   *   If you indicated a column in wdcw.columnHeaders suitable for use during
   *   an incremental extract refresh, the last value of the given column will
   *   be passed as the value of lastRecord when an incremental refresh is
   *   triggered.
   */
  wdcw.tableData = function tableData(registerData, lastRecord) {
    // Access your input option like this to tweak data gathering logic.
    var dataExportGUID = this.getConnectionData()['DataExportGUID'];
    var accountGUID = this.getConnectionData()['AccountGUID'];
    var beginDate = this.getConnectionData()['begin'];
    var dateRange = this.getConnectionData()['daterange'];
    var timezone = this.getConnectionData()['timezone'];
    var endDate = this.getConnectionData()['end'];
    var limit = this.getConnectionData()['Limit'];
    var totals = this.getConnectionData()['Totals'];
    var apiServer = getQSByKey('APIServer');

    var username = this.getUsername();
    var password = this.getPassword();

    getTableDataAjax(this);

    // Do the same to retrieve your actual data.
    function getTableDataAjax(_this) {
      var request = $.ajax({
        url: buildApiFrom('v1/account/' + accountGUID + '/dataexport/' + dataExportGUID + '/data', {
          last: lastRecord, server: apiServer, begin: beginDate, end: endDate, dateRange: dateRange, timezone: timezone, limit: limit, totals: totals
        }),
        xhrFields: {
          withCredentials: true
        },
        headers: {
          "Authorization": "Basic " + btoa(username + ":" + password)
        },
        crossDomain: true,
        success: function dataRetrieved(response) {

          if (request.status == 202) {
            tableau.log("Data not ready, retrying...");
            tableau.log(response);
            //retry
            setTimeout(1000, getTableDataAjax(_this));
            return;
          }

          tableau.log(response);
          var processedData = []; // Determine if more data is available via paging.
          //moreData=false;
          // You may need to perform processing to shape the data into an array of
          // objects where each object is a map of column names to values.

          $.each(response.dimensions, function (index, value) {
            processedData = buildDimMeasureMap(value, processedData);
          });

          // Once you've retrieved your data and shaped it into the form expected,
          // call the registerData function. If more data can be retrieved, then
          // supply a token to inform further paged requests.
          // @see buildApiFrom()
          //if (moreData) {
          //    registerData(processedData, response.meta.page);
          //}
          // Otherwise, just register the response data with the callback.
          //else {
          registerData(processedData);
          //}
        }
        , // Use this.ajaxErrorHandler for basic error handling.
        error: _this.ajaxErrorHandler
      });
    }
  }
  ;
  // You can write private methods for use above like this:

  /**
   * Helper to build the structure for the dimension
   **/
  function buildDimMeasureMap(dimension, dataMap, currentData) {
    var data = new Object();
    if (currentData) {
      data = $.extend({}, currentData);
    }

    data[dimension.type] = dimension.value;
    $.each(dimension.dimensions, function (index, value) {
      dataMap = buildDimMeasureMap(value, dataMap, data);
    });

    $.each(dimension.measures, function (index, value) {
      data[value.name] = value.value;
      tableau.log(value.name + ": " + value.value);
    });

    //single level report only && not top level wrapper object
    if ((!currentData && !dimension.dimensions) || currentData) {
      dataMap.push(data);
    }
    return dataMap;
  };

  /**
   * Helper function to build an API endpoint.
   *
   * @param {string} path
   *   API endpoint path from which to build a full URL.
   *
   * @param {object} opts
   *   Options to inform query parameters and paging.
   */
  function buildApiFrom(path, opts) {
    opts = opts || {};

    var server = opts.server || "https://api.webtrends.io/";
    path = server + path;

    // Only append date and format for actual data calls, not metadata calls.
    if (opts.dateRange == "custom" || opts.dateRange == "latest") {
      if (opts.begin) {
        path += "?begin=" + opts.begin + "/00";
        if(opts.dateRange == "latest") {
          path += "&end=latest";
        } else {
          path += "&end=" + opts.end + "/23";
        }
        path = addExtraParams(path, opts);
      }
    } else if (opts.dateRange) {
      path += "?dateRange=" + opts.dateRange;
      path = addExtraParams(path, opts);
    }

    return path;
  }

  function addExtraParams(path, opts) {
    path += "&format=json";
    path += "&timezone=" + opts.timezone;
    path += "&limit=" + opts.limit;
    path += "&totals=" + opts.totals;

    return path;
  }

  /**
   * Helper function to get QS key
   */
  function getQSByKey(k) {
    var p = new RegExp('\\b' + k + '\\b', 'gi');
    var qs = document.location.search;
    return qs.search(p) != -1 ? decodeURIComponent(qs.substr(qs.search(p) + k.length + 1).substr(0, qs.substr(qs.search(p) + k.length + 1).search(/(&|;|$)/))) : "";
  }

  // Polyfill for btoa() in older browsers.
  // @see https://raw.githubusercontent.com/davidchambers/Base64.js/master/base64.js
  /* jshint ignore:start */
  if (typeof btoa === 'undefined') {
    function btoa(input) {
      var object = typeof exports != 'undefined' ? exports : this, // #8: web workers
        chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=', str = String(input);

      function InvalidCharacterError(message) {
        this.message = message;
      }

      InvalidCharacterError.prototype = new Error;
      InvalidCharacterError.prototype.name = 'InvalidCharacterError';
      for ( // initialize result and counter
        var block, charCode, idx = 0, map = chars, output = '';
        // if the next str index does not exist:
        //   change the mapping table to "="
        //   check if d has no fractional digits
        str.charAt(idx | 0) || (map = '=', idx % 1);
        // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
        output += map.charAt(63 & block >> 8 - idx % 1 * 8)) {
        charCode = str.charCodeAt(idx += 3 / 4);
        if (charCode > 0xFF) {
          throw new InvalidCharacterError("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
        }
        block = block << 8 | charCode;
      }
      return output;
    }
  }
  /* jshint ignore:end */
  return wdcw;
}

;
// Set the global wdcw variable as expected.
wdcw = module.exports(jQuery, tableau, wdcw);

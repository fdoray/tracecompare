exports.tracecompare = tracecompare;

function tracecompare(path) {
  var tracecompare = {
    CreateMetricDimension: CreateMetricDimension,
    CreateHistogram: CreateHistogram
  };

  // Formatters.
  var formatNumber = d3.format(",d");

  // Constants.
  var kMetricNames = {
    "a": "duration",
    "b": "usermode",
    "c": "system calls",
    "d": "interrupted",
    "e": "wait-cpu",
    "f": "wait-blocked",
    "g": "timer",
    "h": "network",
    "i": "block-device",
    "j": "user-input"
  };
  var kNumFilters = 2;
  var kNumBuckets = 50;

  // Available metrics with their min/max value.
  var metrics = {};

  // Filters, dimensions and groups.
  var filters = new Array();
  var dimensionsProperties = {};
  var dimensions = new Array();
  var groups = new Array();
  var groupAll = new Array();

  // Histograms.
  var histogramsDict = {};
  var histograms = new Array();

  // Load data.
  d3.json(path, function(error, data) {

    // Create an artificial metric.
    // TODO: Remove this.
    data.executions.forEach(function(d) {
      d["b"] = d["a"] * (0.5 + Math.random());
    });

    // Find available metrics and compute their min/max value.
    data.executions.forEach(function(d) {
      ForEachProperty(d, function(property) {
        if (property == "samples")
          return;

        if (metrics.hasOwnProperty(property))
        {
          var metric = metrics[property];
          metric.min = Math.min(metric.min, d[property]);
          metric.max = Math.max(metric.max, d[property]);
        }
        else
        {
          metrics[property] = {
            "min": d[property],
            "max": d[property]
          };
        }
      });
    });
    ForEachProperty(metrics, function(metricIdentifier) {
      var metric = metrics[metricIdentifier];
      metric.bucketSize = (metric.max - metric.min) / kNumBuckets;
    });

    // Create filters.
    for (var i = 0; i < kNumFilters; ++i)
    {
      filters.push(crossfilter(data.executions));
      dimensions.push({});
      groups.push({});
      groupAll.push(filters[i].groupAll());
    }

    // Show the total.
    d3.selectAll('#total').text(formatNumber(data.executions.length));
  });

  // Returns the identifier of a metric.
  // @param metric The name of the metric.
  // @returns The identifier of the metric.
  function GetMetricIdentifier(metricName)
  {
    var identifier;
    ForEachProperty(kMetricNames, function(look) {
      if (kMetricNames[look] == metricName)
        identifier = look;
    })
    return identifier;
  }

  // Creates a dimension for the specified metric.
  // @param metric The name of the metric.
  // @returns The identifier of the created dimension.
  function CreateMetricDimension(metricName)
  {
    var metricIdentifier = GetMetricIdentifier(metricName);

    // Check whether the dimension already exists.
    if (dimensions[0].hasOwnProperty(metricIdentifier))
      return metricIdentifier;

    // Create the dimension for each filter.
    for (var i = 0; i < kNumFilters; ++i)
    {
      var dimension = filters[i].dimension(function(d) {
        return d[metricIdentifier];
      });
      var group = dimension.group(function(d) {
        var bucketSize = metrics[metricIdentifier].bucketSize;
        return Math.floor(d / bucketSize) * bucketSize;
      });
      dimensions[i][metricIdentifier] = dimension;
      groups[i][metricIdentifier] = group;
    }

    dimensionsProperties[metricIdentifier] = {
      name: kMetricNames[metricIdentifier],
      min: metrics[metricIdentifier].min,
      max: metrics[metricIdentifier].max
    };

    return metricIdentifier;
  }

  /*
  // Creates a dimension for the specified stack
  // @param stackId The stack identifier.
  // @returns The identifier of the created dimension.
  function CreateStackDimension(stackId)
  {
    // TODO.
  }
  */

  // Creates an histogram for the specified dimension.
  // @param The identifier of the dimension
  function CreateHistogram(dimensionIdentifier)
  {
    // Check whether the histogram already exists.
    if (histogramsDict.hasOwnProperty(dimensionIdentifier))
      return;

    var dimensionProperties = dimensionsProperties[dimensionIdentifier];

    // Create the histograms.
    var dimensionHistograms = new Array();
    for (var i = 0; i < kNumFilters; ++i)
    {
      dimensionHistograms.push(barChart()
        .dimension(dimensions[i][dimensionIdentifier])
        .group(groups[i][dimensionIdentifier])
        .x(d3.scale.linear()
            .domain([dimensionProperties.min, dimensionProperties.max])
            .rangeRound([0, 10 * kNumBuckets])));
    }

    histogramsDict[dimensionIdentifier] = histograms.length;
    histograms.push({
      name: dimensionProperties.name,
      histograms: dimensionHistograms
    });
  }

  return tracecompare;
}
exports.tracecompare = tracecompare;

function tracecompare(path) {
  var tracecompare = {
    CreateMetricDimension: CreateMetricDimension
  };

  // Formatters.
  var formatNumber = d3.format(',d');

  // Constants.
  var kMetricNames = {
    'a': 'duration',
    'b': 'usermode',
    'c': 'system calls',
    'd': 'interrupted',
    'e': 'wait-cpu',
    'f': 'wait-blocked',
    'g': 'timer',
    'h': 'network',
    'i': 'block-device',
    'j': 'user-input'
  };
  var kNumFilters = 2;
  var kNumBuckets = 50;

  // Available metrics with their min/max value.
  var metricsDict = {};
  var metricsArray = new Array();

  // Filters, dimensions and groups.
  var filters = new Array();
  var dimensionsProperties = {};
  var dimensions = new Array();
  var groups = new Array();
  var groupAll = new Array();

  // Charts.
  var chartsDict = {};
  var charts = new Array();

  // Load data.
  d3.json(path, function(error, data) {

    // Create an artificial metric.
    // TODO: Remove this.
    data.executions.forEach(function(d) {
      d['b'] = d['a'] * (0.5 + Math.random());
    });

    // Find available metrics and compute their min/max value.
    data.executions.forEach(function(d) {
      ForEachProperty(d, function(property) {
        if (property == 'samples')
          return;

        if (metricsDict.hasOwnProperty(property))
        {
          var metric = metricsDict[property];
          metric.min = Math.min(metric.min, d[property]);
          metric.max = Math.max(metric.max, d[property]);
        }
        else
        {
          var metric = {
            'id': property,
            'name': kMetricNames[property],
            'min': d[property],
            'max': d[property]
          };
          metricsDict[property] = metric;
          metricsArray.push(metric);
        }
      });
    });
    metricsArray.forEach(function(metric) {
      metric.bucketSize = (metric.max - metric.min) / kNumBuckets;
    });

    // Create filters and empty arrays to hold dimensions and groups.
    for (var i = 0; i < kNumFilters; ++i)
    {
      filters.push(crossfilter(data.executions));
      dimensions.push({});
      groups.push({});
      groupAll.push(filters[i].groupAll());
    }

    // Create buttons to add metric charts.
    var metricButtonsData = d3.selectAll('#metric-selector')
      .selectAll('li')
      .data(metricsArray, function(metric) { return metric.id; });
    var metricButtons = metricButtonsData.enter().append('li');
    metricButtons.text(function(metric) { return metric.name; });
    metricButtons.on('click', function(d) { CreateMetricDimension(d.id); });
    metricButtonsData.exit().remove();;

    // Show the total.
    d3.selectAll('#total').text(formatNumber(data.executions.length));
  });

  // Creates a dimension for the specified metric.
  // @param metricId The identifier of the metric.
  // @returns The id of the created dimension.
  function CreateMetricDimension(metricId)
  {
    var metric = metricsDict[metricId];

    // Check whether the dimension already exists.
    if (dimensions[0].hasOwnProperty(metricId))
      return metricId;

    // Create the dimension for each filter.
    for (var i = 0; i < kNumFilters; ++i)
    {
      var dimension = filters[i].dimension(function(execution) {
        return execution[metricId];
      });
      var group = dimension.group(function(metricValue) {
        var bucketSize = metric.bucketSize;
        return Math.floor(metricValue / bucketSize) * bucketSize;
      });
      dimensions[i][metricId] = dimension;
      groups[i][metricId] = group;
    }

    dimensionsProperties[metricId] = {
      name: metric.name,
      min: metric.min,
      max: metric.max
    };

    // Create the charts.
    CreateCharts(metricId);

    return metricId;
  }

  // Creates charts for the specified dimension.
  // @param The id of the dimension
  function CreateCharts(dimensionId)
  {
    // Check whether the chart already exists.
    if (chartsDict.hasOwnProperty(dimensionId))
      return;

    var dimensionProperties = dimensionsProperties[dimensionId];

    // Create the charts.
    var dimensionCharts = new Array();
    for (var i = 0; i < kNumFilters; ++i)
    {
      dimensionCharts.push(barChart()
        .dimension(dimensions[i][dimensionId])
        .group(groups[i][dimensionId])
        .x(d3.scale.linear()
            .domain([dimensionProperties.min, dimensionProperties.max])
            .rangeRound([0, 10 * kNumBuckets])));
    }

    chartsDict[dimensionId] = charts.length;
    charts.push({
      name: dimensionProperties.name,
      charts: dimensionCharts
    });
  }

  return tracecompare;
}
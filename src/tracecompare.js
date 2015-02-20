exports.tracecompare = tracecompare;

function tracecompare(path) {
  var tracecompare = {
  };

  // Formatters.
  var formatNumber = d3.format(',d');

  // Constants.
  var kMetricNames = {
    'a': 'duration',
    'b': 'timestamp',
    'c': 'unknown',
    'd': 'vertical',
    'e': 'run',
    'f': 'interrupted',
    'g': 'wait-cpu',
    'h': 'wait-blocked',
    'i': 'timer',
    'j': 'network',
    'k': 'block-device',
    'l': 'user-input'
  };
  var kNumFilters = 2;
  var kNumBuckets = 50;
  var kBarWidth = 10;
  var kEpsilon = 1;
  var kChartTitleMaxLength = 20;

  // Available metrics with their min/max value.
  var metricsDict = {};

  // Filters, dimensions and groups.
  var filters = new Array();
  var dimensionNames = {};
  var dimensions = new Array();
  var groups = new Array();
  var groupAll = new Array();

  // Charts.
  var chartsDict = {};

  // Flame graph.
  var flameGraph;

  // Stacks.
  var stacks;

  // Load data.
  d3.json(path, function(error, data) {

    // Save stacks and executions.
    stacks = data.stacks;

    // Find available metrics and compute their min/max value.
    var metricsArray = new Array();
    var isFirst = true;
    data.executions.forEach(function(d) {
      // Traverse metrics.
      ForEachProperty(d, function(property) {
        if (property == 'samples')
          return;

        // Convert the metric value in usec.
        d[property] = Math.floor(NanoToMicro(d[property]));

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

      // Traverse stacks.
      ForEachProperty(stacks, function(property, stack) {
        var executionValue = d.samples[property];
        if (executionValue == undefined)
        {
          executionValue = 0;
        }
        else
        {
          executionValue = Math.floor(NanoToMicro(executionValue));
          d.samples[property] = executionValue;
        }

        if (!isFirst)
        {
          stack.min = Math.min(executionValue, stack.min);
          stack.max = Math.max(executionValue, stack.max);
        }
        else
        {
          stack.min = executionValue;
          stack.max = executionValue;
        }
      });
      isFirst = false;
    });

    // Create filters and empty arrays to hold dimensions and groups.
    for (var i = 0; i < kNumFilters; ++i)
    {
      filters.push(crossfilter(data.executions));
      dimensions.push({});
      groups.push({});

      groupAll.push(filters[i].groupAll());
      groupAll[i].reduce(ReduceAdd, ReduceRemove, ReduceInitial);
    }

    // Create buttons to add metric charts.
    var metricButtonsData = d3.selectAll('#metric-selector')
      .selectAll('li')
      .data(metricsArray, function(metric) { return metric.id; });
    var metricButtons = metricButtonsData.enter().append('li');
    metricButtons.text(function(metric) { return metric.name; });
    metricButtons.attr('id', function(metric) {
      return 'metric-selector-' + metric.id;
    });
    metricButtons.on('click', function(metric) {
      CreateMetricDimension(metric.id, 'linear');
    });
    metricButtonsData.exit().remove();

    // Show the totals.
    d3.selectAll('#total-left').text(formatNumber(data.executions.length));
    d3.selectAll('#total-right').text(formatNumber(data.executions.length));

    // Create the flame graph.
    flameGraph = FlameGraph(data.stacks, CreateStackDimension);

    // Zoom button.
    d3.selectAll('#zoom').on('click', function() {
      flameGraph.UpdateCounts(groupAll[0].value(),
                              groupAll[1].value(),
                              true);
    });

    // Render.
    RenderAll();
  });

  // Create a scale for a dimension.
  // @param scaleName 'linear' or 'log'.
  // @param min The minimum value of the dimension.
  // @param max The maximum value of the dimension.
  // @returns An array with the bucket size and the d3 scale.
  function CreateScale(scaleName, min, max)
  {
    var bucketSize, scale;
    if (scaleName == 'linear')
    {
      var tmpBucketSize = (max - min) / kNumBuckets;
      var chartMin = min - tmpBucketSize;
      var chartMax = max + tmpBucketSize;
      bucketSize = (chartMax - chartMin) / kNumBuckets;

      scale = d3.scale.linear()
          .domain([chartMin, chartMax])
          .rangeRound([0, kBarWidth * kNumBuckets]);
    }
    else if (scaleName == 'log')
    {
      var chartMin = Math.max(kEpsilon, min);
      var chartMax = max;

      bucketSize = (chartMax - chartMin) / kNumBuckets;

      scale = d3.scale.log()
          .clamp(true)
          .domain([chartMin, chartMax])
          .rangeRound([0, kBarWidth * kNumBuckets]);
    }
    return [bucketSize, scale];
  }

  // Return the function that computes the group for a metric value.
  function GetGroupFunction(bucketSize, scaleName, scale)
  {
    return function(metricValue) {
      if (scaleName == 'linear')
      {
        return Math.floor(metricValue / bucketSize) * bucketSize;
      }
      else
      {
        metricValue = Math.max(kEpsilon, metricValue);
        return scale.invert(
            Math.floor(scale(metricValue) / kBarWidth) * kBarWidth);
      }
    }
  }

  // Creates a dimension for the specified metric.
  // @param metricId The id of the metric.
  // @param scaleName 'linear' or 'log'.
  // @returns The id of the created dimension.
  function CreateMetricDimension(metricId, scaleName)
  {
    var metric = metricsDict[metricId];

    // Check whether the dimension already exists.
    if (dimensions[0].hasOwnProperty(metricId))
      return metricId;

    // Create scale and compute bucket size.
    var scaleArray = CreateScale(scaleName, metric.min, metric.max);
    var bucketSize = scaleArray[0];
    var scale = scaleArray[1];

    // Create the dimension for each filter.
    for (var i = 0; i < kNumFilters; ++i)
    {
      var dimension = filters[i].dimension(function(execution) {
        var value = execution[metricId];
        if (value === undefined)
          value = 0;
        if (scaleName == 'linear')
          return value;
        return Math.max(kEpsilon, value);
      });
      var group = dimension.group(
          GetGroupFunction(bucketSize, scaleName, scale));
      dimensions[i][metricId] = dimension;
      groups[i][metricId] = group;
    }

    dimensionNames[metricId] = metric.name;

    // Hide the button used to add this dimension.
    d3.selectAll('#metric-selector-' + metricId).style('display', 'none');

    // Create the charts.
    CreateCharts(metricId, scaleName, scale);

    return metricId;
  }

  // Creates a dimension for the specified stack.
  // @param stackId the stack identifier.
  // @param scaleName 'linear' or 'log'.
  // @returns The id of the created dimension.
  function CreateStackDimension(stackId, scaleName)
  {
    var dimensionId = parseInt(stackId);

    // Check whether the dimension already exists.
    if (dimensions[0].hasOwnProperty(dimensionId))
      return dimensionId;

    // Get minimum and maximum value for this stack.
    var minValue = stacks[stackId].min;
    var maxValue = stacks[stackId].max;

    if (maxValue == 0)
    {
      alert('Cannot filter on this stack duration.');
      return -1;
    }

    // Create scale and compute bucket size.
    var scaleArray = CreateScale(scaleName, minValue, maxValue);
    var bucketSize = scaleArray[0];
    var scale = scaleArray[1];

    // Create the dimension for each filter.
    for (var i = 0; i < kNumFilters; ++i)
    {
      var dimension = filters[i].dimension(function(execution) {
        var value = execution.samples[stackId];
        if (value === undefined)
          value = 0;
        if (scaleName == 'linear')
          return value;
        return Math.max(kEpsilon, value);
      });
      var group = dimension.group(
          GetGroupFunction(bucketSize, scaleName, scale));
      dimensions[i][dimensionId] = dimension;
      groups[i][dimensionId] = group;
    }

    dimensionNames[dimensionId] =
        ElideString(stacks[stackId].f, kChartTitleMaxLength);

    // Create the charts.
    CreateCharts(dimensionId, scaleName, scale);

    return dimensionId;
  }

  // Creates charts for the specified dimension.
  // @param dimensionId The id of the dimension
  // @param scaleName 'linear' or 'log'.
  // @param scale A d3 scale.
  function CreateCharts(dimensionId, scaleName, scale)
  {
    // Check whether the chart already exists.
    if (chartsDict.hasOwnProperty(dimensionId))
      return;

    var name = dimensionNames[dimensionId];

    // Create the charts.
    var dimensionCharts = new Array();
    for (var i = 0; i < kNumFilters; ++i)
    {
      dimensionCharts.push(barChart()
        .dimension(dimensions[i][dimensionId])
        .group(groups[i][dimensionId])
        .x(scale));
    }

    chartsDict[dimensionId] = {
      id: dimensionId,
      name: name,
      charts: dimensionCharts
    };

    ShowCharts(chartsDict, scaleName);
  }

  // Removes a dimension.
  // @param dimensionId The id of the dimension to remove.
  function RemoveDimension(dimensionId)
  {
    // Remove charts.
    delete chartsDict[dimensionId];

    // Remove dimension name.
    delete dimensionNames[dimensionId];

    for (var i = 0; i < kNumFilters; ++i)
    {
      // Remove groups.
      groups[i][dimensionId].dispose();
      delete groups[i][dimensionId];

      // Remove dimensions.
      dimensions[i][dimensionId].dispose();
      delete dimensions[i][dimensionId];
    }

    // Show the button that can re-enable this dimension.
    // Note: the button only exists if its a metric dimension.
    d3.selectAll('#metric-selector-' + dimensionId).style('display', null);

    // Update the page.
    ShowCharts(chartsDict);
  }

  // Renders the specified chart.
  function Render(method)
  {
    d3.select(this).call(method);
  }

  // Renders all the elements of the page.
  function RenderAll()
  {
    // Render charts.
    d3.selectAll('div.chart').each(Render);

    // Render flame graph.
    flameGraph.UpdateCounts(groupAll[0].value(),
                            groupAll[1].value(),
                            false);

    // Render number of selected executions per group.
    d3.selectAll('#active-left').text(formatNumber(groupAll[0].value().total));
    d3.selectAll('#active-right').text(formatNumber(groupAll[1].value().total));
  }

  // Inserts in the page the charts from the provided dictionary.
  // @param charts Dictionary of charts.
  // @param scaleName 'linear' or 'log'.
  function ShowCharts(charts, scaleName)
  {
    var chartsArray = new Array();
    ForEachProperty(charts, function(chartKey, chart) { chartsArray.push(chart); });

    var chartContainersData = d3.selectAll('#charts').selectAll('div.chart-container')
      .data(chartsArray, function(chart) { return chart.id; });
    var chartContainersEnter = chartContainersData
      .enter()
      .append('div')
      .attr('class', 'chart-container');

    // Create title.
    var title = chartContainersEnter.append('div').attr('class', 'chart-title');
    title.append('span').text(function(chart) { return chart.name; });
    title.append('a')
      .text('Remove')
      .attr('href', '#')
      .on('click', function(chart) { RemoveDimension(chart.id); });
    title.append('a')
      .text(function() {
        if (scaleName == 'log')
          return 'Linear';
        else
          return 'Log';
      })
      .attr('href', '#')
      .on('click', function(chart) {
        RemoveDimension(chart.id);
        if (scaleName == 'linear')
        {
          if (typeof(chart.id) == "string")
            CreateMetricDimension(chart.id, 'log');
          else
            CreateStackDimension(chart.id, 'log');
        }
        else
        {
          if (typeof(chart.id) == "string")
            CreateMetricDimension(chart.id, 'linear');
          else
            CreateStackDimension(chart.id, 'linear');
        }
      });

    // Create charts.
    var chartsDivData = chartContainersEnter.selectAll('div.chart')
      .data(function(chart) { return chart.charts; });
    chartsDivData
      .enter()
      .append('div')
      .attr('class', 'chart')
      .each(function(chart) { chart.on("brush", RenderAll).on("brushend", RenderAll); });

    // Remove extra chart containers.
    chartContainersData.exit().remove();
    chartContainersData.order();

    // Render.
    RenderAll();
  }

  // Reduce add function.
  function ReduceAdd(p, execution) {
    p.total += 1;

    ForEachProperty(execution.samples, function(stackId, count) {
      p.samples[stackId] += count;
    });

    return p;
  }

  // Reduce remove function.
  function ReduceRemove(p, execution) {
    p.total -= 1;

    ForEachProperty(execution.samples, function(stackId, count) {
      p.samples[stackId] -= count;
    });

    return p;
  }

  // Reduce initial function.
  function ReduceInitial() {
    r = {total: 0, samples: {}};

    ForEachProperty(stacks, function(stackId) {
      r.samples[stackId] = 0;
    });

    return r;
  }

  return tracecompare;
}
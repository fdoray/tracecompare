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
    'l': 'user-input',
    'p0': 'instructions',
    'p1': 'cache-references',
    'p2': 'cache-misses',
    'p3': 'branch-instructions',
    'p4': 'branches',
    'p5': 'branch-misses',
    'p6': 'L1-dcache-loads',
    'p7': 'L1-dcache-load-misses',
    'p8': 'L1-dcache-stores',
    'p9': 'L1-dcache-store-misses',
    'p10': 'L1-dcache-prefetches',
    'p11': 'L1-dcache-prefetch-misses',
    'p12': 'L1-icache-loads',
    'p13': 'L1-icache-load-misses',
    'p14': 'L1-icache-stores',
    'p15': 'L1-icache-store-misses',
    'p16': 'L1-icache-prefetches',
    'p17': 'L1-icache-prefetch-misses',
    'p18': 'LLC-loads',
    'p19': 'LLC-load-misses',
    'p20': 'LLC-stores',
    'p21': 'LLC-store-misses',
    'p22': 'LLC-prefetches',
    'p23': 'LLC-prefetch-misses',
    'p24': 'dTLB-loads',
    'p25': 'perf:thread:dTLB-load-misses',
    'p26': 'dTLB-stores',
    'p27': 'dTLB-store-misses',
    'p28': 'dTLB-prefetches',
    'p29': 'dTLB-prefetch-misses',
    'p30': 'iTLB-loads',
    'p31': 'iTLB-load-misses',
    'p32': 'branch-loads',
    'p33': 'branch-load-misses',
    'p34': 'cpu-clock',
    'p35': 'task-clock',
    'p36': 'page-fault',
    'p37': 'faults',
    'p38': 'major-faults',
    'p39': 'minor-faults',
    'p40': 'context-switches',
    'p41': 'cs',
    'p42': 'cpu-migrations',
    'p43': 'migrations',
    'p44': 'alignment-faults',
    'p45': 'emulation-faults',
  };
  var kDurationMetricId = 'a';
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
  var dummyDimensions = new Array();

  // Charts.
  var chartsDict = {};

  // Flame graph.
  var flameGraph;

  // Table.
  var table;

  // Stacks.
  var stacks;

  // Load data.
  d3.json(path, function(error, data) {

    // Save stacks.
    stacks = data.stacks;

    var metricsArray = new Array();
    data.executions.forEach(function(execution) {
      // Traverse metrics to find the min/max values.
      ForEachProperty(execution, function(metricId, metricValue) {
        if (metricId == 'samples')
          return;

        if (metricsDict.hasOwnProperty(metricId))
        {
          // The metric has already been seen in other executions.
          var metric = metricsDict[metricId];
          metric.min = Math.min(metric.min, metricValue);
          metric.max = Math.max(metric.max, metricValue);
        }
        else
        {
          // This is the first time that this metric is encountered.
          var metric = {
            'id': metricId,
            'name': kMetricNames[metricId],
            'min': metricValue,
            'max': metricValue
          };
          metricsDict[metricId] = metric;
          metricsArray.push(metric);
        }
      });

      // Traverse stacks to find the min/max values.
      ForEachProperty(execution.samples, function(stackId, duration) {
        var stack = stacks[stackId];

        if (stack.hasOwnProperty('min'))
        {
          stack.min = Math.min(stack.min, duration);
          stack.max = Math.max(stack.max, duration);
          ++stack.count;
        }
        else
        {
          stack.min = duration;
          stack.max = duration;
          stack.count = 1;
        }
      });
    });

    // Set the minimum value to zero for stacks that don't appear in all
    // executions.
    ForEachProperty(stacks, function(stackId, stack) {
      if (stack.count != data.executions.length)
        stack.min = 0;
      delete stack.count;
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

    // Create dummy dimensions that allow us to get all executions included
    // in the current filters, sorted by duration.
    for (var i = 0; i < kNumFilters; ++i)
    {
      dummyDimensions.push(filters[i].dimension(function(execution) {
        return execution[kDurationMetricId];
      }));
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
    flameGraph = FlameGraph(
        data.stacks, dummyDimensions[0], ClickStackCallback);

      // Create the flame graph zoom button.
    d3.selectAll('#zoom').on('click', function() {
      flameGraph.UpdateCounts(groupAll[1].value(), true);
    });

    // Create the unfocus button.
    d3.selectAll('#unfocus').on('click', function() {
      flameGraph.Unfocus();
      d3.selectAll('#unfocus').style('display', 'none');
    });

    // Resize flame graph when window is resized.
    window.onresize = function() {
      flameGraph.UpdateCounts(groupAll[1].value(), true);
    };

    // Create the table.
    table = d3.selectAll('#executions-table').data([function(tbody) {
      return Table(tbody, dummyDimensions[1]);
    }]);

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
      if (tmpBucketSize < 1)
        tmpBucketSize = 1;

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
  // @param bucketSize Size of the buckets.
  // @param scaleName 'log' or 'linear'
  // @param scale The d3 scale.
  // @returns the function that computes the group for a metric value.
  function GetGroupFunction(bucketSize, scaleName, scale)
  {
    if (scaleName == 'linear')
    {
      return function(metricValue) {
        return Math.floor(metricValue / bucketSize) * bucketSize;
      }
    }
    else
    {
      return function(metricValue) {
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

    if (maxValue == 0 || maxValue === undefined)
    {
      console.log('Cannot filter on this stack duration.');
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

    dimensionNames[dimensionId] = stacks[stackId].f;

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
      dimensionCharts.push(barChart(BarChartSelectionChanged)
        .dimension(dimensions[i][dimensionId])
        .group(groups[i][dimensionId])
        .x(scale));
    }

    chartsDict[dimensionId] = {
      id: dimensionId,
      name: name,
      charts: dimensionCharts,
      scaleName: scaleName,
    };

    ShowCharts(chartsDict);
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

    // Update the colors.
    BarChartSelectionChanged();

    // Update the charts.
    ShowCharts(chartsDict);
  }

  // Called when the selection of a bar chart changes.
  // Updates the colors of the stacks.
  function BarChartSelectionChanged()
  {
    flameGraph.UpdateColors(groupAll[0].value(),
                            groupAll[1].value(),
                            dummyDimensions[0].top(Infinity));
  }

  // Called when the user clicks on a stack in the flame graph.
  // @param stackId The identifier of the clicked stack.
  // @param duration The duration of this callstack.
  function ClickStackCallback(stackId, duration)
  {
    d3.selectAll('#selected-function').style('display', null);
    d3.selectAll('#selected-function-name').text(
      stacks[stackId].f + ' - ' + duration + ' μs');
    d3.selectAll('#selected-function-filter').on('click', function() {
      CreateStackDimension(stackId, 'linear');
    });
    d3.selectAll('#selected-function-focus').on('click', function() {
      flameGraph.FocusOnStack(stackId);
      d3.selectAll('#unfocus').style('display', null);
    });
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
    flameGraph.UpdateCounts(groupAll[1].value(), false);

    // Render table.
    table.each(Render);

    // Render number of selected executions per group.
    d3.selectAll('#active-left').text(formatNumber(groupAll[0].value().total));
    d3.selectAll('#active-right').text(formatNumber(groupAll[1].value().total));
  }

  // Inserts in the page the charts from the provided dictionary.
  // @param charts Dictionary of charts.
  function ShowCharts(charts)
  {
    var chartsArray = new Array();
    ForEachProperty(charts, function(chartKey, chart) { chartsArray.push(chart); });

    var chartContainersData = d3.selectAll('#charts').selectAll('div.chart-container')
      .data(chartsArray, function(chart) { return chart.id; });
    var chartContainersEnter = chartContainersData
      .enter()
      .append('div')
      .attr('class', 'chart-container');

    // Create titles.
    var title = chartContainersEnter.append('div').attr('class', 'chart-title');
    title.append('span').text(function(chart) {
      return ElideString(chart.name, kChartTitleMaxLength);
    });
    title.append('a')
      .text('Remove')
      .attr('href', 'javascript:void(0)')
      .on('click', function(chart) { RemoveDimension(chart.id); });
    title.append('a')
      .text(function(chart) {
        if (chart.scaleName == 'log')
          return 'Linear';
        else
          return 'Log';
      })
      .attr('href', 'javascript:void(0)')
      .on('click', function(chart) {
        RemoveDimension(chart.id);
        if (chart.scaleName == 'linear')
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
      .each(function(chart) {
        chart.on("brush", RenderAll).on("brushend", RenderAll);
      });

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

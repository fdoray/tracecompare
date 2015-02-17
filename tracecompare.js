(function(exports){
tracecompare.version = "1.0.0";
function barChart() {
  if (!barChart.id) barChart.id = 0;
  var margin = {top: 10, right: 10, bottom: 20, left: 10},
      x,
      y = d3.scale.linear().range([100, 0]),
      id = barChart.id++,
      axis = d3.svg.axis().orient("bottom"),
      brush = d3.svg.brush(),
      brushDirty,
      dimension,
      group,
      round;
  function chart(div) {
    var width = x.range()[1],
        height = y.range()[0];
    y.domain([0, group.top(1)[0].value]);
    div.each(function() {
      var div = d3.select(this),
          g = div.select("g");
      // Create the skeletal chart.
      if (g.empty()) {
        g = div.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
          .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
        g.append("clipPath")
            .attr("id", "clip-" + id)
          .append("rect")
            .attr("width", width)
            .attr("height", height);
        g.selectAll(".bar")
            .data(["background", "foreground"])
          .enter().append("path")
            .attr("class", function(d) { return d + " bar"; })
            .datum(group.all());
        g.selectAll(".foreground.bar")
            .attr("clip-path", "url(#clip-" + id + ")");
        g.append("g")
            .attr("class", "axis")
            .attr("transform", "translate(0," + height + ")")
            .call(axis);
        // Initialize the brush component with pretty resize handles.
        var gBrush = g.append("g").attr("class", "brush").call(brush);
        gBrush.selectAll("rect").attr("height", height);
        gBrush.selectAll(".resize").append("path").attr("d", resizePath);
      }
      // Only redraw the brush if set externally.
      if (brushDirty) {
        brushDirty = false;
        g.selectAll(".brush").call(brush);
        if (brush.empty()) {
          g.selectAll("#clip-" + id + " rect")
              .attr("x", 0)
              .attr("width", width);
        } else {
          var extent = brush.extent();
          g.selectAll("#clip-" + id + " rect")
              .attr("x", x(extent[0]))
              .attr("width", x(extent[1]) - x(extent[0]));
        }
      }
      g.selectAll(".bar").attr("d", barPath);
    });
    function barPath(groups) {
      var path = [],
          i = -1,
          n = groups.length,
          d;
      console.log(groups)
      while (++i < n) {
        d = groups[i];
        path.push("M", x(d.key), ",", height, "V", y(d.value), "h9V", height);
      }
      return path.join("");
    }
    function resizePath(d) {
      var e = +(d == "e"),
          x = e ? 1 : -1,
          y = height / 3;
      return "M" + (.5 * x) + "," + y
          + "A6,6 0 0 " + e + " " + (6.5 * x) + "," + (y + 6)
          + "V" + (2 * y - 6)
          + "A6,6 0 0 " + e + " " + (.5 * x) + "," + (2 * y)
          + "Z"
          + "M" + (2.5 * x) + "," + (y + 8)
          + "V" + (2 * y - 8)
          + "M" + (4.5 * x) + "," + (y + 8)
          + "V" + (2 * y - 8);
    }
  }
  brush.on("brush.chart", function() {
    var g = d3.select(this.parentNode),
        extent = brush.extent();
    if (round) g.select(".brush")
        .call(brush.extent(extent = extent.map(round)))
      .selectAll(".resize")
        .style("display", null);
    g.select("#clip-" + id + " rect")
        .attr("x", x(extent[0]))
        .attr("width", x(extent[1]) - x(extent[0]));
    dimension.filterRange(extent);
  });
  brush.on("brushend.chart", function() {
    if (brush.empty()) {
      var div = d3.select(this.parentNode.parentNode.parentNode);
      div.select("#clip-" + id + " rect").attr("x", null).attr("width", "100%");
      dimension.filterAll();
    }
  });
  chart.margin = function(_) {
    if (!arguments.length) return margin;
    margin = _;
    return chart;
  };
  chart.x = function(_) {
    if (!arguments.length) return x;
    x = _;
    axis.scale(x);
    brush.x(x);
    return chart;
  };
  chart.y = function(_) {
    if (!arguments.length) return y;
    y = _;
    return chart;
  };
  chart.dimension = function(_) {
    if (!arguments.length) return dimension;
    dimension = _;
    return chart;
  };
  chart.filter = function(_) {
    if (_) {
      brush.extent(_);
      dimension.filterRange(_);
    } else {
      brush.clear();
      dimension.filterAll();
    }
    brushDirty = true;
    return chart;
  };
  chart.group = function(_) {
    if (!arguments.length) return group;
    group = _;
    return chart;
  };
  chart.round = function(_) {
    if (!arguments.length) return round;
    round = _;
    return chart;
  };
  return d3.rebind(chart, brush, "on");
}
function FlameGraph(stacks)
{
  var FlameGraph = {
    UpdateCounts: UpdateCounts
  };

  // Constants.
  var kTextYOffset = 15;
  var kLineHeight = 20;
  var kFlameGraphWidth = 1516;
  var kTextPadding = 5;
  var kCharacterWidth = 10;

  // Scale factor.
  var scaleFactor = 0;

  // Colors.
  var kRed = 238;
  var kGreen = 238;

  // Flame graph container.
  var container = d3.selectAll('#flamegraph');

  // Stacks at the bottom of the flame graph.
  var bottomStacks = new Array();

  function Init()
  {
    var stackArray = new Array();

    // Add an array of children to each stack and find
    // stacks that are at the bottom of the flame graph.
    ForEachProperty(stacks, function(stackId, stack) {
      if (stack.b == 0)
        bottomStacks.push(stack);
      stack.children = new Array();
      stack.id = stackId;
      stackArray.push(stack);
    });

    // Fill the array of children of each stack.
    ForEachProperty(stacks, function(stackId, stack) {
      if (stack.b == 0)
        return;
      stacks[stack.b].children.push(stackId);
    });

    // Create the DOM element for each stack.
    var gData = container.selectAll('g')
      .data(stackArray, function(stack) { return stack.id; });
    var gEnter = gData.enter().append('g')
      .attr('class', 'stack');
    gEnter.append('rect')
      .attr('height', 20)
      .attr('width', 200)
      .attr('rx', 2)
      .attr('ry', 2);
    gEnter.append('text')
      .attr('x', 10)
      .attr('y', 15)
      .text(function(stack) { return stack.f; });

    // Compute the depth of each stack.
    var maxDepth = 0;
    function ComputeDepthRecursive(depth, stack)
    {
      stack.children.forEach(function(childStackId) {
        var child = stacks[childStackId];
        child.depth = depth;
        ComputeDepthRecursive(depth + 1, child);
        maxDepth = Math.max(maxDepth, depth + 1);
      });
    }
    bottomStacks.forEach(function(stack) {
      stack.depth = 0;
      ComputeDepthRecursive(1, stack);
    });

    // Set the height of the SVG.
    var svgHeight = (maxDepth + 1) * kLineHeight;
    container.style('height', '' + svgHeight + 'px');

    // Set the y position of each stack DOM element.
    container.selectAll('g.stack').each(function(stack) {
      var y = svgHeight - (stack.depth + 1) * kLineHeight;
      var g = d3.select(this);
      g.selectAll('rect').attr('y', y);
      g.selectAll('text').attr('y', y + kTextYOffset);
    })
  }
  Init();

  // Updates the counts for each stack.
  function UpdateCounts(leftCounts, rightCounts, updateScale)
  {
    // Always update the scale the first time.
    if (scaleFactor == 0)
      updateScale = true;

    // Hide the flame graph if the right group is empty.
    if (rightCounts.total == 0)
    {
      container.style('display', 'none');
      return;
    }
    else
    {
      container.style('display', null);
    }

    // Compute inclusive count for each stack.
    var leftInclusiveCounts = {};
    var rightInclusiveCounts = {};
    function ComputeWidth(stackId)
    {
      var leftCount = leftCounts.samples[stackId] / leftCounts.total;
      var rightCount = rightCounts.samples[stackId] / rightCounts.total;

      stacks[stackId].children.forEach(function(childStackId) {
        var counts = ComputeWidth(childStackId);
        leftCount += counts[0];
        rightCount += counts[1];
      });

      leftInclusiveCounts[stackId] = leftCount;
      rightInclusiveCounts[stackId] = rightCount;

      return [leftCount, rightCount];
    }
    bottomStacks.forEach(function(stack) {
      ComputeWidth(stack.id);
    });

    // Compute the total count for the bottom stacks.
    var bottomCount = 0;
    bottomStacks.forEach(function(stack) {
      bottomCount += rightInclusiveCounts[stack.id];
    });

    if (!updateScale && bottomCount * scaleFactor >= kFlameGraphWidth)
      updateScale = true;
    if (updateScale)
      scaleFactor = kFlameGraphWidth / bottomCount;

    // Compute the width and color of each stack.
    var widths = {};
    var colors = {};
    ForEachProperty(stacks, function(stackId) {
      // Compute the width.
      widths[stackId] = Math.floor(
        rightInclusiveCounts[stackId] * scaleFactor);

      // Compute the color.
      var left = leftCounts.samples[stackId] / leftCounts.total;
      var right = rightCounts.samples[stackId] / rightCounts.total;

      // TODO: Improve this algorithm.
      var maxColor = 20000000;
      if (left < right)
      {
        // Red.
        var intensity = Math.floor(Math.min(
          kRed, kRed * (right - left) / maxColor));
        colors[stackId] = [kRed, kRed - intensity, kRed - intensity];
      }
      else
      {
        // Green.
        var intensity = Math.floor(Math.min(
          kGreen, kGreen * (left - right) / maxColor));
        colors[stackId] = [kGreen - intensity, kGreen, kGreen - intensity];
      }
    });

    // Compute the x of each stack.
    var xs = {};
    function ComputeX(x, stackId)
    {
      xs[stackId] = x;
      stacks[stackId].children.forEach(function(childStackId) {
        ComputeX(x, childStackId);
        x += widths[childStackId];
      });
    }
    var x = 0;
    bottomStacks.forEach(function(stack) {
      ComputeX(x, stack.id);
      x += widths[stack.id];
    });

    // Set the width and x position of each stack.
    var groups = container.selectAll('g.stack').transition();
    groups.selectAll('text')
      .attr('x', function(stack) {
        return xs[stack.id] + kTextPadding;
      })
      .attr('width', function(stack) {
        return widths[stack.id] - kTextPadding;
      })
      .text(function(stack) {
        var width = widths[stack.id];
        var numVisibleCharacters = width / kCharacterWidth;
        if (stack.f.length <= numVisibleCharacters)
          return stack.f;

        if (numVisibleCharacters <= 1)
          return '';
        if (numVisibleCharacters == 2)
          return stack.f.substr(0, 1) + '.';

        return stack.f.substr(0, numVisibleCharacters) + '..';
      });
    groups.selectAll('rect')
      .attr('x', function(stack) { return xs[stack.id]; })
      .attr('width', function(stack) { return widths[stack.id]; })
      .style('fill', function(stack) {
        var color = colors[stack.id];
        return 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
      });
  }

  return FlameGraph;
}
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

  // Available metrics with their min/max value.
  var metricsDict = {};

  // Filters, dimensions and groups.
  var filters = new Array();
  var dimensionsProperties = {};
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

    // Save stacks.
    stacks = data.stacks;

    // Find available metrics and compute their min/max value.
    var metricsArray = new Array();
    data.executions.forEach(function(d) {
      ForEachProperty(d, function(property) {
        if (property == 'samples')
          return;

        d[property] = d[property] / 1000;

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
    flameGraph = FlameGraph(data.stacks);

    // Zoom button.
    d3.selectAll('#zoom').on('click', function() {
      flameGraph.UpdateCounts(groupAll[0].value(),
                              groupAll[1].value(),
                              true);
    });

    // Render.
    RenderAll();
  });

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

    // Compute bucket size.
    var bucketSize, scale;
    if (scaleName == 'linear')
    {
      var tmpBucketSize = (metric.max - metric.min) / kNumBuckets;
      var chartMin = metric.min - tmpBucketSize;
      var chartMax = metric.max + tmpBucketSize;
      bucketSize = (chartMax - chartMin) / kNumBuckets;

      scale = d3.scale.linear()
          .domain([chartMin, chartMax])
          .rangeRound([0, 10 * kNumBuckets]);
    }
    else if (scaleName == 'log')
    {
      chartMin = metric.min;
      chartMax = metric.max;
      bucketSize = (chartMax - chartMin) / kNumBuckets;

      scale = d3.scale.log()
          .domain([chartMin, chartMax])
          .rangeRound([0, 10 * kNumBuckets]);
    }

    // Create the dimension for each filter.
    for (var i = 0; i < kNumFilters; ++i)
    {
      var dimension = filters[i].dimension(function(execution) {
        return execution[metricId];
      });
      var group = dimension.group(function(metricValue) {
        if (scaleName == 'linear')
          return Math.floor(metricValue / bucketSize) * bucketSize;
        else
          return scale.invert(Math.floor(scale(metricValue) / 10) * 10);
      });
      dimensions[i][metricId] = dimension;
      groups[i][metricId] = group;
    }

    dimensionsProperties[metricId] = {
      name: metric.name,
      min: metric.min,
      max: metric.max
    };

    // Hide the button used to add this dimension.
    d3.selectAll('#metric-selector-' + metricId).style('display', 'none');

    // Create the charts.
    CreateCharts(metricId, scaleName, scale);

    return metricId;
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

    var dimensionProperties = dimensionsProperties[dimensionId];

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
      name: dimensionProperties.name,
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

    // Remove dimension properties.
    delete dimensionsProperties[dimensionId];

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
          CreateMetricDimension(chart.id, 'log');
        else
          CreateMetricDimension(chart.id, 'linear');
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
}// Iterates through the properties of an object.
// @param obj The object to iterate.
// @param callback The callback.
function ForEachProperty(obj, callback)
{
  for (var property in obj)
  {
    if (obj.hasOwnProperty(property))
      callback(property, obj[property]);
  }
}
})(typeof exports !== 'undefined' && exports || this);

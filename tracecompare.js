(function(exports){
tracecompare.version = "1.0.0";
// The barChart function is highly inspired from the Crossfilter sample
// available at http://square.github.io/crossfilter/
function barChart(callback) {
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
    callback();
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
function FlameGraph(stacks, leftDimension, clickStackCallback)
{
  var FlameGraph = {
    UpdateCounts: UpdateCounts,
    UpdateColors: UpdateColors,
    FocusOnStack: FocusOnStack,
    Unfocus: Unfocus,
  };

  // Constants.
  var kTextYOffset = 15;
  var kLineHeight = 20;
  var kCornerRadius = 2;
  var kMargin = 31;
  var kTextPadding = 5;
  var kCharacterWidth = 10;

  // Scale factor.
  var scaleFactor = 0;

  // Maximum stack depth.
  var maxDepth;

  // Colors.
  var colors = {};
  var kIntensity = 238;
  var kNeutralColor = [kIntensity, kIntensity, kIntensity];
  var kSdMinColor = 1.0;
  var kSdMaxColor = 3.0;

  // Refresh period.
  var kRefreshPeriod = 20;

  // Stacks at the bottom of the flame graph.
  var bottomStacks = new Array();
  var bottomStacksBackup;

  // Flame graph container.
  var container = d3.selectAll('#flamegraph');

  // Indicates whether a view refresh has been scheduled.
  var refreshScheduled = false;

  // Version of the flame graph (incremented when there is a zoom
  // on a stack).
  var version = 0;

  // Backup of the right counts.
  var rightCountsBackup;

  // Width of the rendered function names.
  var computedTextLength = {};

  // Set the height of the SVG and the y position of each stack.
  // @param bottomDepth Depth of the stack at the bottom of the SVG.
  function InitY(bottomDepth)
  {
    // Set the height of the SVG.
    var tmpMaxDepth = maxDepth - bottomDepth;
    var svgHeight = (tmpMaxDepth + 1) * kLineHeight;
    container.style('height', '' + svgHeight + 'px');

    // Set the y position of each stack DOM element.
    container.selectAll('g.stack').each(function(stack) {
      var y = svgHeight - (stack.depth + 1) * kLineHeight;
      var g = d3.select(this);
      g.selectAll('rect').attr('y', y);
      g.selectAll('text').attr('y', y + kTextYOffset);
    });
  }

  function Init()
  {
    var stackArray = new Array();

    // Add an array of children to each stack and find
    // stacks that are at the bottom of the flame graph.
    ForEachProperty(stacks, function(stackId, stack) {
      if (stack.b == 0)
        bottomStacks.push(stack);
      stack.children = new Array();
      stack.id = parseInt(stackId);
      stack.version = version;

      // Simplify function name.
      stack.f = stack.f.replace(/mongo::/g, '');

      stackArray.push(stack);
    });
    bottomStacksBackup = bottomStacks;

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
      .attr('height', kLineHeight)
      .attr('rx', kCornerRadius)
      .attr('ry', kCornerRadius)
      .on('click', function(stack) {
        yoda = rightCountsBackup;
        clickStackCallback(stack.id, rightCountsBackup.samples[stack.id]);
      });
    gEnter.append('text')
      .text(function(stack) {
        return stack.f;
      })
      .on('click', function(stack) {
        yoda = rightCountsBackup;
        clickStackCallback(stack.id, rightCountsBackup.samples[stack.id]);
      });

    // Compute the text length of each stack.
    container.selectAll('text').each(function(stack) {
      computedTextLength[stack.id] = this.getComputedTextLength();
    });

    // Compute the depth of each stack.
    maxDepth = 0;
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

    InitY(0);
  }
  Init();

  // Update the scale of the flame graph.
  function UpdateScale(rightCounts, forceUpdateScale)
  {
    // Always update the scale the first time.
    if (scaleFactor == 0)
      forceUpdateScale = true;

    // Compute the width of the bottom stacks of the flame graph.
    var bottomCount = 0;
    bottomStacks.forEach(function(stack) {
      bottomCount += rightCounts.samples[stack.id];
    });
    bottomCount /= rightCounts.total;

    var flameGraphWidth = window.innerWidth - kMargin;
    if (forceUpdateScale || bottomCount * scaleFactor >= flameGraphWidth)
      scaleFactor = flameGraphWidth / bottomCount;
  }

  // Apply positions, widths and colors to the stacks of the flame graph.
  function ApplyAttributes(xs, widths)
  {
    container.selectAll('g')
      .attr('class', function(stack) {
        if (stack.version != version ||
            (widths[stack.id] < kCharacterWidth && stack.depth != 0))
        {
          return 'inv';
        }
        return 'vis';
      });

    var groups = container.selectAll('g.vis');

    groups.selectAll('text').transition()
      .attr('x', function(stack) {
        return xs[stack.id] + kTextPadding;
      })
      .attr('width', function(stack) {
        if (widths[stack.id] < kTextPadding)
          return 0;
        return widths[stack.id] - kTextPadding;
      })
      .text(function(stack) {
        var availableWidth = widths[stack.id] - kTextPadding;
        var textWidth = computedTextLength[stack.id];
        if (textWidth < availableWidth)
          return stack.f;
        var proportion = Math.max(0, (availableWidth / textWidth) - 0.01);
        var numChars = Math.floor(proportion * stack.f.length);
        return ElideString(stack.f, numChars);
      });
    groups.selectAll('rect').transition()
      .attr('x', function(stack) { return xs[stack.id]; })
      .attr('width', function(stack) { return widths[stack.id]; })
      .style('fill', function(stack) {
        var color = colors[stack.id];
        if (color === undefined)
          color = kNeutralColor;
        return 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
      });

    return true;
  }

  // Updates the counts for each stack.
  function UpdateCounts(rightCounts, forceUpdateScale)
  {
    rightCountsBackup = rightCounts;

    if (refreshScheduled)
      return;

    d3.timer(function() {
      rightCounts = rightCountsBackup;

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

      // Update the scale.
      UpdateScale(rightCounts, forceUpdateScale);

      // Compute the width of each stack.
      var widths = {};
      var multiplier = scaleFactor / rightCounts.total;
      ForEachProperty(stacks, function(stackId) {
        widths[stackId] = Math.floor(
            rightCounts.samples[stackId] * multiplier);
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

      // Apply widths, positions and colors.
      ApplyAttributes(xs, widths);

      // No more refresh scheduled.
      refreshScheduled = false;

      return true;

    }, kRefreshPeriod);

    refreshScheduled = true;
  }

  // Updates the colors.
  function UpdateColors(leftCounts, rightCounts, selectedLeft) {
    // Compute the left mean for each stack.
    var leftMeans = {};
    ForEachProperty(leftCounts.samples, function(stackId, count) {
      leftMeans[stackId] = count / leftCounts.total;
    });

    // Compute the standard deviation for each left stack.
    var leftSds = {};
    var leftSdsCounts = {};
    selectedLeft.forEach(function(execution) {
      ForEachProperty(execution.samples, function(stackId, count) {
        var delta = count - leftMeans[stackId];
        var leftSd = leftSds[stackId];
        if (leftSd === undefined)
          leftSd = 0;
        leftSds[stackId] = leftSd + (delta * delta);

        if (leftSdsCounts.hasOwnProperty(stackId))
          ++leftSdsCounts[stackId];
        else
          leftSdsCounts[stackId] = 1;
      });
    });

    if (selectedLeft.length != 0)
    {
      ForEachProperty(leftSds, function(stackId, sd) {
        var zeroDelta = leftSdsCounts[stackId] * leftMeans[stackId];
        sd += (zeroDelta * zeroDelta) *
            (selectedLeft.length - leftSdsCounts[stackId]);
        leftSds[stackId] = Math.sqrt(sd / selectedLeft.length);
      });
    }
    else
    {
      ForEachProperty(leftSds, function(stackId) {
        leftSds[stackId] = 0;
      });
    }

    // Compute the color for each stack.
    ForEachProperty(stacks, function(stackId) {
      // Left mean.
      var leftMean = leftMeans[stackId];
      if (leftMean === undefined)
        leftMean = 0;

      // Right mean.
      var rightMean = rightCounts.samples[stackId];
      if (rightMean === undefined)
        rightMean = 0;
      if (rightCounts.total != 0)
        rightMean /= rightCounts.total;

      // Difference of means.
      var meanDiff = rightMean - leftMean;
      var meanDiffSd = Infinity;
      var leftSd = leftSds[stackId];
      if (leftSd !== undefined)
        meanDiffSd = meanDiff / leftSd;

      // Color.
      var intensity = kIntensity *
          (Clamp(Math.abs(meanDiffSd), kSdMinColor, kSdMaxColor)
           - kSdMinColor) /
          (kSdMaxColor - kSdMinColor);

      if (meanDiff > 0)
      {
        // Red.
        colors[stackId] = [kIntensity,
                           kIntensity - intensity,
                           kIntensity - intensity];
      }
      else
      {
        // Green.
        colors[stackId] = [kIntensity - intensity,
                           kIntensity,
                           kIntensity - intensity];
      }
    });
  }

  // Focus on the stacks currently in the bottomStacks array.
  function FocusInternal(focusDepth)
  {
    // Update y positions.
    InitY(focusDepth);

    // Determine which elements must be visible.
    ++version;
    function SetVisibleElements(stack)
    {
      stack.version = version;
      stack.children.forEach(function(childStackId) {
        var child = stacks[childStackId];
        child.version = version;
        SetVisibleElements(child);
      });
    }
    bottomStacks.forEach(function(stack) {
      SetVisibleElements(stack);
    });

    // Update x positiions.
    UpdateCounts(rightCountsBackup, true);
  }

  // Focus on a stack.
  // @param stackId The identifier of the stack on which to zoom.
  function FocusOnStack(stackId)
  {
    var stack = stacks[stackId];
    bottomStacks = new Array(stack);
    FocusInternal(stack.depth);
  }

  // Cancel stack focus.
  function Unfocus()
  {
    bottomStacks = bottomStacksBackup;
    FocusInternal(0);
  }

  return FlameGraph;
}
var formatMicroseconds = d3.format('06d');

function Table(tbody, dimension)
{
  tbody.each(function() {
    var executionsSelect = tbody.selectAll(".execution-row")
        .data(dimension.top(20), function(execution) { return execution['b']; });
    var executionsEnter = executionsSelect.enter().append('tr')
      .attr('class', 'execution-row');

    executionsEnter.append('td')
      .text(function(execution) {
        // Timestamp.
        var timestamp = execution['b'];
        var date = new Date(timestamp / 1000);
        var microseconds = timestamp % 1000000;
        return date.toLocaleString() + '.' + formatMicroseconds(microseconds);
      });

    executionsEnter.append('td')
      .text(function(execution) {
        // Duration.
        var duration = execution['a'];
        return duration.toLocaleString() + ' μs';
      });

    executionsSelect.exit().remove();
    executionsSelect.order();
  });
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
// Iterates through the properties of an object.
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

// Elide a string so that is uses at most |numChar| characters.
// @param str The string to elide.
// @param numChar The maximum number of characters to keep.
// @returns The elided string.
function ElideString(str, numChar)
{
  if (str.length <= numChar)
    return str;

  if (numChar <= 1)
    return str.substr(0, 1);
  if (numChar == 2)
    return str.substr(0, 1) + '.';

  return str.substr(0, numChar) + '..';
}

// Clamp a number between 2 values.
// @param val Number to clamp.
// @param min Minimum allowed value.
// @param max Maximum allowed value.
// @returns Clamped value.
function Clamp(val, min, max)
{
  return Math.min(Math.max(val, min), max);
}
})(typeof exports !== 'undefined' && exports || this);

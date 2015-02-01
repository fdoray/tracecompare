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
exports.tracecompare = tracecompare;

function tracecompare(path) {
  var tracecompare = {
    CreateMetricDimension: CreateMetricDimension,
    CreateHistogram: CreateHistogram
  };

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

    yoda1 = histogramsDict;
    yoda2 = histograms;
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
      callback(property);
  }
}
})(typeof exports !== 'undefined' && exports || this);

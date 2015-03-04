function FlameGraph(stacks, leftDimension, clickStackCallback)
{
  var FlameGraph = {
    UpdateCounts: UpdateCounts,
    UpdateColors: UpdateColors,
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

  // Flame graph container.
  var container = d3.selectAll('#flamegraph');

  // Indicates whether a view refresh has been scheduled.
  var refreshScheduled = false;

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
      .attr('height', kLineHeight)
      .attr('rx', kCornerRadius)
      .attr('ry', kCornerRadius)
      .on('click', function(stack) {
        clickStackCallback(stack.id);
      });
    gEnter.append('text')
      .on('click', function(stack) {
        clickStackCallback(stack.id);
      });

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
    });
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
        if (widths[stack.id] < kCharacterWidth && stack.depth != 0)
          return 'inv';
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
        var width = widths[stack.id];
        var numVisibleCharacters = width / kCharacterWidth;
        return ElideString(stack.f, numVisibleCharacters);
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
  function UpdateCounts(leftCounts, rightCounts, forceUpdateScale)
  {
    if (refreshScheduled)
      return;

    d3.timer(function() {

      console.log('refreshing new');

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

  return FlameGraph;
}

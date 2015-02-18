function FlameGraph(stacks, createstackdimensionfn)
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
      .attr('height', 20)
      .attr('width', 200)
      .attr('rx', 2)
      .attr('ry', 2)
      .on('click', function(stack) {
        createstackdimensionfn(stack.id, 'linear');
      });
    gEnter.append('text')
      .attr('x', 10)
      .attr('y', 15)
      .text(function(stack) {
        return stack.f;
      })
      .on('click', function(stack) {
        createstackdimensionfn(stack.id, 'linear');
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
        if (widths[stack.id] < kTextPadding)
          return 0;
        return widths[stack.id] - kTextPadding;
      })
      .text(function(stack) {
        var width = widths[stack.id];
        var numVisibleCharacters = width / kCharacterWidth;
        return ElideString(stack.f, numVisibleCharacters);
      });
    groups.selectAll('rect')
      .attr('x', function(stack) { return xs[stack.id]; })
      .attr('width', function(stack) { return widths[stack.id]; })
      .style('fill', function(stack) {
        var color = colors[stack.id];
        return 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
      })
      .attr('class', function(stack) {
        if (widths[stack.id] == 0)
          return 'invisible';
        return '';
      });
  }

  return FlameGraph;
}
